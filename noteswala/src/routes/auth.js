const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { signIn, signOut, requireLogin } = require('../middleware');
const { clean, isEmail } = require('../util');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again after 15 minutes.' } });

router.post('/register', limiter, (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const phone = clean(req.body.phone, 15).replace(/[^\d+]/g, '');
  const password = String(req.body.password || '');
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email))
    return res.status(409).json({ error: 'This email is already registered. Please log in.' });
  const info = db.prepare('INSERT INTO users(name,email,phone,password_hash) VALUES (?,?,?,?)')
    .run(name, email, phone || null, bcrypt.hashSync(password, 10));
  signIn(res, { id: info.lastInsertRowid });
  res.json({ ok: true });
});

router.post('/login', limiter, (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash))
    return res.status(401).json({ error: 'Wrong email or password.' });
  if (u.is_blocked) return res.status(403).json({ error: 'This account is blocked. Please contact support.' });
  signIn(res, u);
  res.json({ ok: true, role: u.role });
});

router.post('/logout', (req, res) => { signOut(res); res.json({ ok: true }); });

router.get('/me', (req, res) => res.json({ user: req.user ? { name: req.user.name, email: req.user.email, role: req.user.role } : null }));

router.put('/profile', requireLogin, (req, res) => {
  const name = clean(req.body.name, 80);
  const phone = clean(req.body.phone, 15).replace(/[^\d+]/g, '');
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  db.prepare('UPDATE users SET name=?, phone=? WHERE id=?').run(name, phone || null, req.user.id);
  res.json({ ok: true });
});

router.put('/password', requireLogin, limiter, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(String(req.body.current || ''), u.password_hash))
    return res.status(400).json({ error: 'Current password is wrong.' });
  const np = String(req.body.password || '');
  if (np.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(np, 10), u.id);
  res.json({ ok: true });
});

module.exports = router;
