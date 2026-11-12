const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { PDFDocument } = require('pdf-lib');
const config = require('../config');
const { db } = require('../db');
const { slugify, markOrderPaid, clean, TYPES } = require('../util');

const router = express.Router();
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const flag = (v) => (v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0);

// ---------- PDF upload ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: config.pdfDir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + '.pdf'),
  }),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Only PDF files are allowed.'));
    cb(null, true);
  },
});
const removeFile = (name) => { if (name) fs.promises.unlink(path.join(config.pdfDir, path.basename(name))).catch(() => {}); };

async function inspectPdf(file) {
  const full = path.join(config.pdfDir, file.filename);
  const head = Buffer.alloc(5);
  const fd = fs.openSync(full, 'r'); fs.readSync(fd, head, 0, 5, 0); fs.closeSync(fd);
  if (head.toString() !== '%PDF-') { removeFile(file.filename); throw new Error('This file is not a real PDF.'); }
  let pages = null;
  try { pages = (await PDFDocument.load(fs.readFileSync(full), { ignoreEncryption: true })).getPageCount(); } catch (e) {}
  return { pages };
}

// ---------- Dashboard ----------
router.get('/stats', (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const IST = "datetime(paid_at,'+330 minutes')";
  const daily = db.prepare(`
    SELECT date(${IST}) d, SUM(amount) revenue, COUNT(*) orders FROM orders
    WHERE status='paid' AND paid_at >= datetime('now','-14 days') GROUP BY d`).all();
  const map = Object.fromEntries(daily.map((r) => [r.d, r]));
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() + 330 * 60000 - i * 86400000).toISOString().slice(0, 10);
    days.push({ date: d, revenue: map[d] ? map[d].revenue : 0, orders: map[d] ? map[d].orders : 0 });
  }
  res.json({
    revenueTotal: one("SELECT COALESCE(SUM(amount),0) v FROM orders WHERE status='paid'").v,
    revenueToday: one(`SELECT COALESCE(SUM(amount),0) v FROM orders WHERE status='paid' AND date(${IST}) = date('now','+330 minutes')`).v,
    revenue30: one("SELECT COALESCE(SUM(amount),0) v FROM orders WHERE status='paid' AND paid_at >= datetime('now','-30 days')").v,
    ordersPaid: one("SELECT COUNT(*) v FROM orders WHERE status='paid'").v,
    students: one("SELECT COUNT(*) v FROM users WHERE role='student'").v,
    products: one('SELECT COUNT(*) v FROM products').v,
    downloads: one('SELECT COUNT(*) v FROM downloads').v,
    unreadMessages: one('SELECT COUNT(*) v FROM messages WHERE is_read=0').v,
    days,
    top: db.prepare(`
      SELECT p.id, p.title, COUNT(*) sold, SUM(oi.price) revenue FROM order_items oi
      JOIN orders o ON o.id=oi.order_id AND o.status='paid' JOIN products p ON p.id=oi.product_id
      GROUP BY p.id ORDER BY sold DESC LIMIT 5`).all(),
    recent: db.prepare(`
      SELECT o.id, o.amount, o.method, o.paid_at, u.name FROM orders o JOIN users u ON u.id=o.user_id
      WHERE o.status='paid' ORDER BY o.paid_at DESC LIMIT 6`).all(),
  });
});

