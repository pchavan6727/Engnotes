(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const TYPES = { notes: 'Notes (PDF)', handwritten: 'Handwritten notes', important: 'Important questions', pyq: 'Previous year paper (PYQ)', other: 'Other material' };
  const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');
  const view = $('#view');

  let tt;
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600); };
  async function api(url, method = 'GET', body) {
    try {
      const r = await fetch('/api/admin' + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) { location.reload(); }
      if (!r.ok) throw new Error(data.error || 'Something went wrong.');
      return data;
    } catch (e) { toast(e.message); throw e; }
  }
  // Upload with a progress bar (PDFs can be large)
  function sendForm(url, method, fd, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open(method, '/api/admin' + url);
      x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(Math.round((e.loaded / e.total) * 100));
      x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch (e) {} x.status < 300 ? resolve(d) : reject(new Error(d.error || 'Upload failed.')); };
      x.onerror = () => reject(new Error('No internet connection.'));
      x.send(fd);
    });
  }

  // ---------- modal ----------
  const bg = $('#modalBg');
  const closeModal = () => { bg.hidden = true; $('#mBody').innerHTML = ''; };
  $('#mClose').onclick = closeModal;
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !bg.hidden) closeModal(); });
  function modal(title, html, onSubmit, submitLabel = 'Save') {
    $('#mTitle').textContent = title;
    $('#mBody').innerHTML = `<form id="mForm">${html}<p class="err" id="mErr" role="alert"></p><div class="progress" id="mProg" hidden><i></i></div><button class="btn" type="submit">${submitLabel}</button> <button class="btn ghost" type="button" id="mCancel">Cancel</button></form>`;
    bg.hidden = false;
    $('#mCancel').onclick = closeModal;
    const f = $('#mForm');
    const first = $('input:not([type=hidden]), select', f); if (first) first.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', f); btn.disabled = true; $('#mErr').textContent = '';
      try { await onSubmit(f); closeModal(); } catch (err) { $('#mErr').textContent = err.message; btn.disabled = false; }
    });
    return f;
  }
  const fdata = (f) => Object.fromEntries(new FormData(f).entries());

  // ---------- tabs ----------
  const TABS = [
    ['dashboard', 'Dashboard'], ['products', 'Notes and PYQs'], ['catalog', 'Courses and subjects'], ['orders', 'Orders'],
    ['users', 'Students'], ['downloads', 'Downloads'], ['coupons', 'Coupons'], ['messages', 'Messages'], ['settings', 'Settings'],
  ];
  let current = 'dashboard', unread = 0;
  function drawTabs() {
    $('#tabs').innerHTML = TABS.map(([k, n]) => `<button data-t="${k}" class="${k === current ? 'on' : ''}">${n}${k === 'messages' && unread ? `<span class="dot">${unread}</span>` : ''}</button>`).join('');
    $$('#tabs button').forEach((b) => (b.onclick = () => go(b.dataset.t)));
  }
  async function go(t) {
    current = t; $('#side').classList.remove('open');
    $('#pageTitle').textContent = TABS.find((x) => x[0] === t)[1];
    drawTabs(); view.innerHTML = '<p class="muted">Loading…</p>';
    try { await VIEWS[t](); } catch (e) { view.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  $('#logout').onclick = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); };

  const table = (head, rows, empty = 'Nothing here yet.') =>
    rows.length ? `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="tw"><div class="empty">${empty}</div></div>`;
  const yesno = (v) => (v ? '<span class="pill ok">Yes</span>' : '<span class="pill off">Hidden</span>');

  const VIEWS = {
    // ================= DASHBOARD =================
    async dashboard() {
      const s = await api('/stats');
      unread = s.unreadMessages; drawTabs();
      const max = Math.max(1, ...s.days.map((d) => d.revenue));
      view.innerHTML = `
        <div class="stats">
          <div class="stat"><b>${inr(s.revenueTotal)}</b><span>Total revenue</span></div>
          <div class="stat"><b>${inr(s.revenueToday)}</b><span>Today</span></div>
          <div class="stat"><b>${inr(s.revenue30)}</b><span>Last 30 days</span></div>
          <div class="stat"><b>${s.ordersPaid}</b><span>Paid orders</span></div>
          <div class="stat"><b>${s.students}</b><span>Students</span></div>
          <div class="stat"><b>${s.downloads}</b><span>Downloads</span></div>
        </div>
        <div class="cols">
          <div class="panel"><h2>Revenue, last 14 days</h2>
            <div class="bars">${s.days.map((d) => `<div class="bar ${d.revenue ? '' : 'zero'}" title="${d.date}: ${inr(d.revenue)}, ${d.orders} orders"><i style="height:${Math.max(2, (d.revenue / max) * 100)}%"></i><span>${d.date.slice(8)}</span></div>`).join('')}</div>
          </div>
          <div class="panel"><h2>Best sellers</h2>
            ${s.top.length ? s.top.map((t) => `<p style="margin:0 0 10px"><b>${esc(t.title)}</b><br><span class="muted small">${t.sold} sold · ${inr(t.revenue)}</span></p>`).join('') : '<p class="muted">Sales will show here.</p>'}
          </div>
        </div>
        <div class="panel" style="margin-top:18px"><h2>Recent orders</h2>
          ${s.recent.length ? table(['Order', 'Student', 'Amount', 'Method', 'Paid at'], s.recent.map((o) => `<tr><td>#NW${o.id}</td><td>${esc(o.name)}</td><td>${inr(o.amount)}</td><td>${esc(o.method)}</td><td>${when(o.paid_at)}</td></tr>`)) : '<p class="muted">No orders yet. Share your link on WhatsApp to get your first one.</p>'}
        </div>`;
    },

    // ================= PRODUCTS =================
    async products(q = '') {
      const list = await api('/products?q=' + encodeURIComponent(q));
      view.innerHTML = `
        <div class="toolbar">
          <button class="btn" id="addP">Upload new PDF</button>
          <input id="pq" type="search" placeholder="Search title or subject" value="${esc(q)}">
          <span class="grow"></span><span class="muted small">${list.length} items. Change a price in the table and it saves by itself.</span>
        </div>
        ${table(['Title', 'Course / Sem / Subject', 'Type', 'Price (₹)', 'Sold', 'Visible', ''], list.map((p) => `
          <tr><td><b>${esc(p.title)}</b><span class="sub">${p.pages ? p.pages + ' pages · ' : ''}${p.file_size ? (p.file_size < 1048576 ? Math.max(1, Math.round(p.file_size / 1024)) + ' KB' : (p.file_size / 1048576).toFixed(1) + ' MB') : 'no file'}${p.exam_year ? ' · ' + esc(p.exam_session || '') + ' ' + p.exam_year : ''}</span></td>
          <td>${esc(p.course)} · Sem ${p.semester}<span class="sub">${esc(p.subject)}</span></td>
          <td><span class="pill">${esc(TYPES[p.type] || p.type)}</span></td>
          <td><input class="price-in" type="number" min="0" max="5000" value="${p.price}" data-price="${p.id}" aria-label="Price for ${esc(p.title)}"></td>
          <td>${p.sold}</td><td>${yesno(p.is_active)}</td>
          <td class="act"><button class="btn sm ghost" data-edit="${p.id}">Edit</button><button class="btn sm danger" data-del="${p.id}">Delete</button></td></tr>`), 'No files yet. Click "Upload new PDF" to add your first one.')}`;
      $('#addP').onclick = () => productForm(null);
      let timer; $('#pq').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => VIEWS.products(e.target.value), 350); };
      $$('[data-price]').forEach((i) => (i.onchange = async () => { await api('/products/' + i.dataset.price, 'PUT', { price: i.value }); toast('Price saved'); }));
      $$('[data-edit]').forEach((b) => (b.onclick = () => productForm(list.find((p) => p.id == b.dataset.edit))));
      $$('[data-del]').forEach((b) => (b.onclick = async () => {
        if (!confirm('Delete this file? This cannot be undone.')) return;
        const r = await api('/products/' + b.dataset.del, 'DELETE'); toast(r.message || 'Deleted'); VIEWS.products(q);
      }));
    },

    // ================= CATALOG =================
    async catalog() {
      const [courses, subjects] = await Promise.all([api('/courses'), api('/subjects')]);
      view.innerHTML = `
        <div class="panel"><h2>Courses (branches)</h2>
          <div class="toolbar"><button class="btn" id="addC">Add course</button></div>
          ${table(['Icon', 'Name', 'Short code', 'Order', 'Subjects', 'Visible', ''], courses.map((c) => `<tr><td>${esc(c.icon)}</td><td><b>${esc(c.name)}</b></td><td>${esc(c.short_code)}</td><td>${c.sort_order}</td><td>${c.subjects}</td><td>${yesno(c.is_active)}</td>
            <td class="act"><button class="btn sm ghost" data-ec="${c.id}">Edit</button><button class="btn sm danger" data-dc="${c.id}">Delete</button></td></tr>`))}
        </div>
        <div class="panel"><h2>Subjects (by semester)</h2>
          <p class="muted small">Semesters are fixed from 1 to 8. A subject belongs to one course and one semester.</p>
          <div class="toolbar"><button class="btn" id="addS">Add subject</button>
            <select id="fc"><option value="">All courses</option>${courses.map((c) => `<option value="${c.id}">${esc(c.short_code)}</option>`).join('')}</select>
            <select id="fs"><option value="">All semesters</option>${[1,2,3,4,5,6,7,8].map((n) => `<option value="${n}">Semester ${n}</option>`).join('')}</select></div>
          <div id="subjTable"></div></div>`;
      const drawSubjects = () => {
        const fc = $('#fc').value, fs = $('#fs').value;
        const rows = subjects.filter((s) => (!fc || s.course_id == fc) && (!fs || s.semester == fs));
        $('#subjTable').innerHTML = table(['Course', 'Sem', 'Subject', 'Code', 'Files', 'Visible', ''], rows.map((s) => `<tr><td>${esc(s.course)}</td><td>${s.semester}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.code || '')}</td><td>${s.products}</td><td>${yesno(s.is_active)}</td>
          <td class="act"><button class="btn sm ghost" data-es="${s.id}">Edit</button><button class="btn sm danger" data-ds="${s.id}">Delete</button></td></tr>`), 'No subjects here yet.');
        $$('[data-es]').forEach((b) => (b.onclick = () => subjectForm(courses, subjects.find((s) => s.id == b.dataset.es))));
        $$('[data-ds]').forEach((b) => (b.onclick = async () => { if (!confirm('Delete this subject and all its files?')) return; await api('/subjects/' + b.dataset.ds, 'DELETE'); toast('Deleted'); VIEWS.catalog(); }));
      };
      $('#fc').onchange = $('#fs').onchange = drawSubjects; drawSubjects();
      $('#addC').onclick = () => courseForm(null);
      $('#addS').onclick = () => subjectForm(courses, null);
      $$('[data-ec]').forEach((b) => (b.onclick = () => courseForm(courses.find((c) => c.id == b.dataset.ec))));
      $$('[data-dc]').forEach((b) => (b.onclick = async () => { if (!confirm('Delete this course with all its subjects and files?')) return; await api('/courses/' + b.dataset.dc, 'DELETE'); toast('Deleted'); VIEWS.catalog(); }));
    },

    // ================= ORDERS =================
    async orders(q = '', status = '') {
      const list = await api(`/orders?q=${encodeURIComponent(q)}&status=${status}`);
      view.innerHTML = `
        <div class="toolbar"><input id="oq" type="search" placeholder="Search name, email, order or payment ID" value="${esc(q)}">
          <select id="os"><option value="">All statuses</option><option value="paid" ${status === 'paid' ? 'selected' : ''}>Paid</option><option value="created" ${status === 'created' ? 'selected' : ''}>Not completed</option><option value="failed" ${status === 'failed' ? 'selected' : ''}>Failed</option></select>
          <span class="grow"></span><button class="btn ghost" id="grant">Give access by hand</button><a class="btn" href="/api/admin/orders.csv">Download CSV</a></div>
        ${table(['Order', 'Date', 'Student', 'Items', 'Paid', 'Status', 'Payment ID'], list.map((o) => `<tr><td>#NW${o.id}</td><td>${when(o.paid_at || o.created_at)}</td><td>${esc(o.user_name)}<span class="sub">${esc(o.user_email)}</span></td>
          <td>${o.items.map(esc).join('<br>')}</td><td><b>${inr(o.amount)}</b>${o.discount ? `<span class="sub">${inr(o.discount)} off ${esc(o.coupon_code || '')}</span>` : ''}</td>
          <td><span class="pill ${o.status === 'paid' ? 'ok' : o.status === 'failed' ? 'off' : 'warn'}">${o.status === 'created' ? 'not completed' : o.status}</span><span class="sub">${esc(o.method || '')}</span></td><td class="small">${esc(o.razorpay_payment_id || '')}</td></tr>`), 'No orders found.')}`;
      let timer; $('#oq').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => VIEWS.orders(e.target.value, $('#os').value), 350); };
      $('#os').onchange = (e) => VIEWS.orders($('#oq').value, e.target.value);
      $('#grant').onclick = async () => {
        const products = await api('/products');
        modal('Give access by hand', `<p class="muted small">Use this when a student paid you directly (for example UPI on WhatsApp). The student must already have an account.</p>
          <label>Student email<input type="email" name="email" required></label>
          <label>File<select name="product_id">${products.map((p) => `<option value="${p.id}">${esc(p.course)} Sem ${p.semester} · ${esc(p.title)}</option>`).join('')}</select></label>`,
          async (f) => { await api('/grant', 'POST', fdata(f)); toast('Access given'); VIEWS.orders(); }, 'Give access');
      };
    },

    // ================= STUDENTS =================
    async users(q = '') {
      const list = await api('/users?q=' + encodeURIComponent(q));
      view.innerHTML = `<div class="toolbar"><input id="uq" type="search" placeholder="Search name or email" value="${esc(q)}"><span class="grow"></span><span class="muted small">${list.length} accounts</span></div>
        ${table(['Name', 'Email / phone', 'Joined', 'Orders', 'Spent', 'Downloads', 'Status', ''], list.map((u) => `<tr><td><b>${esc(u.name)}</b>${u.role === 'admin' ? ' <span class="pill">admin</span>' : ''}</td><td>${esc(u.email)}<span class="sub">${esc(u.phone || '')}</span></td><td>${u.created_at.slice(0, 10)}</td><td>${u.orders}</td><td>${inr(u.spent)}</td><td>${u.downloads}</td>
          <td>${u.is_blocked ? '<span class="pill off">Blocked</span>' : '<span class="pill ok">Active</span>'}</td>
          <td class="act">${u.role === 'admin' ? '' : `<button class="btn sm ghost" data-pw="${u.id}">Reset password</button><button class="btn sm ${u.is_blocked ? '' : 'danger'}" data-bl="${u.id}" data-v="${u.is_blocked ? 0 : 1}">${u.is_blocked ? 'Unblock' : 'Block'}</button>`}</td></tr>`))}`;
      let timer; $('#uq').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => VIEWS.users(e.target.value), 350); };
      $$('[data-bl]').forEach((b) => (b.onclick = async () => { await api('/users/' + b.dataset.bl, 'PUT', { is_blocked: b.dataset.v }); toast('Updated'); VIEWS.users(q); }));
      $$('[data-pw]').forEach((b) => (b.onclick = () => modal('Reset password', '<label>New password<input name="password" type="text" minlength="8" required><small>Tell the student this password on WhatsApp. They can change it later.</small></label>',
        async (f) => { await api(`/users/${b.dataset.pw}/reset-password`, 'POST', fdata(f)); toast('Password changed'); }, 'Reset password')));
    },

    // ================= DOWNLOADS =================
    async downloads() {
      const list = await api('/downloads');
      view.innerHTML = `<p class="muted">Who downloaded what. If a student hits the download limit, you can reset their count here.</p>
        ${table(['Student', 'File', 'Times', 'Last download', 'IP', ''], list.map((d) => `<tr><td>${esc(d.user_name)}<span class="sub">${esc(d.user_email)}</span></td><td>${esc(d.title)}</td><td>${d.times}</td><td>${when(d.last_at)}</td><td class="small">${esc(d.ip || '')}</td>
          <td class="act"><button class="btn sm ghost" data-rs="${d.user_id}:${d.product_id}">Reset count</button></td></tr>`), 'No downloads yet.')}`;
      $$('[data-rs]').forEach((b) => (b.onclick = async () => { const [u, p] = b.dataset.rs.split(':'); await api('/downloads/reset', 'POST', { user_id: u, product_id: p }); toast('Count reset'); VIEWS.downloads(); }));
    },

    // ================= COUPONS =================
    async coupons() {
      const list = await api('/coupons');
      view.innerHTML = `<div class="toolbar"><button class="btn" id="addCp">Add coupon</button></div>
        ${table(['Code', 'Discount', 'Used', 'Limit', 'Active', ''], list.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td>${c.percent}% off</td><td>${c.used_count}</td><td>${c.max_uses ?? 'No limit'}</td><td>${c.is_active ? '<span class="pill ok">Yes</span>' : '<span class="pill off">Off</span>'}</td>
          <td class="act"><button class="btn sm ghost" data-tg="${c.id}" data-v="${c.is_active ? 0 : 1}">${c.is_active ? 'Turn off' : 'Turn on'}</button><button class="btn sm danger" data-dc="${c.id}">Delete</button></td></tr>`), 'No coupons yet. Try WELCOME10 for 10% off.')}`;
      $('#addCp').onclick = () => modal('New coupon', `<div class="row2"><label>Code<input name="code" placeholder="WELCOME10" required></label><label>Discount %<input name="percent" type="number" min="1" max="100" value="10" required></label></div><label>Max uses <small>(leave empty for no limit)</small><input name="max_uses" type="number" min="1"></label>`,
        async (f) => { await api('/coupons', 'POST', fdata(f)); toast('Coupon added'); VIEWS.coupons(); }, 'Add coupon');
      $$('[data-tg]').forEach((b) => (b.onclick = async () => { await api('/coupons/' + b.dataset.tg, 'PUT', { is_active: b.dataset.v }); VIEWS.coupons(); }));
      $$('[data-dc]').forEach((b) => (b.onclick = async () => { if (!confirm('Delete this coupon?')) return; await api('/coupons/' + b.dataset.dc, 'DELETE'); VIEWS.coupons(); }));
    },

    // ================= MESSAGES =================
    async messages() {
      const list = await api('/messages');
      unread = list.filter((m) => !m.is_read).length; drawTabs();
      view.innerHTML = list.length ? list.map((m) => `<div class="msg ${m.is_read ? '' : 'unread'}"><b>${esc(m.subject || 'No subject')}</b> <span class="muted small">from ${esc(m.name)} (<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>) · ${when(m.created_at)}</span><p>${esc(m.message)}</p>
        ${m.is_read ? '' : `<button class="btn sm ghost" data-rd="${m.id}">Mark as read</button> `}<button class="btn sm danger" data-dm="${m.id}">Delete</button></div>`).join('') : '<div class="tw"><div class="empty">No messages yet.</div></div>';
      $$('[data-rd]').forEach((b) => (b.onclick = async () => { await api('/messages/' + b.dataset.rd, 'PUT'); VIEWS.messages(); }));
      $$('[data-dm]').forEach((b) => (b.onclick = async () => { if (!confirm('Delete this message?')) return; await api('/messages/' + b.dataset.dm, 'DELETE'); VIEWS.messages(); }));
    },

    // ================= SETTINGS =================
    async settings() {
      const { settings: s, payment } = await api('/settings');
      view.innerHTML = `
        <div class="notice">${payment.enabled
          ? `Payments: <b>Razorpay ${payment.test ? 'TEST mode (no real money)' : 'LIVE mode'}</b> is connected. Webhook ${payment.webhook ? 'is set up.' : 'is not set up yet (recommended, see the guide).'}`
          : 'Payments: <b>DEMO mode</b>. Add your Razorpay keys to the <code>.env</code> file and restart the server to take real payments.'}</div>
        <form class="panel" id="sForm" style="max-width:720px">
          <h2>Website details</h2>
          <label>Website name<input name="site_name" value="${esc(s.site_name)}"></label>
          <label>Tagline<input name="tagline" value="${esc(s.tagline)}"></label>
          <label>Top banner message <small>(optional, for offers like "Exam special: use code WELCOME10")</small><input name="announcement" value="${esc(s.announcement)}"></label>
          <div class="row2"><label>Support email<input type="email" name="contact_email" value="${esc(s.contact_email)}"></label>
            <label>WhatsApp number <small>with country code, like 919876543210</small><input name="whatsapp_number" value="${esc(s.whatsapp_number)}" inputmode="numeric"></label></div>
          <label>Instagram link<input name="instagram_url" value="${esc(s.instagram_url)}" placeholder="https://instagram.com/yourpage"></label>
          <h2 style="margin-top:14px">Downloads and protection</h2>
          <label>Downloads allowed per purchase <small>(0 = unlimited)</small><input name="max_downloads" type="number" min="0" value="${esc(s.max_downloads)}"></label>
          <label class="check"><input type="checkbox" name="watermark" ${s.watermark === '1' ? 'checked' : ''}> Put buyer's name and email at the bottom of every PDF page</label>
          <button class="btn" type="submit">Save settings</button>
        </form>`;
      $('#sForm').onsubmit = async (e) => {
        e.preventDefault(); const f = e.target; const d = fdata(f); d.watermark = f.watermark.checked ? '1' : '0';
        await api('/settings', 'PUT', d); toast('Settings saved');
      };
    },
  };

  // ---------- forms ----------
  function productForm(p) {
    Promise.all([api('/courses'), api('/subjects')]).then(([courses, subjects]) => {
      const sel = p ? subjects.find((s) => s.id === p.subject_id) : null;
      const cid = sel ? sel.course_id : courses[0] && courses[0].id;
      const f = modal(p ? 'Edit file' : 'Upload new PDF', `
        <div class="row2"><label>Course<select name="course_id">${courses.map((c) => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${esc(c.short_code)} · ${esc(c.name)}</option>`).join('')}</select></label>
          <label>Subject<select name="subject_id" required></select></label></div>
        <div class="row2"><label>Type<select name="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${p && p.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>Price in ₹ <small>0 = free</small><input name="price" type="number" min="0" max="5000" value="${p ? p.price : 59}" required>
            <span class="chips">${[29, 59, 99].map((n) => `<button type="button" data-p="${n}">₹${n}</button>`).join('')}<button type="button" data-p="0">Free</button></span></label></div>
        <label>Title<input name="title" required maxlength="160" value="${esc(p ? p.title : '')}" placeholder="Example: VLSI Unit 3 handwritten notes"></label>
        <div class="row2" id="pyqRow"><label>Exam year<input name="exam_year" type="number" min="2000" max="2100" value="${p && p.exam_year ? p.exam_year : new Date().getFullYear()}"></label>
          <label>Exam session<select name="exam_session"><option value="">-</option>${['May-Jun', 'Nov-Dec', 'Mar-Apr', 'Oct-Nov'].map((x) => `<option ${p && p.exam_session === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
        <label>Description <small>(shown on the product page)</small><textarea name="description" rows="3" maxlength="1500">${esc(p ? p.description : '')}</textarea></label>
        <label>${p ? 'Replace PDF <small>(leave empty to keep the current file)</small>' : 'PDF file'}<input type="file" name="file" accept="application/pdf" ${p ? '' : 'required'}></label>
        <label class="check"><input type="checkbox" name="is_active" ${!p || p.is_active ? 'checked' : ''}> Show on website</label>`,
        async (form) => {
          const fd = new FormData(form); fd.set('is_active', form.is_active.checked ? '1' : '0');
          if (!form.file.files.length) fd.delete('file');
          const prog = $('#mProg'); prog.hidden = false;
          await sendForm(p ? '/products/' + p.id : '/products', p ? 'PUT' : 'POST', fd, (n) => ($('i', prog).style.width = n + '%'));
          toast(p ? 'Saved' : 'Uploaded'); VIEWS.products();
        }, p ? 'Save changes' : 'Upload');
      const fillSubjects = () => {
        const c = f.course_id.value;
        f.subject_id.innerHTML = subjects.filter((s) => s.course_id == c).map((s) => `<option value="${s.id}" ${p && p.subject_id === s.id ? 'selected' : ''}>Sem ${s.semester} · ${esc(s.name)}</option>`).join('') || '<option value="">No subjects yet. Add one first.</option>';
      };
      const togglePyq = () => ($('#pyqRow').style.display = f.type.value === 'pyq' ? '' : 'none');
      f.course_id.onchange = fillSubjects; f.type.onchange = togglePyq; fillSubjects(); togglePyq();
      $$('[data-p]', f).forEach((b) => (b.onclick = () => (f.price.value = b.dataset.p)));
    });
  }
  function courseForm(c) {
    modal(c ? 'Edit course' : 'Add course', `<label>Course name<input name="name" required value="${esc(c ? c.name : '')}" placeholder="Computer Engineering"></label>
      <div class="row2"><label>Short code<input name="short_code" required maxlength="12" value="${esc(c ? c.short_code : '')}" placeholder="CSE"></label><label>Icon (emoji)<input name="icon" maxlength="4" value="${esc(c ? c.icon : '📘')}"></label></div>
      ${c ? `<label>Display order<input name="sort_order" type="number" value="${c.sort_order}"></label><label class="check"><input type="checkbox" name="is_active" ${c.is_active ? 'checked' : ''}> Show on website</label>` : ''}`,
      async (f) => { const d = fdata(f); if (c) d.is_active = f.is_active.checked ? '1' : '0'; await api(c ? '/courses/' + c.id : '/courses', c ? 'PUT' : 'POST', d); toast('Saved'); VIEWS.catalog(); });
  }
  function subjectForm(courses, s) {
    modal(s ? 'Edit subject' : 'Add subject', `<div class="row2"><label>Course<select name="course_id">${courses.map((c) => `<option value="${c.id}" ${s && s.course_id === c.id ? 'selected' : ''}>${esc(c.short_code)}</option>`).join('')}</select></label>
      <label>Semester<select name="semester">${[1,2,3,4,5,6,7,8].map((n) => `<option value="${n}" ${s && s.semester === n ? 'selected' : ''}>Semester ${n}</option>`).join('')}</select></label></div>
      <label>Subject name<input name="name" required value="${esc(s ? s.name : '')}" placeholder="VLSI Design and Technology"></label>
      <label>Subject code <small>(optional)</small><input name="code" value="${esc(s ? s.code || '' : '')}" placeholder="404181"></label>
      ${s ? `<label class="check"><input type="checkbox" name="is_active" ${s.is_active ? 'checked' : ''}> Show on website</label>` : ''}`,
      async (f) => { const d = fdata(f); if (s) d.is_active = f.is_active.checked ? '1' : '0'; await api(s ? '/subjects/' + s.id : '/subjects', s ? 'PUT' : 'POST', d); toast('Saved'); VIEWS.catalog(); });
  }

  go('dashboard');
})();
