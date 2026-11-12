// Adds sample subjects, sample PDFs and a coupon so you can see how the website looks.
// Run once with:  npm run seed:demo      (safe to delete the demo items later from the admin panel)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const config = require('../src/config');
const { db } = require('../src/db');

const subjectsByCourse = {
  entc: [[7, 'VLSI Design and Technology', '404181'], [7, 'Radiation and Microwave Theory', '404182'], [7, 'Cloud Computing', '404183'], [5, 'Digital Communication', '304181']],
  cse: [[5, 'Database Management Systems', '310241'], [5, 'Theory of Computation', '310242'], [5, 'Operating Systems', '310243'], [3, 'Data Structures', '210241']],
  it: [[5, 'Computer Networks', '314441'], [5, 'Software Engineering', '314442']],
  mechanical: [[5, 'Heat Transfer', '302041'], [5, 'Design of Machine Elements', '302042']],
};

async function makePdf(title, lines) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= 3; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(title, { x: 50, y: 780, size: 20, font: bold, color: rgb(0.1, 0.15, 0.4) });
    page.drawText(`Sample page ${i} of 3 (demo file, replace it from the admin panel)`, { x: 50, y: 755, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    lines.forEach((l, k) => page.drawText(l, { x: 50, y: 710 - k * 26, size: 13, font }));
  }
  const name = crypto.randomBytes(16).toString('hex') + '.pdf';
  const bytes = await pdf.save();
  fs.writeFileSync(path.join(config.pdfDir, name), bytes);
  return { name, size: bytes.length, pages: 3 };
}

(async () => {
  if (db.prepare('SELECT COUNT(*) c FROM subjects').get().c > 0) { console.log('Subjects already exist. Demo data was not added.'); return; }
  const insSub = db.prepare('INSERT INTO subjects(course_id,semester,name,code) VALUES (?,?,?,?)');
  const insProd = db.prepare(`INSERT INTO products(subject_id,type,title,description,price,exam_year,exam_session,file_name,original_name,file_size,pages)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const prices = [29, 59, 99];
  let n = 0;
  for (const [slug, list] of Object.entries(subjectsByCourse)) {
    const course = db.prepare('SELECT id FROM courses WHERE slug=?').get(slug);
    if (!course) continue;
    for (const [sem, name, code] of list) {
      const sid = insSub.run(course.id, sem, name, code).lastInsertRowid;
      const items = [
        ['notes', `${name} - Complete unit-wise notes`, 'Clear, exam-focused notes covering every unit.\nIncludes diagrams, formulas and short answers.', prices[n % 3], null, null],
        ['important', `${name} - Important questions`, 'The questions that repeat most often in university exams.', 29, null, null],
        ['pyq', `${name} - Solved paper`, 'Step-by-step solved answers with clear explanations.', 29, 2025, 'May-Jun'],
        ['pyq', `${name} - Solved paper`, 'Step-by-step solved answers with clear explanations.', 29, 2024, 'Nov-Dec'],
      ];
      if (n % 4 === 0) items.push(['notes', `${name} - Unit 1 free sample`, 'A free sample so you can see the quality of our notes.', 0, null, null]);
      for (const [type, title, desc, price, yr, ses] of items) {
        const f = await makePdf(title, ['This is a demo PDF created by the seed script.', 'Upload your real notes from the admin panel.', '', 'Unit 1: Introduction', 'Unit 2: Core concepts', 'Unit 3: Applications']);
        insProd.run(sid, type, title, desc, price, yr, ses, f.name, 'demo.pdf', f.size, f.pages);
      }
      n++;
    }
  }
  if (!db.prepare("SELECT 1 FROM coupons WHERE code='WELCOME10'").get()) db.prepare("INSERT INTO coupons(code,percent) VALUES ('WELCOME10',10)").run();
  console.log(`Demo data added: ${n} subjects with sample PDFs, and coupon WELCOME10.`);
})();