// ---------- Courses ----------
router.get('/courses', (req, res) => {
  res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM subjects s WHERE s.course_id=c.id) subjects FROM courses c ORDER BY sort_order, id`).all());
});
router.post('/courses', (req, res) => {
  const name = clean(req.body.name, 80), code = clean(req.body.short_code, 12);
  if (!name || !code) return res.status(400).json({ error: 'Course name and short code are required.' });
  let slug = slugify(req.body.slug || code), n = 1;
  while (db.prepare('SELECT 1 FROM courses WHERE slug=?').get(slug)) slug = slugify(code) + '-' + ++n;
  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 v FROM courses').get().v;
  db.prepare('INSERT INTO courses(name,slug,short_code,icon,sort_order) VALUES (?,?,?,?,?)').run(name, slug, code, clean(req.body.icon, 8) || '📘', max);
  res.json({ ok: true });
});
router.put('/courses/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Course not found.' });
  const b = req.body;
  db.prepare('UPDATE courses SET name=?, short_code=?, icon=?, sort_order=?, is_active=? WHERE id=?').run(
    clean(b.name ?? c.name, 80), clean(b.short_code ?? c.short_code, 12), clean(b.icon ?? c.icon, 8),
    int(b.sort_order, c.sort_order), b.is_active === undefined ? c.is_active : flag(b.is_active), c.id);
  res.json({ ok: true });
});
router.delete('/courses/:id', (req, res) => {
  const sold = db.prepare(`SELECT COUNT(*) c FROM order_items oi JOIN products p ON p.id=oi.product_id JOIN subjects s ON s.id=p.subject_id WHERE s.course_id=?`).get(req.params.id).c;
  if (sold) return res.status(400).json({ error: 'This course has sales, so it cannot be deleted. Hide it instead (turn Visible off).' });
  const files = db.prepare('SELECT p.file_name FROM products p JOIN subjects s ON s.id=p.subject_id WHERE s.course_id=?').all(req.params.id);
  db.prepare('DELETE FROM courses WHERE id=?').run(req.params.id);
  files.forEach((f) => removeFile(f.file_name));
  res.json({ ok: true });
});

// ---------- Subjects ----------
router.get('/subjects', (req, res) => {
  res.json(db.prepare(`
    SELECT s.*, c.short_code course, (SELECT COUNT(*) FROM products p WHERE p.subject_id=s.id) products
    FROM subjects s JOIN courses c ON c.id=s.course_id ORDER BY c.sort_order, s.semester, s.name`).all());
});
router.post('/subjects', (req, res) => {
  const name = clean(req.body.name, 120), sem = int(req.body.semester), cid = int(req.body.course_id);
  if (!name || sem < 1 || sem > 8 || !db.prepare('SELECT 1 FROM courses WHERE id=?').get(cid))
    return res.status(400).json({ error: 'Choose a course, a semester (1-8) and enter the subject name.' });
  db.prepare('INSERT INTO subjects(course_id,semester,name,code) VALUES (?,?,?,?)').run(cid, sem, name, clean(req.body.code, 20) || null);
  res.json({ ok: true });
});
router.put('/subjects/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM subjects WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Subject not found.' });
  const b = req.body, sem = int(b.semester, s.semester);
  if (sem < 1 || sem > 8) return res.status(400).json({ error: 'Semester must be 1 to 8.' });
  db.prepare('UPDATE subjects SET course_id=?, semester=?, name=?, code=?, is_active=? WHERE id=?').run(
    int(b.course_id, s.course_id), sem, clean(b.name ?? s.name, 120), clean(b.code ?? s.code, 20) || null,
    b.is_active === undefined ? s.is_active : flag(b.is_active), s.id);
  res.json({ ok: true });
});
router.delete('/subjects/:id', (req, res) => {
  const sold = db.prepare('SELECT COUNT(*) c FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE p.subject_id=?').get(req.params.id).c;
  if (sold) return res.status(400).json({ error: 'This subject has sales, so it cannot be deleted. Hide it instead (turn Visible off).' });
  const files = db.prepare('SELECT file_name FROM products WHERE subject_id=?').all(req.params.id);
  db.prepare('DELETE FROM subjects WHERE id=?').run(req.params.id);
  files.forEach((f) => removeFile(f.file_name));
  res.json({ ok: true });
});

// ---------- Products (PDFs) ----------
router.get('/products', (req, res) => {
  const q = '%' + clean(req.query.q, 60) + '%';
  res.json(db.prepare(`
    SELECT p.*, s.name subject, s.semester, c.short_code course, c.id course_id,
      (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id=oi.order_id AND o.status='paid' WHERE oi.product_id=p.id) sold
    FROM products p JOIN subjects s ON s.id=p.subject_id JOIN courses c ON c.id=s.course_id
    WHERE p.title LIKE ? OR s.name LIKE ? ORDER BY p.id DESC LIMIT 500`).all(q, q));
});

function productFields(b, old) {
  const type = Object.keys(TYPES).includes(b.type) ? b.type : (old ? old.type : 'notes');
  const price = b.price === undefined ? old.price : Math.max(0, Math.min(5000, int(b.price)));
  return {
    subject_id: int(b.subject_id, old ? old.subject_id : 0),
    type, price,
    title: clean(b.title ?? (old && old.title), 160),
    description: clean(b.description ?? (old && old.description), 1500),
    exam_year: b.exam_year === undefined ? (old ? old.exam_year : null) : (int(b.exam_year) || null),
    exam_session: clean(b.exam_session ?? (old && old.exam_session), 30) || null,
    is_active: b.is_active === undefined ? (old ? old.is_active : 1) : flag(b.is_active),
  };
}

router.post('/products', upload.single('file'), async (req, res, next) => {
  try {
    const f = productFields(req.body, null);
    const bad = (msg) => { if (req.file) removeFile(req.file.filename); return res.status(400).json({ error: msg }); };
    if (!f.title) return bad('Please enter a title.');
    if (!db.prepare('SELECT 1 FROM subjects WHERE id=?').get(f.subject_id)) return bad('Please choose a subject.');
    if (!req.file) return bad('Please choose a PDF file to upload.');
    const { pages } = await inspectPdf(req.file);
    db.prepare(`INSERT INTO products(subject_id,type,title,description,price,exam_year,exam_session,file_name,original_name,file_size,pages,is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(f.subject_id, f.type, f.title, f.description, f.price, f.exam_year, f.exam_session,
      req.file.filename, clean(req.file.originalname, 200), req.file.size, pages, f.is_active);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.put('/products/:id', upload.single('file'), async (req, res, next) => {
  try {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!p) { if (req.file) removeFile(req.file.filename); return res.status(404).json({ error: 'Product not found.' }); }
    const f = productFields(req.body, p);
    if (!f.title) return res.status(400).json({ error: 'Title cannot be empty.' });
    let file = { file_name: p.file_name, original_name: p.original_name, file_size: p.file_size, pages: p.pages };
    if (req.file) {
      const { pages } = await inspectPdf(req.file);
      removeFile(p.file_name);
      file = { file_name: req.file.filename, original_name: clean(req.file.originalname, 200), file_size: req.file.size, pages };
    }
    db.prepare(`UPDATE products SET subject_id=?,type=?,title=?,description=?,price=?,exam_year=?,exam_session=?,is_active=?,
      file_name=?,original_name=?,file_size=?,pages=? WHERE id=?`).run(f.subject_id, f.type, f.title, f.description, f.price,
      f.exam_year, f.exam_session, f.is_active, file.file_name, file.original_name, file.file_size, file.pages, p.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  const sold = db.prepare('SELECT COUNT(*) c FROM order_items WHERE product_id=?').get(p.id).c;
  if (sold) {
    db.prepare('UPDATE products SET is_active=0 WHERE id=?').run(p.id);
    return res.json({ ok: true, hidden: true, message: 'This item has been sold before, so it was hidden instead of deleted. Buyers can still download it.' });
  }
  db.prepare('DELETE FROM products WHERE id=?').run(p.id);
  removeFile(p.file_name);
  res.json({ ok: true });
});

// ---------- Orders ----------
function orderQuery(q, status) {
  const like = '%' + clean(q, 60) + '%';
  const rows = db.prepare(`
    SELECT o.*, u.name user_name, u.email user_email FROM orders o JOIN users u ON u.id=o.user_id
    WHERE (u.name LIKE ? OR u.email LIKE ? OR o.razorpay_payment_id LIKE ? OR o.razorpay_order_id LIKE ? OR CAST(o.id AS TEXT)=?)
      AND (? = '' OR o.status = ?) ORDER BY o.id DESC LIMIT 500`).all(like, like, like, like, clean(q, 60), status, status);
  const items = db.prepare('SELECT p.title FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?');
  rows.forEach((r) => { r.items = items.all(r.id).map((i) => i.title); });
  return rows;
}
router.get('/orders', (req, res) => res.json(orderQuery(req.query.q, clean(req.query.status, 10))));
router.get('/orders.csv', (req, res) => {
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const head = ['Order', 'Date', 'Status', 'Student', 'Email', 'Items', 'Subtotal', 'Discount', 'Paid', 'Coupon', 'Method', 'Payment ID'];
  const lines = orderQuery('', '').map((o) => [o.id, o.paid_at || o.created_at, o.status, o.user_name, o.user_email, o.items.join(' | '),
    o.subtotal, o.discount, o.amount, o.coupon_code, o.method, o.razorpay_payment_id].map(esc).join(','));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="noteswala-orders.csv"' });
  res.send('﻿' + [head.join(','), ...lines].join('\n'));
});
// Use when a student paid you by UPI/WhatsApp and you want to give access by hand
router.post('/grant', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(clean(req.body.email, 120).toLowerCase());
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(int(req.body.product_id));
  if (!u) return res.status(404).json({ error: 'No student with this email. Ask them to register first.' });
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  const o = db.prepare('INSERT INTO orders(user_id,subtotal,discount,amount) VALUES (?,?,0,0)').run(u.id, p.price);
  db.prepare('INSERT INTO order_items(order_id,product_id,price) VALUES (?,?,?)').run(o.lastInsertRowid, p.id, 0);
  markOrderPaid(o.lastInsertRowid, null, 'manual');
  res.json({ ok: true });
});

// ---------- Students ----------
router.get('/users', (req, res) => {
  const like = '%' + clean(req.query.q, 60) + '%';
  res.json(db.prepare(`
    SELECT u.id,u.name,u.email,u.phone,u.role,u.is_blocked,u.created_at,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id AND o.status='paid') orders,
      (SELECT COALESCE(SUM(amount),0) FROM orders o WHERE o.user_id=u.id AND o.status='paid') spent,
      (SELECT COUNT(*) FROM downloads d WHERE d.user_id=u.id) downloads
    FROM users u WHERE u.name LIKE ? OR u.email LIKE ? ORDER BY u.id DESC LIMIT 500`).all(like, like));
});
router.put('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot block your own account.' });
  if (u.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot be blocked here.' });
  db.prepare('UPDATE users SET is_blocked=? WHERE id=?').run(flag(req.body.is_blocked), u.id);
  res.json({ ok: true });
});
router.post('/users/:id/reset-password', (req, res) => {
  const pw = String(req.body.password || '');
  if (pw.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(pw, 10), req.params.id);
  res.json({ ok: true });
});

