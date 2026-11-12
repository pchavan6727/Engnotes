const express = require('express');
const { db } = require('../db');
const { requireLogin } = require('../middleware');
const { ownedProductIds, ownsProduct, TYPES } = require('../util');

const router = express.Router();

const BASE = `
  SELECT p.*, s.name subject, s.semester, s.code subject_code, c.name course_name, c.short_code course, c.slug course_slug, c.icon course_icon
  FROM products p JOIN subjects s ON s.id=p.subject_id AND s.is_active=1
  JOIN courses c ON c.id=s.course_id AND c.is_active=1
  WHERE p.is_active=1 `;

function products(user, where = '', params = [], tail = 'ORDER BY p.id DESC', limit = 200) {
  const rows = db.prepare(BASE + where + ' ' + tail + ' LIMIT ' + limit).all(...params);
  const owned = ownedProductIds(user && user.id);
  rows.forEach((r) => { r.owned = owned.has(r.id) || r.price === 0 && !!user; });
  return rows;
}
const getCourses = () => db.prepare(`
  SELECT c.*, (SELECT COUNT(*) FROM products p JOIN subjects s ON s.id=p.subject_id AND s.is_active=1 WHERE s.course_id=c.id AND p.is_active=1) product_count
  FROM courses c WHERE c.is_active=1 ORDER BY sort_order, id`).all();

const page = (res, view, data = {}) => res.render(view, { title: null, desc: null, ...data });
const notFound = (req, res) => res.status(404).render('404', { title: 'Page not found', desc: null });

router.get('/', (req, res) => {
  const stats = {
    products: db.prepare('SELECT COUNT(*) c FROM products WHERE is_active=1').get().c,
    pyqs: db.prepare("SELECT COUNT(*) c FROM products WHERE is_active=1 AND type='pyq'").get().c,
    subjects: db.prepare('SELECT COUNT(*) c FROM subjects WHERE is_active=1').get().c,
  };
  page(res, 'home', {
    courses: getCourses(), stats,
    latest: products(req.user, "AND p.type != 'pyq'", [], 'ORDER BY p.id DESC', 6),
    latestPyq: products(req.user, "AND p.type = 'pyq'", [], 'ORDER BY p.exam_year DESC, p.id DESC', 6),
  });
});

router.get('/courses', (req, res) => page(res, 'courses', { title: 'Choose your branch', courses: getCourses() }));

router.get('/course/:slug', (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!course) return notFound(req, res);
  const sems = db.prepare(`
    SELECT s.semester, COUNT(DISTINCT s.id) subjects,
      (SELECT COUNT(*) FROM products p JOIN subjects s2 ON s2.id=p.subject_id WHERE s2.course_id=? AND s2.semester=s.semester AND s2.is_active=1 AND p.is_active=1) files
    FROM subjects s WHERE s.course_id=? AND s.is_active=1 GROUP BY s.semester`).all(course.id, course.id);
  const bySem = Object.fromEntries(sems.map((s) => [s.semester, s]));
  page(res, 'course', { title: course.name + ' notes and PYQs', desc: `Semester-wise notes and previous year papers for ${course.name}.`, course, bySem });
});

