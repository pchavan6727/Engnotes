# Notes Wala: complete guide

This guide explains everything in simple English, from planning to getting your first sale.
The full working website is already built for you in this folder. You do not need to write code. You only need to follow the steps.

---

## 1. What you are getting

| Part | What it does |
|---|---|
| Student website | Home, branches, semesters, subjects, PYQ section, product page, cart, login, My purchases, contact |
| Admin panel (`/admin`) | Upload PDFs, set prices, manage courses and subjects, see orders and revenue, manage students and downloads, coupons, messages, settings |
| Payments | Razorpay (UPI, cards, net banking, wallets). Payment is checked on the server before any file is unlocked |
| Secure downloads | PDFs are stored in a private folder. Only the student who paid can download. Every page carries the buyer's name and email. A download limit applies |
| Sharing | Clean links and a share image, so WhatsApp and Instagram show a nice preview. Share buttons on every product |

Everything you change (notes, prices, courses, contact details, banner message) is done from the admin panel. You never edit code for daily work.

---

## 2. Which technology should you use?

You asked me to compare three ways of building this.

| | Custom website (what I built) | Digital product platform (Gumroad, Instamojo, Razorpay Payment Pages, Topmate-style tools) | Existing e-commerce (Shopify, WooCommerce) |
|---|---|---|---|
| Setup time | You run the ready project | Fastest, a few hours | Days to weeks |
| Monthly cost | Hosting about ₹400 to ₹800 | Usually free to start, but they take a cut of each sale | Shopify has a monthly plan plus apps for digital downloads. WooCommerce is free but needs hosting and plugins |
| Cost per sale | Only the Razorpay fee (about 2% plus GST, check Razorpay's current pricing) | Gateway fee plus the platform's own fee | Gateway fee plus plan or app fees |
| Course, semester, subject, PYQ structure | Built exactly for this | Weak. Mostly a flat list of products | Possible, but needs setup and extra plugins |
| Your own brand and domain | Yes, fully | Limited | Yes |
| Secure download and watermark | Built in | Basic | Needs paid plugins |
| Growing later (app, bundles, subscriptions) | Easy, you own the code | Limited | Medium |

**My recommendation: the custom website.** Your business is built around course, semester, subject and exam year. Platforms treat every PDF as a separate product, so students struggle to find things. With a custom site you pay no platform commission, you own your student list, and the admin panel is made for how you work.

If you want to test demand before spending anything, start by sharing a few PDFs through a Razorpay Payment Page link on WhatsApp. When sales begin, move to this website.

**Technology used (all free and popular):**

| Layer | Choice | Why |
|---|---|---|
| Server | Node.js with Express | One language for everything, easy to host |
| Database | SQLite (one file) | No database server to install or pay for. Handles thousands of students. Easy to back up |
| Pages | EJS templates with plain CSS and JavaScript | Fast on cheap phones, good for Google and WhatsApp previews |
| Payments | Razorpay | Trusted in India, UPI support, simple setup |
| PDF stamping | pdf-lib | Adds buyer name and email to each page |
| Security | bcrypt passwords, signed login cookie, rate limits, Helmet headers | Protects accounts and downloads |

---

## 3. Step-by-step: from idea to first sale

### Step 1. Website planning and design

Decide these before you upload anything:

1. **Branches** you will sell for. The site starts with CSE, IT, AIDS, ENTC, Civil and ME. Add or remove them in the admin panel.
2. **Subjects**. For one semester, list every subject with its code (for example 404181).
3. **What you sell per subject:** full notes, handwritten notes, important questions, solved PYQs by year.
4. **Price list.** Suggested starting prices:
   - Important questions or one solved paper: ₹29
   - Unit-wise notes for one subject: ₹59
   - Full handwritten notes or a complete subject pack: ₹99
5. **Names for files.** Use clear titles such as `VLSI Design - Complete unit-wise notes`. Students search by these words.

The design is already done: a notebook-paper look (ruled lines, a red margin line, pen-blue and highlighter-yellow), big search box on the home page, and the path Branch, then Semester, then Subject, then Product.

### Step 2. Choosing the technology

Already decided in section 2. Nothing to do here.

### Step 3. Set up your computer (one time)

1. Install **Node.js LTS** (version 20 or 22) from https://nodejs.org. Accept the defaults.
2. Install **VS Code** from https://code.visualstudio.com (optional but useful for reading files).
3. Open a terminal (on Windows: search "PowerShell") and check:
   ```
   node -v
   npm -v
   ```
   Both should print a version number.

### Step 4 to 8. Run the website on your computer

Unzip the project, open a terminal inside the `noteswala` folder, then:

```
npm install
copy .env.example .env        (Windows)     or     cp .env.example .env   (Mac / Linux)
```

Open the `.env` file in any text editor and change:

- `JWT_SECRET` to a long random text. Create one with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` to your own. **Do this before the first start.** The admin account is created the first time the server starts.

Start it:

```
npm start
```

Open http://localhost:3000. Admin panel: http://localhost:3000/admin.

Want to see it filled with sample subjects and sample PDFs first? Stop the server (Ctrl + C) and run:

```
npm run seed:demo
npm start
```

You can delete the demo items later from the admin panel.

While `RAZORPAY_KEY_ID` is empty, the site runs in **demo payment mode**. A yellow bar appears and "payments" are fake and free. This is only for testing on your own computer. It is switched off automatically on the live site.

Run the automatic checks any time (server must be running):

```
npm test
```

### Folder structure

```
noteswala/
├─ server.js                 Starts the website
├─ package.json              List of libraries
├─ .env                      Your secrets and settings (never share this file)
├─ src/
│  ├─ config.js              Reads .env
│  ├─ db.js                  Creates the database tables
│  ├─ middleware.js          Login checks and protection
│  ├─ util.js                Small helpers
│  └─ routes/
│     ├─ web.js              Student pages
│     ├─ auth.js             Register, login, profile
│     ├─ shop.js             Cart, checkout, Razorpay, webhook, contact form
│     ├─ download.js         Secure PDF download and name stamping
│     └─ admin.js            Everything the admin panel does
├─ views/                    Page templates (home.ejs, product.ejs, admin.ejs ...)
├─ public/                   CSS, JavaScript, images (the only folder visitors can open)
├─ storage/pdfs/             Your PDFs. Private. Visitors can never open this folder
├─ data/noteswala.db         Your database (students, orders, prices)
├─ scripts/                  Demo data and automatic tests
└─ docs/GUIDE.md             This guide
```

### Database structure

| Table | Holds |
|---|---|
| `users` | Students and admin: name, email, phone, password (scrambled), role, blocked or not |
| `courses` | Branches: name, short code, icon, order, visible |
| `subjects` | Subject name, code, semester (1 to 8), which course |
| `products` | Each PDF: title, type, price, exam year and session, file name, pages, size, visible |
| `orders` | Each purchase: student, amount, discount, coupon, status, Razorpay IDs, date |
| `order_items` | Which PDFs were in each order, and the price at that time |
| `downloads` | Every download: who, which file, when, from which IP |
| `coupons` | Code, percent off, usage limit, active |
| `messages` | Contact form messages |
| `settings` | Website name, banner, WhatsApp number, download limit, watermark on or off |

### How to use the admin panel (daily work)

1. Open `/admin` and log in.
2. **Courses and subjects:** add a subject (course, semester, name, code).
3. **Notes and PYQs, then Upload new PDF:** choose course and subject, type, price (tap ₹29, ₹59, ₹99 or Free), title, description, PDF. For PYQs, set the year and session.
4. **Change a price:** edit the number in the table. It saves by itself. No code needed.
5. **Hide an item** from the site: Edit, untick "Show on website".
6. **Orders:** search by name, email or payment ID. Download all orders as CSV for your accounts.
7. **Give access by hand:** if someone paid you directly on UPI, use this to unlock a file for their account.
8. **Students:** block a student who shares files, or reset a password.
9. **Downloads:** if a student reaches the download limit, reset their count.
10. **Settings:** website name, banner message, WhatsApp number, Instagram link, download limit.

Files that have already been sold cannot be deleted (buyers must keep access). They are hidden instead.

### Step 7. How PDF upload and download works

- Upload: only real PDF files are accepted (the file is checked, not just the name). Maximum size is 50 MB, changeable with `MAX_UPLOAD_MB` in `.env`.
- The file is saved in `storage/pdfs/` with a random name. Students never see this name or path.
- Download: the student must be logged in and must own the file. The server then adds a footer, "Licensed to Name (email)", to every page and sends it.
- Limit: 5 downloads per purchase by default. Change it in Settings.
- Every download is logged with time and IP address.

**Be honest with yourself about protection:** nothing stops a determined person from taking screenshots. What this system does is stop casual sharing, make leaks traceable to one buyer, and make sure only paying students can get the file. That is the realistic standard for digital notes.

### Step 8. Online payments with Razorpay

1. Create an account at https://razorpay.com and finish the KYC (PAN, bank account, business details). A sole proprietor can sign up with a personal PAN and bank account.
2. Open **Dashboard, then Account & Settings, then API Keys**. Switch to **Test mode** and generate keys. You get a Key ID (starts with `rzp_test_`) and a Key Secret.
3. Put them in `.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxx
   ```
4. Restart the server. The yellow demo bar disappears and the console says "Razorpay TEST mode".
5. Buy something as a student. Razorpay's test page has test UPI and cards. Use the details from Razorpay's documentation ("Test card details").
6. Check the order in Admin, then Orders. Check the download works.
7. **Webhook (recommended):** a webhook lets Razorpay tell your site about a payment even if the student closes the browser right after paying. In the Razorpay dashboard open **Settings, then Webhooks, then Add**:
   - URL: `https://yourdomain.in/api/razorpay/webhook`
   - Secret: any long text. Put the same text in `.env` as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured` and `order.paid`
   (This needs the live website, so do it after Step 11.)
8. **Going live:** when Razorpay approves your account, generate **Live** keys (`rzp_live_`), replace the test keys in `.env` on your server, and restart.

How safety works: the price always comes from your database, never from the browser. After payment, the server checks Razorpay's signature. Only then is the file unlocked.

Razorpay asks for a website with contact details, terms, refund policy and privacy policy. They are already included at `/contact` and `/terms`. Read `/terms` and edit `views/terms.ejs` so it matches your real refund rules.

### Step 9. Test the complete website

Run `npm test` for the automatic checks (52 checks cover login, uploads, prices, payments in demo mode, downloads, limits, coupons, admin reports and security).

Then test by hand, using your phone on the same Wi-Fi if you can (open `http://YOUR-PC-IP:3000`):

- [ ] Home page, search, branch, semester, subject, product page all open
- [ ] Register a new student, add two items, apply a coupon, pay (test mode)
- [ ] File appears in My purchases and downloads
- [ ] The downloaded PDF shows your name at the bottom of each page
- [ ] A second account cannot download the first account's file
- [ ] Admin: upload a PDF, change a price, see the order and revenue
- [ ] Contact form message reaches the admin Messages tab
- [ ] Pages look right on a small phone screen

### Step 10. Buy a domain and hosting

**Domain:** buy a `.in` or `.com` name, for example `noteswala.in`. Cheap and trusted sellers include GoDaddy, Namecheap, Hostinger and BigRock. Expect roughly ₹500 to ₹1,200 per year (prices change, compare before you buy).

**Hosting:** your site needs a small server that runs Node.js and keeps files on disk. Good choices:

| Option | Cost (approx.) | Notes |
|---|---|---|
| A small VPS (Hostinger, DigitalOcean, Hetzner, AWS Lightsail) with Ubuntu | ₹400 to ₹800 per month | Best control. Steps below |
| Render or Railway with a persistent disk | ₹500 to ₹1,000 per month | Easier setup. You **must** attach a persistent disk for `data/` and `storage/`, or your uploads vanish on restart |

Cheap shared hosting (cPanel PHP plans) usually **cannot** run this project.
Please check current prices on each site before paying.

### Step 11. Publish the website (VPS with Ubuntu)

Connect to your server (`ssh root@YOUR_SERVER_IP`), then run these one block at a time.

**a) Install Node.js, Nginx and tools**
```
apt update && apt install -y nginx git unzip curl sqlite3 certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs build-essential python3
npm install -g pm2
```

