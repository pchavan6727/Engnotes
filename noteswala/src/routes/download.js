const express = require('express');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const config = require('../config');
const { db, getSettings } = require('../db');
const { requireLogin } = require('../middleware');
const { ownsProduct, slugify } = require('../util');

const router = express.Router();
const latin = (s) => String(s).replace(/[^\x20-\x7E]/g, '?');   // standard PDF fonts only support Latin letters

// Secure download:
//  1. student must be logged in
//  2. must own the product (paid order) or the product must be free
//  3. limited number of downloads per purchase (admin can change this)
//  4. every page gets a small footer with the buyer's name and email (discourages sharing)
//  5. the real file lives outside the public folder, so it can never be opened by guessing a URL
router.get('/download/:id', requireLogin, async (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!p || !p.file_name) return res.status(404).send('File not found.');
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && p.price > 0 && !ownsProduct(req.user.id, p.id))
    return res.status(403).send('Please buy this item first.');
  if (!isAdmin && p.price === 0 && !p.is_active) return res.status(404).send('File not found.');

  const settings = getSettings();
  const limit = parseInt(settings.max_downloads, 10) || 0;
  if (!isAdmin && limit > 0) {
    const used = db.prepare('SELECT COUNT(*) c FROM downloads WHERE user_id=? AND product_id=?').get(req.user.id, p.id).c;
    if (used >= limit) return res.status(429).send(`Download limit reached (${limit}). Please contact support to get more downloads.`);
  }

  const file = path.join(config.pdfDir, path.basename(p.file_name));
  if (!fs.existsSync(file)) return res.status(404).send('File is missing on the server. Please contact support.');

  db.prepare('INSERT INTO downloads(user_id,product_id,ip) VALUES (?,?,?)').run(req.user.id, p.id, req.ip);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${slugify(p.title) || 'notes'}.pdf"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });

  const bigFile = (p.file_size || 0) > 40 * 1024 * 1024;
  if (settings.watermark === '1' && !isAdmin && !bigFile) {
    try {
      const pdf = await PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const text = latin(`Licensed to ${req.user.name} (${req.user.email}) - ${settings.site_name}. Sharing or reselling is not allowed.`);
      for (const page of pdf.getPages()) {
        const { width } = page.getSize();
        const size = 7;
        page.drawText(text, { x: Math.max(10, (width - font.widthOfTextAtSize(text, size)) / 2), y: 10, size, font, color: rgb(0.45, 0.45, 0.5) });
      }
      return res.send(Buffer.from(await pdf.save()));
    } catch (e) {
      console.error('[watermark] skipped:', e.message);   // fall back to the original file
    }
  }
  fs.createReadStream(file).pipe(res);
});

module.exports = router;