// ---------- Downloads ----------
router.get('/downloads', (req, res) => {
  res.json(db.prepare(`
    SELECT d.user_id, d.product_id, u.name user_name, u.email user_email, p.title, COUNT(*) times, MAX(d.created_at) last_at, MAX(d.ip) ip
    FROM downloads d JOIN users u ON u.id=d.user_id JOIN products p ON p.id=d.product_id
    GROUP BY d.user_id, d.product_id ORDER BY last_at DESC LIMIT 300`).all());
});
router.post('/downloads/reset', (req, res) => {
  db.prepare('DELETE FROM downloads WHERE user_id=? AND product_id=?').run(int(req.body.user_id), int(req.body.product_id));
  res.json({ ok: true });
});

// ---------- Coupons ----------
router.get('/coupons', (req, res) => res.json(db.prepare('SELECT * FROM coupons ORDER BY id DESC').all()));
router.post('/coupons', (req, res) => {
  const code = clean(req.body.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, ''), percent = int(req.body.percent);
  if (!code || percent < 1 || percent > 100) return res.status(400).json({ error: 'Enter a code (letters/numbers) and a discount from 1 to 100.' });
  if (db.prepare('SELECT 1 FROM coupons WHERE code=?').get(code)) return res.status(409).json({ error: 'This code already exists.' });
  db.prepare('INSERT INTO coupons(code,percent,max_uses) VALUES (?,?,?)').run(code, percent, int(req.body.max_uses) || null);
  res.json({ ok: true });
});
router.put('/coupons/:id', (req, res) => { db.prepare('UPDATE coupons SET is_active=? WHERE id=?').run(flag(req.body.is_active), req.params.id); res.json({ ok: true }); });
router.delete('/coupons/:id', (req, res) => { db.prepare('DELETE FROM coupons WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ---------- Messages ----------
router.get('/messages', (req, res) => res.json(db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 200').all()));
router.put('/messages/:id', (req, res) => { db.prepare('UPDATE messages SET is_read=1 WHERE id=?').run(req.params.id); res.json({ ok: true }); });
router.delete('/messages/:id', (req, res) => { db.prepare('DELETE FROM messages WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ---------- Settings ----------
const SETTING_KEYS = ['site_name', 'tagline', 'contact_email', 'whatsapp_number', 'instagram_url', 'max_downloads', 'watermark', 'announcement'];
router.get('/settings', (req, res) => {
  const o = {}; db.prepare('SELECT key,value FROM settings').all().forEach((r) => (o[r.key] = r.value));
  res.json({ settings: o, payment: { enabled: config.razorpay.enabled, test: config.razorpay.isTest, webhook: !!config.razorpay.webhookSecret } });
});
router.put('/settings', (req, res) => {
  const up = db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const k of SETTING_KEYS) if (req.body[k] !== undefined) {
    let v = clean(req.body[k], 300);
    if (k === 'whatsapp_number') v = v.replace(/\D/g, '');
    if (k === 'max_downloads') v = String(Math.max(0, int(v, 5)));
    if (k === 'watermark') v = flag(v) ? '1' : '0';
    up.run(k, v);
  }
  res.json({ ok: true });
});

module.exports = router;