**b) Upload your project.** From your computer, zip the project **without** the `node_modules` folder and copy it:
```
scp noteswala.zip root@YOUR_SERVER_IP:/var/www/
```
On the server:
```
mkdir -p /var/www/noteswala && cd /var/www/noteswala && unzip ../noteswala.zip
npm install --omit=dev
```

**c) Set your live settings** (`nano .env`):
```
NODE_ENV=production
SITE_URL=https://yourdomain.in
PORT=3000
JWT_SECRET=<long random text>
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<strong password>
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

**d) Keep it running**
```
pm2 start server.js --name noteswala
pm2 save && pm2 startup
```

**e) Point your domain.** At your domain seller, add an **A record** for `@` (and `www`) pointing to YOUR_SERVER_IP. Wait 10 to 60 minutes.

**f) Nginx** (`nano /etc/nginx/sites-available/noteswala`):
```
server {
    server_name yourdomain.in www.yourdomain.in;
    client_max_body_size 60m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```
ln -s /etc/nginx/sites-available/noteswala /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.in -d www.yourdomain.in
```
Certbot installs the free HTTPS certificate. HTTPS is required for safe logins and payments.

**g) Backups (very important).** Your business lives in two places: `data/` and `storage/pdfs/`. Save them every night:
```
mkdir -p /root/backups
crontab -e
```
Add this line:
```
0 3 * * * cd /var/www/noteswala && sqlite3 data/noteswala.db ".backup '/root/backups/db-$(date +\%F).db'" && tar czf /root/backups/pdfs-$(date +\%F).tgz storage/pdfs && find /root/backups -mtime +14 -delete
```
Also download a copy to your own computer or Google Drive once a week. Many VPS providers offer paid snapshots too.

