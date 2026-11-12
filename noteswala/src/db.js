const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
fs.mkdirSync(config.pdfDir, { recursive: true });

const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',      -- 'student' or 'admin'
  is_blocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_code TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📘',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
  name TEXT NOT NULL,
  code TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subjects_course_sem ON subjects(course_id, semester);

-- type: notes | handwritten | important | pyq | other
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'notes',
  title TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,          -- in rupees. 0 = free
  exam_year INTEGER,                         -- for PYQs, e.g. 2025
  exam_session TEXT,                         -- e.g. 'May-Jun' or 'Nov-Dec'
  file_name TEXT,                            -- random name on disk (never shown to students)
  original_name TEXT,
  file_size INTEGER,
  pages INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_subject ON products(subject_id);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,         -- what the student pays (rupees)
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'created',    -- created | paid | failed
  method TEXT,                               -- razorpay | free | demo | manual
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  price INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_downloads_up ON downloads(user_id, product_id);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
  max_uses INTEGER,                          -- NULL = unlimited
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// ---------- default settings ----------
const defaultSettings = {
  site_name: 'Notes Wala',
  tagline: 'Exam-ready BE Engineering notes and PYQs, from ₹29',
  contact_email: 'support@noteswala.in',
  whatsapp_number: '',          // with country code, e.g. 919876543210
  instagram_url: '',
  max_downloads: '5',           // each purchased PDF can be downloaded this many times
  watermark: '1',               // stamp buyer name + email on every page
  announcement: '',             // optional banner at top of the site
};
const insSetting = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
for (const [k, v] of Object.entries(defaultSettings)) insSetting.run(k, v);

// ---------- default courses ----------
const defaultCourses = [
  ['Computer Engineering', 'cse', 'CSE', '💻'],
  ['Information Technology', 'it', 'IT', '🌐'],
  ['AI & Data Science', 'aids', 'AIDS', '🤖'],
  ['Electronics & Telecommunication', 'entc', 'ENTC', '📡'],
  ['Civil Engineering', 'civil', 'Civil', '🏗️'],
  ['Mechanical Engineering', 'mechanical', 'ME', '⚙️'],
];
if (db.prepare('SELECT COUNT(*) c FROM courses').get().c === 0) {
  const ins = db.prepare('INSERT INTO courses(name,slug,short_code,icon,sort_order) VALUES (?,?,?,?,?)');
  defaultCourses.forEach((c, i) => ins.run(c[0], c[1], c[2], c[3], i));
}

// ---------- first admin ----------
if (!db.prepare("SELECT id FROM users WHERE role='admin'").get()) {
  db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)')
    .run('Admin', config.adminEmail, bcrypt.hashSync(config.adminPassword, 10), 'admin');
  console.log(`[setup] Admin account created: ${config.adminEmail}`);
}

// ---------- helpers ----------
const getSettings = () => {
  const o = {};
  for (const r of db.prepare('SELECT key,value FROM settings').all()) o[r.key] = r.value;
  return o;
};

module.exports = { db, getSettings };
