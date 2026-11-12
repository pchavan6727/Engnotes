(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  // ---------- small helpers ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  async function api(url, method = 'GET', body) {
    try {
      const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data };
    } catch (e) { return { ok: false, status: 0, data: { error: 'No internet connection. Please try again.' } }; }
  }

  // ---------- cart (kept in this browser) ----------
  const KEY = 'nw_cart';
  const getCart = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const setCart = (a) => { try { localStorage.setItem(KEY, JSON.stringify([...new Set(a)])); } catch (e) {} badge(); };
  function badge() {
    const n = getCart().length, el = $('#cartCount');
    if (el) { el.textContent = n; el.hidden = n === 0; }
  }
  badge();
  $$('[data-add]').forEach((b) => {
    if (getCart().includes(+b.dataset.add)) { b.textContent = 'In cart'; }
    b.addEventListener('click', () => {
      const id = +b.dataset.add;
      if (getCart().includes(id)) { location.href = '/cart'; return; }
      setCart([...getCart(), id]); b.textContent = 'In cart'; toast('Added to cart');
    });
  });
  $$('[data-buy]').forEach((b) => b.addEventListener('click', () => { setCart([...getCart(), +b.dataset.buy]); location.href = '/cart'; }));

  // ---------- menu, logout, share ----------
  const mb = $('#menuBtn');
  if (mb) mb.addEventListener('click', () => { const open = $('#nav').classList.toggle('open'); mb.setAttribute('aria-expanded', open); });
  $$('[data-logout]').forEach((b) => b.addEventListener('click', async () => { await api('/api/auth/logout', 'POST'); location.href = '/'; }));
  $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    const text = (b.dataset.text || '') + ' ' + location.href;
    if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ title: b.dataset.title, text: b.dataset.text, url: location.href }); return; } catch (e) { return; }
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }));

  // ---------- generic forms (login, register, contact, profile) ----------
  $$('form[data-api]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.form-error', f), btn = $('button[type=submit]', f);
    err.textContent = ''; btn.disabled = true;
    const body = Object.fromEntries(new FormData(f).entries());
    const r = await api(f.dataset.api, f.dataset.method || 'POST', body);
    btn.disabled = false;
    if (!r.ok) { err.textContent = r.data.error || 'Something went wrong. Please try again.'; return; }
    if (f.dataset.redirect) { location.href = f.dataset.redirect; return; }
    if (f.hasAttribute('data-reset')) f.reset();
    toast(f.dataset.toast || 'Saved');
  }));

  // ---------- cart page + checkout ----------
  const app = $('#cartApp');
  if (app) {
    let coupon = '';
    const load = async () => {
      const ids = getCart();
      if (!ids.length) { app.className = ''; app.innerHTML = '<div class="empty card"><h3>Your cart is empty</h3><p>Find your subject and add the notes you need.</p><a class="btn" href="/courses">Browse notes</a></div>'; return; }
      const r = await api('/api/cart?ids=' + ids.join(',') + (coupon ? '&coupon=' + encodeURIComponent(coupon) : ''));
      if (!r.ok) { app.innerHTML = '<p class="form-error">Could not load your cart. Please refresh.</p>'; return; }
      render(r.data);
    };
    function render(d) {
      const valid = d.items.map((i) => i.id);
      if (valid.length !== getCart().length) setCart(valid);           // drop items that were removed from the shop
      if (!d.items.length) return load();
      const payable = d.items.filter((i) => !i.owned);
      app.className = 'cart-grid';
      app.innerHTML = `
        <div class="list">${d.items.map((i) => `
          <div class="card row">
            <div class="row-main"><h3><a href="/product/${i.id}">${esc(i.title)}</a></h3>
              <p class="pcard-meta">${esc(i.subject)} · ${esc(i.course)} Sem ${i.semester}${i.owned ? ' · <strong>You already own this</strong>' : ''}</p></div>
            <div class="row-side"><span class="price ${i.price === 0 ? 'price-free' : ''}">${i.owned ? '' : (i.price === 0 ? 'Free' : inr(i.price))}</span>
              <button class="link-btn" data-rm="${i.id}" type="button" aria-label="Remove ${esc(i.title)}">Remove</button></div>
          </div>`).join('')}</div>
        <aside class="card summary">
          <h2>Order summary</h2>
          <div class="sum-row"><span>Subtotal</span><span>${inr(d.subtotal)}</span></div>
          ${d.discount ? `<div class="sum-row good"><span>Coupon ${esc(d.couponApplied.code)} (${d.couponApplied.percent}% off)</span><span>− ${inr(d.discount)}</span></div>` : ''}
          <div class="sum-row total"><span>Total</span><span>${inr(d.total)}</span></div>
          <form id="couponForm" class="coupon"><input name="c" placeholder="Coupon code" value="${esc(coupon)}" aria-label="Coupon code"><button class="btn btn-ghost btn-sm" type="submit">Apply</button></form>
          <p class="form-error" id="cartErr" role="alert">${esc(d.couponError || '')}</p>
          ${payable.length ? `<button class="btn btn-block" id="payBtn" type="button">${d.total === 0 ? 'Get for free' : 'Pay ' + inr(d.total)}</button>
          <p class="fine">${d.loggedIn ? 'Secure payment by Razorpay: UPI, cards, net banking.' : 'You will be asked to log in before paying.'}</p>` : '<a class="btn btn-block" href="/account">Go to My purchases</a>'}
        </aside>`;
      $$('[data-rm]', app).forEach((b) => b.addEventListener('click', () => { setCart(getCart().filter((x) => x !== +b.dataset.rm)); load(); }));
      $('#couponForm', app).addEventListener('submit', (e) => { e.preventDefault(); coupon = new FormData(e.target).get('c').trim(); load(); });
      const pb = $('#payBtn', app); if (pb) pb.addEventListener('click', () => pay(pb, d));
    }

    async function pay(btn, d) {
      const err = $('#cartErr'); err.textContent = ''; btn.disabled = true;
      const r = await api('/api/checkout', 'POST', { ids: getCart(), coupon });
      if (r.status === 401) { location.href = '/login?next=/cart'; return; }
      if (!r.ok) { err.textContent = r.data.error || 'Could not start payment.'; btn.disabled = false; return; }
      const o = r.data, done = () => { setCart([]); location.href = '/account'; };
      if (o.free) return done();
      if (o.demo) {
        if (!confirm('DEMO MODE: this will pretend to take payment of ' + inr(o.amount / 100) + '. Continue?')) { btn.disabled = false; return; }
        const p = await api('/api/payment/demo', 'POST', { orderId: o.orderId });
        if (!p.ok) { err.textContent = p.data.error; btn.disabled = false; return; }
        return done();
      }
      if (!window.Razorpay) { err.textContent = 'Payment window could not load. Check your internet and try again.'; btn.disabled = false; return; }
      const rz = new window.Razorpay({
        key: o.key, amount: o.amount, currency: 'INR', order_id: o.razorpayOrderId, name: document.title.split(' | ').pop().split(' - ')[0] || 'Notes Wala',
        description: d.items.length + (d.items.length === 1 ? ' item' : ' items'),
        prefill: { name: o.name, email: o.email, contact: o.phone }, theme: { color: '#2438D8' },
        handler: async (resp) => {
          btn.textContent = 'Confirming payment…';
          const v = await api('/api/payment/verify', 'POST', resp);
          if (v.ok) return done();
          err.textContent = v.data.error || 'We could not confirm the payment.'; btn.disabled = false;
        },
        modal: { ondismiss: () => { btn.disabled = false; } },
      });
      rz.on('payment.failed', (x) => { err.textContent = (x.error && x.error.description) || 'Payment failed. Please try again.'; btn.disabled = false; });
      rz.open();
    }
    load();
  }
})();