**h) Updating later:** upload changed files, then `pm2 restart noteswala`.

**i) First checks after going live:** open `/admin`, change nothing yet, upload one real PDF with a ₹29 price, buy it yourself with a real ₹29 payment (you can refund it from Razorpay), then add the webhook from Step 8.

### Step 12. Share the link with students

Your link is `https://yourdomain.in`. Every page has its own link and preview image.

**WhatsApp**
- Post in class groups: `Exam notes for ENTC Sem 7: https://yourdomain.in/course/entc/sem/7 . Notes from ₹29, PDF download instantly.`
- Share direct subject links (`/subject/12`) so students land exactly on what they need.
- Use the **Share** button on any product page.
- Set your WhatsApp number in Admin, then Settings. A WhatsApp chat button appears on every page.
- Create a WhatsApp Channel for exam updates and offers.

**Instagram**
- Put the link in your bio. Use a link tool like Linktree only if you want several links.
- Post short reels: "5 most repeated questions in DBMS". End with "full notes at the link in bio".
- Share a story sticker link to a subject page before exams.

**Other ideas:** Telegram groups, college Discord or Facebook groups, and posters with a QR code (any free QR generator works with your link).

**Offers:** create coupons in Admin, then Coupons (for example `EXAM10` for 10%), and show them in the top banner in Settings.

