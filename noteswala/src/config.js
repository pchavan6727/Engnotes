require('dotenv').config();
const path = require('path');

const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

module.exports = {
  root: path.join(__dirname, '..'),
  port: parseInt(process.env.PORT || '3000', 10),
  isProd: process.env.NODE_ENV === 'production',
  siteUrl: (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@noteswala.in').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe@123',
  razorpay: {
    keyId,
    keySecret,
    webhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
    enabled: !!(keyId && keySecret),
    isTest: keyId.startsWith('rzp_test_'),
  },
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_MB || '50', 10) * 1024 * 1024,
  pdfDir: process.env.PDF_DIR || path.join(__dirname, '..', 'storage', 'pdfs'),
  dbFile: process.env.DB_FILE || path.join(__dirname, '..', 'data', 'noteswala.db'),
};
