const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
require('./src/db');
const { attachUser, sameOrigin, requireAdmin } = require('./src/middleware');
const shop = require('./src/routes/shop');
const web = require('./src/routes/web');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (config.isProd) app.set('trust proxy', 1);   // needed when running behind Nginx / a hosting proxy
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
      frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
      connectSrc: ["'self'", 'https://lumberjack.razorpay.com', 'https://api.razorpay.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());

// Razorpay webhook needs the raw body, so it is registered before the JSON parser
app.post('/api/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }), shop.webhook);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: config.isProd ? '7d' : 0 }));
app.use(attachUser);
app.use(sameOrigin);

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/admin', requireAdmin, require('./src/routes/admin'));
app.use('/api', shop.router);
app.use('/', require('./src/routes/download'));
app.use('/', web.router);

app.use(web.notFound);
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File is too big. Maximum is ${config.maxUploadBytes / 1048576} MB.` });
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(400).json({ error: err.message || 'Something went wrong.' });
  res.status(500).send('Something went wrong. Please try again.');
});

app.listen(config.port, () => {
  console.log(`\n  Notes Wala is running:  ${config.siteUrl}`);
  console.log(`  Admin panel:            ${config.siteUrl}/admin`);
  console.log(`  Payments:               ${config.razorpay.enabled ? (config.razorpay.isTest ? 'Razorpay TEST mode' : 'Razorpay LIVE mode') : 'DEMO mode (add Razorpay keys in .env for real payments)'}\n`);
});
