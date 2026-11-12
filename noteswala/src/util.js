const { db } = require('./db');

const TYPES = {
  notes: 'Notes (PDF)',
  handwritten: 'Handwritten notes',
  important: 'Important questions',
  pyq: 'Previous year paper (PYQ)',
  other: 'Other material',
};
const TYPE_SHORT = { notes: 'Notes', handwritten: 'Handwritten', important: 'Important Qs', pyq: 'PYQ', other: 'Other' };

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const ordinal = (n) => ({ 1: '1st', 2: '2nd', 3: '3rd' }[n] || n + 'th');

// Does this user own the product? (paid order OR free product)
function ownsProduct(userId, productId) {
  if (!userId) return false;
  const row = db.prepare(`
    SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'paid' LIMIT 1`).get(userId, productId);
  return !!row;
}

function ownedProductIds(userId) {
  if (!userId) return new Set();
  const rows = db.prepare(`
    SELECT DISTINCT oi.product_id id FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.user_id = ? AND o.status = 'paid'`).all(userId);
  return new Set(rows.map((r) => r.id));
}

// Mark an order as paid. Safe to call twice (browser + webhook).
function markOrderPaid(orderId, paymentId, method) {
  const tx = db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!o || o.status === 'paid') return false;
    db.prepare(`UPDATE orders SET status='paid', paid_at=datetime('now'), razorpay_payment_id=?, method=? WHERE id=?`)
      .run(paymentId || null, method, orderId);
    if (o.coupon_code) db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?').run(o.coupon_code);
    return true;
  });
  return tx();
}

const clean = (s, max = 500) => String(s == null ? '' : s).trim().slice(0, max);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

module.exports = { TYPES, TYPE_SHORT, slugify, inr, ordinal, ownsProduct, ownedProductIds, markOrderPaid, clean, isEmail };
