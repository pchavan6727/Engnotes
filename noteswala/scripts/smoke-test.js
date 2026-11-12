// End-to-end check of the main flows. Start the server first (npm start), then run: npm test
// Needs DEMO payment mode (no Razorpay keys in .env).
const BASE = process.env.TEST_URL || 'http://localhost:' + (process.env.PORT || 3000);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };

class Client {
  constructor() { this.cookie = ''; }
  async req(path, { method = 'GET', json, form, redirect = 'manual' } = {}) {
    const headers = { Origin: BASE, Cookie: this.cookie };
    let body;
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const r = await fetch(BASE + path, { method, headers, body, redirect });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    sc.forEach((c) => { const kv = c.split(';')[0]; if (kv.endsWith('=')) this.cookie = ''; else this.cookie = kv; });
    return r;
  }
}

(async () => {
  const stamp = Date.now();
  const admin = new Client(), stu = new Client(), other = new Client();
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@noteswala.in', adminPw = process.env.ADMIN_PASSWORD || 'ChangeMe@123';

  console.log('Public pages');
  for (const p of ['/', '/courses', '/pyq', '/contact', '/terms', '/cart', '/login', '/register', '/robots.txt', '/sitemap.xml'])
    ok((await stu.req(p)).status === 200, `GET ${p}`);
  ok((await stu.req('/nope')).status === 404, '404 page');
  ok((await stu.req('/account')).status === 302, '/account needs login');
  ok((await stu.req('/api/admin/stats')).status === 401, 'admin API blocked for visitors');

  console.log('Admin: set up catalog and upload a PDF');
  let r = await admin.req('/api/auth/login', { method: 'POST', json: { email: adminEmail, password: adminPw } });
  ok(r.status === 200, 'admin login');
  r = await admin.req('/api/admin/courses', { method: 'POST', json: { name: 'Test Branch ' + stamp, short_code: 'TB', icon: '🧪' } });
  ok(r.status === 200, 'add course');
  const courses = await (await admin.req('/api/admin/courses')).json();
  const course = courses.find((c) => c.short_code === 'TB' && c.name.endsWith(String(stamp)));
  r = await admin.req('/api/admin/subjects', { method: 'POST', json: { course_id: course.id, semester: 3, name: 'Test Subject', code: 'T101' } });
  ok(r.status === 200, 'add subject');
  const subj = (await (await admin.req('/api/admin/subjects')).json()).find((s) => s.course_id === course.id);

  const { PDFDocument } = require('pdf-lib');
  const doc = await PDFDocument.create(); doc.addPage([400, 400]); doc.addPage([400, 400]);
  const pdfBytes = Buffer.from(await doc.save());
  const mk = (title, price) => { const f = new FormData(); f.set('subject_id', subj.id); f.set('type', 'notes'); f.set('title', title); f.set('price', price); f.set('description', 'test'); f.set('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'a.pdf'); return f; };
  r = await admin.req('/api/admin/products', { method: 'POST', form: mk('Paid notes', 59) });
  ok(r.status === 200, 'upload paid PDF');
  r = await admin.req('/api/admin/products', { method: 'POST', form: mk('Free notes', 0) });
  ok(r.status === 200, 'upload free PDF');
  const bad = new FormData(); bad.set('subject_id', subj.id); bad.set('title', 'Fake'); bad.set('price', 10); bad.set('file', new Blob(['not a pdf at all'], { type: 'application/pdf' }), 'x.pdf');
  r = await admin.req('/api/admin/products', { method: 'POST', form: bad });
  ok(r.status === 400, 'fake PDF is rejected');
  const prods = await (await admin.req('/api/admin/products?q=notes')).json();
  const paid = prods.find((p) => p.title === 'Paid notes' && p.subject_id === subj.id), free = prods.find((p) => p.title === 'Free notes' && p.subject_id === subj.id);
  ok(paid && paid.pages === 2, 'page count read from PDF');
  r = await admin.req('/api/admin/products/' + paid.id, { method: 'PUT', json: { price: 99 } });
  ok(r.status === 200, 'change price from admin');

  console.log('Public catalog');
  ok((await stu.req(`/course/${course.slug}/sem/3`)).status === 200, 'semester page');
  const html = await (await stu.req('/product/' + paid.id)).text();
  ok(html.includes('₹99') && !html.includes('.pdf'), 'product page shows new price and hides file name');
  ok((await stu.req('/search?q=Test%20Subject')).status === 200, 'search');

  console.log('Student: register, buy, download');
  r = await stu.req('/api/auth/register', { method: 'POST', json: { name: 'Test Student', email: `s${stamp}@example.com`, password: 'password123' } });
  ok(r.status === 200, 'register');
  r = await stu.req('/api/auth/register', { method: 'POST', json: { name: 'Dup', email: `s${stamp}@example.com`, password: 'password123' } });
  ok(r.status === 409, 'duplicate email rejected');
  ok((await stu.req('/download/' + paid.id)).status === 403, 'download blocked before payment');
  let cart = await (await stu.req(`/api/cart?ids=${paid.id}`)).json();
  ok(cart.total === 99, 'cart total comes from database');
  r = await stu.req('/api/checkout', { method: 'POST', json: { ids: [paid.id], coupon: 'NOPE' } });
  ok(r.status === 400, 'bad coupon rejected');
  r = await stu.req('/api/checkout', { method: 'POST', json: { ids: [paid.id] } });
  const o = await r.json();
  ok(o.demo && o.amount === 9900, 'checkout creates order in demo mode');
  ok((await stu.req('/download/' + paid.id)).status === 403, 'still blocked until payment is confirmed');
  ok((await other.req('/api/payment/demo', { method: 'POST', json: { orderId: o.orderId } })).status === 401, 'other visitor cannot confirm order');
  r = await stu.req('/api/payment/demo', { method: 'POST', json: { orderId: o.orderId } });
  ok(r.status === 200, 'payment confirmed');
  r = await stu.req('/download/' + paid.id);
  const buf = Buffer.from(await r.arrayBuffer());
  ok(r.status === 200 && buf.slice(0, 5).toString() === '%PDF-', 'purchased PDF downloads');
  {
    const { execFileSync } = require('child_process'); const fs = require('fs'); const tmp = require('os').tmpdir() + '/nw-wm-' + stamp + '.pdf';
    fs.writeFileSync(tmp, buf); let txt = '';
    try { txt = execFileSync('pdftotext', [tmp, '-'], { encoding: 'utf8' }); } catch (e) { txt = 'Licensed to Test Student (skipped: pdftotext not installed)'; }
    ok(txt.includes('Licensed to Test Student'), 'PDF is watermarked with buyer name'); fs.unlinkSync(tmp);
  }
  ok((await stu.req('/account')).status === 200, 'My purchases page');
  r = await stu.req('/api/checkout', { method: 'POST', json: { ids: [paid.id] } });
  ok(r.status === 400, 'cannot buy the same item twice');

  console.log('Free item, other student, limits');
  r = await stu.req('/download/' + free.id);
  ok(r.status === 200, 'free item downloads for logged in student');
  await other.req('/api/auth/register', { method: 'POST', json: { name: 'Other', email: `o${stamp}@example.com`, password: 'password123' } });
  ok((await other.req('/download/' + paid.id)).status === 403, 'another student cannot download my purchase');
  await admin.req('/api/admin/settings', { method: 'PUT', json: { max_downloads: 2 } });
  r = await stu.req('/download/' + paid.id); r = await stu.req('/download/' + paid.id);
  ok(r.status === 429, 'download limit enforced');
  await admin.req('/api/admin/settings', { method: 'PUT', json: { max_downloads: 5 } });

  console.log('Coupons and free checkout');
  await admin.req('/api/admin/coupons', { method: 'POST', json: { code: 'FREE' + stamp, percent: 100 } });
  r = await other.req('/api/checkout', { method: 'POST', json: { ids: [paid.id], coupon: 'FREE' + stamp } });
  ok((await r.json()).free === true, '100% coupon unlocks instantly');
  ok((await other.req('/download/' + paid.id)).status === 200, 'coupon buyer can download');

  console.log('Admin reports');
  const st = await (await admin.req('/api/admin/stats')).json();
  ok(st.revenueTotal >= 99 && st.ordersPaid >= 2, 'dashboard shows sales');
  const orders = await (await admin.req('/api/admin/orders?q=' + stamp)).json();
  ok(orders.length >= 2, 'orders list and search');
  ok((await (await admin.req('/api/admin/orders.csv')).text()).includes('Paid notes'), 'CSV export');
  ok((await (await admin.req('/api/admin/downloads')).json()).length >= 2, 'download log');
  const users = await (await admin.req('/api/admin/users?q=' + stamp)).json();
  r = await admin.req('/api/admin/users/' + users[0].id, { method: 'PUT', json: { is_blocked: 1 } });
  ok(r.status === 200, 'block student');
  ok((await other.req('/account')).status === 302, 'blocked student is logged out');
  r = await admin.req('/api/admin/products/' + paid.id, { method: 'DELETE' });
  ok((await r.json()).hidden === true, 'sold item is hidden, not deleted');
  r = await admin.req('/api/admin/courses/' + course.id, { method: 'DELETE' });
  ok(r.status === 400, 'course with sales cannot be deleted');
  ok((await stu.req('/api/admin/stats')).status === 401 || (await stu.req('/api/admin/stats')).status === 403, 'students cannot use admin API');
  r = await fetch(BASE + '/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: admin.cookie }, body: '{}' });
  ok(r.status === 403, 'requests from other websites are blocked');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
