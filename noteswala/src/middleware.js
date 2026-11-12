const jwt = require('jsonwebtoken');
const config = require('./config');
const { db, getSettings } = require('./db');
const { inr, TYPES, TYPE_SHORT, ordinal } = require('./util');

const COOKIE = 'nw_token';

function signIn(res, user) {
  const token = jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,            // JavaScript on the page cannot read it
    sameSite: 'lax',
    secure: config.isProd,     // HTTPS only on the live site
    maxAge: 30 * 24 * 3600 * 1000,
  });
}
const signOut = (res) => res.clearCookie(COOKIE);

// Loads req.user (or null) and common template values
function attachUser(req, res, next) {
  req.user = null;
  const t = req.cookies && req.cookies[COOKIE];
  if (t) {
    try {
      const { uid } = jwt.verify(t, config.jwtSecret);
      const u = db.prepare('SELECT id,name,email,phone,role,is_blocked FROM users WHERE id=?').get(uid);
      if (u && !u.is_blocked) req.user = u;
    } catch (e) { /* bad or expired token = logged out */ }
  }
  const settings = getSettings();
  res.locals.user = req.user;
  res.locals.settings = settings;
  res.locals.siteUrl = config.siteUrl;
  res.locals.inr = inr;
  res.locals.TYPES = TYPES;
  res.locals.TYPE_SHORT = TYPE_SHORT;
  res.locals.ordinal = ordinal;
  res.locals.demoMode = !config.razorpay.enabled;
  res.locals.canonical = config.siteUrl + req.path;
  next();
}

// Blocks form posts coming from other websites (simple CSRF protection)
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch (e) { host = ''; }
    if (host !== req.get('host')) return res.status(403).json({ error: 'Blocked: request from another website.' });
  }
  next();
}

const wantsJson = (req) => req.originalUrl.startsWith('/api/') || (req.get('accept') || '').includes('application/json');

function requireLogin(req, res, next) {
  if (req.user) return next();
  if (wantsJson(req)) return res.status(401).json({ error: 'Please log in first.' });
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  res.status(req.user ? 403 : 401).json({ error: 'Admin access only.' });
}

module.exports = { attachUser, sameOrigin, requireLogin, requireAdmin, signIn, signOut };
