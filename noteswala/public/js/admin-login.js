document.getElementById('adminLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { document.getElementById('loginErr').textContent = d.error || 'Login failed.'; return; }
  if (d.role !== 'admin') { document.getElementById('loginErr').textContent = 'This account is not an admin.'; await fetch('/api/auth/logout', { method: 'POST' }); return; }
  location.reload();
});
