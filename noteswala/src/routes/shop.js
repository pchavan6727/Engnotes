const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('../config');
const { db } = require('../db');
const { requireLogin } = require('../middleware');
const { ownedProductIds, markOrderPaid, clean } = require('../util');

const router = express.Router();
const rzp = config.razorpay.enabled
  ? new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
  : null;

const parseIds = (v) =>
  [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map((x) => parseInt(x, 10)).filter((x) => x > 0))].slice(0, 50);

// Price is ALWAYS read from the database, never trusted from the browser.
function buildCart(user, ids, couponCode) {
  const owned = user ? ownedProductIds(user.id) : new Set();
  const items = [];
  for (const id of ids) {
    const p = db.prepare(`
      SELECT p.id, p.title, p.type, p.price, p.exam_year, p.exam_session, s.name subject, s.semester, c.short_code course
      FROM products p JOIN subjects s ON s.id = p.subject_id JOIN courses c ON c.id = s.course_id
      WHERE p.id = ? AND p.is_active = 1`).get(id);
    if (p) items.push({ ...p, owned: owned.has(p.id) });
  }
  const payable = items.filter((i) => !i.owned);
  const subtotal = payable.reduce((a, i) => a + i.price, 0);
  let discount = 0, coupon = null, couponError = null;
  if (couponCode) {
    const c = db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE AND is_active = 1').get(couponCode);
    if (!c) couponError = 'This coupon code is not valid.';
    else if (c.max_uses != null && c.used_count >= c.max_uses) couponError = 'This coupon has been fully used.';
    else if (subtotal === 0) couponError = 'Add a paid item to use a coupon.';
    else { coupon = c; discount = Math.min(subtotal, Math.round((subtotal * c.percent) / 100)); }
  }
  return { items, payable, subtotal, discount, total: subtotal - discount, coupon, couponError };
}

router.get('/cart', (req, res) => {
  const cart = buildCart(req.user, parseIds(req.query.ids), clean(req.query.coupon, 30));
  res.json({
    items: cart.items, subtotal: cart.subtotal, discount: cart.discount, total: cart.total,
    couponApplied: cart.coupon ? { code: cart.coupon.code, percent: cart.coupon.percent } : null,
    couponError: cart.couponError, loggedIn: !!req.user,
  });
});

router.post('/checkout', requireLogin, async (req, res) => {
  const cart = buildCart(req.user, parseIds(req.body.ids), clean(req.body.coupon, 30));
  if (!cart.payable.length) return res.status(400).json({ error: 'Nothing to buy. You may already own these items.' });
  if (cart.couponError) return res.status(400).json({ error: cart.couponError });

  const tx = db.transaction(() => {
    const o = db.prepare('INSERT INTO orders(user_id,subtotal,discount,amount,coupon_code) VALUES (?,?,?,?,?)')
      .run(req.user.id, cart.subtotal, cart.discount, cart.total, cart.coupon ? cart.coupon.code : null);
    const ins = db.prepare('INSERT INTO order_items(order_id,product_id,price) VALUES (?,?,?)');
    cart.payable.forEach((i) => ins.run(o.lastInsertRowid, i.id, i.price));
    return o.lastInsertRowid;
  });
  const orderId = tx();

  // Free order (free notes or 100% coupon): unlock immediately
  if (cart.total === 0) {
    markOrderPaid(orderId, null, 'free');
    return res.json({ free: true, orderId });
  }

  if (rzp) {
    try {
      const ro = await rzp.orders.create({
        amount: cart.total * 100, // Razorpay works in paise
        currency: 'INR',
        receipt: 'NW' + orderId,
        notes: { order_id: String(orderId), email: req.user.email },
      });
      db.prepare('UPDATE orders SET razorpay_order_id=? WHERE id=?').run(ro.id, orderId);
      return res.json({
        orderId, razorpayOrderId: ro.id, amount: cart.total * 100, key: config.razorpay.keyId,
        name: req.user.name, email: req.user.email, phone: req.user.phone || '',
      });
    } catch (e) {
      console.error('[razorpay] order create failed:', e && (e.error || e.message || e));
      db.prepare("UPDATE orders SET status='failed' WHERE id=?").run(orderId);
      return res.status(502).json({ error: 'Payment service is not reachable right now. Please try again in a minute.' });
    }
  }

  // No Razorpay keys: only allowed on your own computer for testing
  if (config.isProd) {
    db.prepare("UPDATE orders SET status='failed' WHERE id=?").run(orderId);
    return res.status(503).json({ error: 'Payments are not set up yet.' });
  }
  res.json({ demo: true, orderId, amount: cart.total * 100 });
});

// Browser calls this after Razorpay says "payment done". We re-check the signature on the server.
router.post('/payment/verify', requireLogin, (req, res) => {
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = req.body || {};
  if (!oid || !pid || !sig) return res.status(400).json({ error: 'Missing payment details.' });
  const order = db.prepare('SELECT * FROM orders WHERE razorpay_order_id=? AND user_id=?').get(String(oid), req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(oid + '|' + pid).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(sig));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(400).json({ error: 'Payment could not be verified. If money was deducted, it will be refunded or unlocked automatically.' });
  }
  markOrderPaid(order.id, pid, 'razorpay');
  res.json({ ok: true });
});

// Demo payment (testing only, never works on the live site or with real keys)
router.post('/payment/demo', requireLogin, (req, res) => {
  if (config.razorpay.enabled || config.isProd) return res.status(403).json({ error: 'Demo payments are disabled.' });
  const order = db.prepare("SELECT * FROM orders WHERE id=? AND user_id=? AND status='created'").get(parseInt(req.body.orderId, 10), req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  markOrderPaid(order.id, 'demo_' + crypto.randomBytes(5).toString('hex'), 'demo');
  res.json({ ok: true });
});

// Razorpay calls this by itself, even if the student closes the browser after paying.
function webhook(req, res) {
  const secret = config.razorpay.webhookSecret;
  if (!secret) return res.status(200).send('webhook not configured');
  const sig = req.get('x-razorpay-signature') || '';
  const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).send('bad signature');
  try {
    const evt = JSON.parse(req.body.toString('utf8'));
    if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
      const pay = evt.payload.payment && evt.payload.payment.entity;
      const orderId = pay ? pay.order_id : evt.payload.order.entity.id;
      const order = db.prepare('SELECT * FROM orders WHERE razorpay_order_id=?').get(orderId);
      if (order) markOrderPaid(order.id, pay ? pay.id : null, 'razorpay');
    }
  } catch (e) { console.error('[webhook]', e.message); }
  res.send('ok');
}

router.post('/contact', (req, res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email, 120), message = clean(req.body.message, 2000);
  if (!name || !/^[^\s@]+@[^\s@]+$/.test(email) || message.length < 5)
    return res.status(400).json({ error: 'Please fill in your name, a valid email and your message.' });
  db.prepare('INSERT INTO messages(name,email,subject,message) VALUES (?,?,?,?)').run(name, email, clean(req.body.subject, 120), message);
  res.json({ ok: true });
});

module.exports = { router, webhook, buildCart };
