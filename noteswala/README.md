# Notes Wala

A complete website to sell BE Engineering notes and PYQs as digital PDFs. Students browse by branch, semester and subject, pay with Razorpay, and download securely. You manage everything from `/admin`.

## Quick start

```
npm install
cp .env.example .env      # Windows: copy .env.example .env
# edit .env: set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed:demo         # optional sample data
npm start
```

Website: http://localhost:3000    Admin: http://localhost:3000/admin

With no Razorpay keys the site runs in demo payment mode (fake payments, local testing only).

Read **docs/GUIDE.md** for the full step-by-step guide: Razorpay setup, domain, hosting, publishing, backups and sharing on WhatsApp and Instagram.