---

## 4. Rules for your business

- **Sell only your own work.** Do not upload notes or papers copied from other websites or publishers. The sample sites you showed me (and their paid courses) belong to other people. Student marketplaces get removed, and Razorpay can close your account, over copied material. Past university question papers are public exam papers, but your solutions and notes must be your own.
- **Policies.** Edit `/terms` to match what you will really do about refunds.
- **Tax.** Keep your CSV order exports. Ask a CA about income tax and when GST registration becomes necessary as your sales grow.
- **Password hygiene.** Change the admin password from "My purchases" after you first log in, and never share your `.env` file.

---

## 5. Useful improvements for later

1. **Bundles:** "All Sem 7 ENTC notes for ₹149". The cart already supports many items, so a bundle is a product with a ZIP or a list of items.
2. **Email receipts and password reset** using an email service (Brevo, Resend, Amazon SES).
3. **Free sample pages:** a 2-page preview PDF on every product page to build trust.
4. **Student reviews** and a "Most bought" row on the home page.
5. **Referral coupons:** each student gets a code that gives a friend 10% off.
6. **Exam countdown banner** and a seasonal offer (set it from Settings today).
7. **Google sign-in** so students do not need a password.
8. **Analytics:** add Google Analytics or Plausible to see which subjects get visits.
9. **Mobile app (PWA)** so students can "install" the site on their phone.
10. **Multiple admins** (for example a friend who uploads notes for another branch).
11. **Video links and quizzes** as extra paid material.
12. **Automatic backups to cloud storage** (Google Drive, S3).

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails on `better-sqlite3` (Windows) | Install the latest Node LTS. If it still fails, install "Desktop development with C++" from Visual Studio Build Tools, then try again |
| Port 3000 already in use | Change `PORT` in `.env` |
| I forgot the admin password | Log in to the server and run: `node -e "const b=require('bcryptjs');const {db}=require('./src/db');db.prepare('UPDATE users SET password_hash=? WHERE role=\'admin\'').run(b.hashSync('NewPassword123',10))"` |
| Student paid but cannot download | Admin, then Orders, search the payment ID. If status is "not completed", check Razorpay for the payment. If it is captured, use "Give access by hand". Set up the webhook so this does not happen again |
| Razorpay window does not open | Check that live or test keys are in `.env` and that you restarted the server |
| Uploads fail on the live site | Nginx needs `client_max_body_size 60m;` (see Step 11f) |
| Login does not stay on the live site | The site must run on HTTPS with `SITE_URL` set to the `https://` address |
| Files vanished after redeploy | `data/` and `storage/pdfs/` must be on a persistent disk and never overwritten when you upload new code |