router.get('/course/:slug/sem/:n', (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE slug=? AND is_active=1').get(req.params.slug);
  const sem = parseInt(req.params.n, 10);
  if (!course || !(sem >= 1 && sem <= 8)) return notFound(req, res);
  const subjects = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.subject_id=s.id AND p.is_active=1) files,
      (SELECT COUNT(*) FROM products p WHERE p.subject_id=s.id AND p.is_active=1 AND p.type='pyq') pyqs,
      (SELECT MIN(price) FROM products p WHERE p.subject_id=s.id AND p.is_active=1) min_price
    FROM subjects s WHERE s.course_id=? AND s.semester=? AND s.is_active=1 ORDER BY s.name`).all(course.id, sem);
  page(res, 'semester', { title: `${course.short_code} Semester ${sem} notes`, desc: `Subject-wise notes and PYQs for ${course.name}, semester ${sem}.`, course, sem, subjects });
});

router.get('/subject/:id', (req, res) => {
  const subject = db.prepare(`SELECT s.*, c.name course_name, c.short_code course, c.slug course_slug FROM subjects s JOIN courses c ON c.id=s.course_id
    WHERE s.id=? AND s.is_active=1 AND c.is_active=1`).get(req.params.id);
  if (!subject) return notFound(req, res);
  const all = products(req.user, 'AND p.subject_id=?', [subject.id], 'ORDER BY p.exam_year DESC, p.id DESC');
  page(res, 'subject', {
    title: `${subject.name} notes and PYQs`, desc: `${subject.name} - ${subject.course} semester ${subject.semester}. Notes, important questions and solved papers.`,
    subject, study: all.filter((p) => p.type !== 'pyq'), pyqs: all.filter((p) => p.type === 'pyq'),
  });
});

router.get('/pyq', (req, res) => {
  const courses = getCourses();
  const cid = parseInt(req.query.course, 10) || 0, sem = parseInt(req.query.sem, 10) || 0, yr = parseInt(req.query.year, 10) || 0;
  let where = "AND p.type='pyq'"; const params = [];
  if (cid) { where += ' AND c.id=?'; params.push(cid); }
  if (sem) { where += ' AND s.semester=?'; params.push(sem); }
  if (yr) { where += ' AND p.exam_year=?'; params.push(yr); }
  const years = db.prepare("SELECT DISTINCT exam_year y FROM products WHERE type='pyq' AND is_active=1 AND exam_year IS NOT NULL ORDER BY y DESC").all().map((r) => r.y);
  page(res, 'pyq', {
    title: 'Previous year question papers', desc: 'Solved previous year question papers (PYQs) for BE Engineering, by branch, semester and exam year.',
    courses, years, f: { cid, sem, yr }, list: products(req.user, where, params, 'ORDER BY c.sort_order, s.semester, s.name, p.exam_year DESC', 300),
  });
});

router.get('/product/:id', (req, res) => {
  const p = products(req.user, 'AND p.id=?', [parseInt(req.params.id, 10) || 0], '', 1)[0];
  if (!p) return notFound(req, res);
  const related = products(req.user, 'AND p.subject_id=? AND p.id != ?', [p.subject_id, p.id], 'ORDER BY p.exam_year DESC, p.id DESC', 6);
  page(res, 'product', {
    title: p.title, desc: `${p.title} - ${p.subject}, ${p.course} semester ${p.semester}. ${p.price ? 'Only ₹' + p.price : 'Free'}. Instant download after payment.`,
    p, related, canDownload: p.owned,
  });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  let list = [], subjects = [];
  if (q) {
    const like = '%' + q.replace(/[%_]/g, '') + '%';
    list = products(req.user, 'AND (p.title LIKE ? OR s.name LIKE ? OR s.code LIKE ?)', [like, like, like], 'ORDER BY p.id DESC', 60);
    subjects = db.prepare(`SELECT s.*, c.short_code course FROM subjects s JOIN courses c ON c.id=s.course_id
      WHERE s.is_active=1 AND c.is_active=1 AND (s.name LIKE ? OR s.code LIKE ?) ORDER BY s.name LIMIT 12`).all(like, like);
  }
  page(res, 'search', { title: q ? `Search: ${q}` : 'Search', q, list, subjects });
});

router.get('/cart', (req, res) => page(res, 'cart', { title: 'Your cart' }));
router.get('/login', (req, res) => req.user ? res.redirect('/account') : page(res, 'login', { title: 'Log in', mode: 'login', next: safeNext(req.query.next) }));
router.get('/register', (req, res) => req.user ? res.redirect('/account') : page(res, 'login', { title: 'Create account', mode: 'register', next: safeNext(req.query.next) }));
const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/account');

router.get('/account', requireLogin, (req, res) => {
  const limit = parseInt(res.locals.settings.max_downloads, 10) || 0;
  const purchases = db.prepare(`
    SELECT p.id, p.title, p.type, p.pages, p.file_size, s.name subject, s.semester, c.short_code course, MAX(o.paid_at) bought_at,
      (SELECT COUNT(*) FROM downloads d WHERE d.user_id=? AND d.product_id=p.id) used
    FROM order_items oi JOIN orders o ON o.id=oi.order_id AND o.status='paid' AND o.user_id=?
    JOIN products p ON p.id=oi.product_id JOIN subjects s ON s.id=p.subject_id JOIN courses c ON c.id=s.course_id
    GROUP BY p.id ORDER BY bought_at DESC`).all(req.user.id, req.user.id);
  const orders = db.prepare("SELECT id, amount, method, paid_at, razorpay_payment_id FROM orders WHERE user_id=? AND status='paid' ORDER BY id DESC LIMIT 30").all(req.user.id);
  page(res, 'account', { title: 'My purchases', purchases, orders, limit });
});

router.get('/contact', (req, res) => page(res, 'contact', { title: 'Contact us' }));
router.get('/terms', (req, res) => page(res, 'terms', { title: 'Terms and refund policy' }));

router.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.render('admin', { isAdmin: !!(req.user && req.user.role === 'admin') });
});

router.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /account\nDisallow: /download/\nSitemap: ${res.locals.siteUrl}/sitemap.xml\n`));
router.get('/sitemap.xml', (req, res) => {
  const base = res.locals.siteUrl;
  const urls = ['/', '/courses', '/pyq', '/contact'];
  db.prepare('SELECT slug FROM courses WHERE is_active=1').all().forEach((c) => { urls.push('/course/' + c.slug); for (let i = 1; i <= 8; i++) urls.push(`/course/${c.slug}/sem/${i}`); });
  db.prepare('SELECT id FROM subjects WHERE is_active=1').all().forEach((s) => urls.push('/subject/' + s.id));
  db.prepare('SELECT id FROM products WHERE is_active=1').all().forEach((p) => urls.push('/product/' + p.id));
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('')}</urlset>`);
});

module.exports = { router, notFound };
