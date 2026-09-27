/* ==========================================================================
   BOCO-FI · user app
   Views: auth · home · wallet · recycle · wifi · redeem · machines · history ·
          notifications · leaderboard · profile · help
   Balances: stacked points · coin balance (₱) · Wi-Fi time remaining
   ========================================================================== */
(function () {
  'use strict';
  const DB = window.BocofiDB;
  const { esc, fmtPeso, fmtPts, fmtDate, round2 } = DB.util;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const themeColor = $('meta[name="theme-color"]');
  if (themeColor) themeColor.content = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
  const view = $('#view');
  const ROUTES = ['home', 'wallet', 'recycle', 'wifi', 'redeem', 'machines', 'history', 'notifications', 'leaderboard', 'profile', 'help'];
  const TITLES = { home: 'Dashboard', wallet: 'Wallet', recycle: 'Recycle', wifi: 'Wi-Fi', redeem: 'Rewards', machines: 'Find a machine', history: 'History', notifications: 'Notifications', leaderboard: 'Leaderboard', profile: 'Profile & settings', help: 'Help' };
  let authTab = 'login';
  let histFilter = 'all';

  const ICON = {
    coins: '<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="9" r="6"/><path d="M14.5 8.2A6 6 0 1 1 8.2 14.5"/></svg>',
    wifi: '<svg class="ico" viewBox="0 0 24 24"><path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/></svg>',
    pts: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 7a8 3 0 0 1 16 0v10a8 3 0 0 1-16 0z"/><path d="M4 7a8 3 0 0 0 16 0M4 12a8 3 0 0 0 16 0"/></svg>',
    qr: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v7h-7"/></svg>',
    swap: '<svg class="ico" viewBox="0 0 24 24"><path d="M7 4v13M3 13l4 4 4-4M17 20V7M13 11l4-4 4 4"/></svg>',
    pin: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    cash: '<svg class="ico" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>',
    gift: '<svg class="ico" viewBox="0 0 24 24"><path d="M20 12v8H4v-8M2 7h20v5H2zM12 7v13M12 7c-2-4-6-3-6-1s3 1 6 1M12 7c2-4 6-3 6-1s-3 1-6 1"/></svg>',
    warn: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 3l10 18H2zM12 10v5M12 18h.01"/></svg>',
    trophy: '<svg class="ico" viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M5 4h14v4a7 7 0 0 1-14 0zM5 6H2a3 3 0 0 0 3 3M19 6h3a3 3 0 0 1-3 3"/></svg>',
    info: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/></svg>',
  };
  const C = { coins: 'var(--coin)', wifi: 'var(--wifi)', pts: 'var(--green-500)', warn: 'var(--warn)', info: 'var(--info)', tier: 'var(--c-rewards)' };
  const tiers = () => cfg().tiers || [];
  const DIST = { 'BCF-001': 0.4, 'BCF-002': 1.2, 'BCF-003': 2.8 }; // demo distances (km)
  /* ---------- helpers ---------- */
  function toast(msg, kind = '') { const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg; $('#toasts').appendChild(el); setTimeout(() => el.remove(), 2800); }
  const me = () => DB.users.current();
  const cfg = () => DB.config.get();
  const initials = (n) => String(n || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const pesos = (pts) => round2(pts / cfg().pointsPerPeso);
  const ptsPerMin = () => cfg().pointsPerPeso / cfg().wifiMinutesPerPeso;
  const minutesFor = (pts) => Math.floor(pts / ptsPerMin());
  const fmtMin = (m) => { m = Math.max(0, m); const h = Math.floor(m / 60), mm = Math.floor(m % 60); return h ? `${h}h ${mm}m` : `${mm} min`; };
  const fmtClock = (sec) => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
  const ago = (ts) => { const d = Date.now() - ts; if (d < 60e3) return 'now'; if (d < 3600e3) return Math.floor(d / 60e3) + 'm'; if (d < 86400e3) return Math.floor(d / 3600e3) + 'h'; return Math.floor(d / 86400e3) + 'd'; };
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
  function tierOf(bottles) {
    const list = tiers();
    let t = list[0] || { name: 'Member', min: 0, emoji: '' }; list.forEach((x) => { if (bottles >= x.min) t = x; });
    const next = list[list.indexOf(t) + 1] || null;
    return { t, next, progress: next ? (bottles - t.min) / (next.min - t.min) : 1 };
  }
  const rankOf = (u) => DB.users.all().slice().sort((a, b) => (b.bottles || 0) - (a.bottles || 0)).findIndex((x) => x.id === u.id) + 1;
  const wifiLeftLabel = (u) => (u.wifiSession ? fmtClock(wifiRemaining(u) * 60) : fmtMin(u.wifiMinutes));

  /* ---------- Wi-Fi time bank ---------- */
  function wifiRemaining(u) { if (!u.wifiSession) return u.wifiMinutes || 0; return Math.max(0, u.wifiSession.minutesAtStart - (Date.now() - u.wifiSession.startedAt) / 60000); }
  function wifiConnect(u) {
    if ((u.wifiMinutes || 0) <= 0.05) { toast('No Wi-Fi time left. Convert points to top up.', 'danger'); return; }
    DB.users.patch(u.id, { wifiSession: { startedAt: Date.now(), minutesAtStart: u.wifiMinutes, code: 'BC-' + Math.random().toString(16).slice(2, 6).toUpperCase() } });
    toast('Connected to BOCO-FI Wi-Fi', 'ok');
  }
  function wifiDisconnect(u, quiet) {
    if (!u.wifiSession) return;
    const rem = wifiRemaining(u); const used = round2(u.wifiSession.minutesAtStart - rem);
    DB.users.patch(u.id, { wifiMinutes: Math.round(rem * 100) / 100, wifiSession: null });
    if (used >= 0.05) DB.transactions.add({ machineId: null, userId: u.id, items: [], total: 0, reward: 'wifi-use', points: 0, minutes: used });
    if (!quiet) toast(`Disconnected · ${fmtMin(used)} used`);
  }
  /** add minutes to the bank, keeping a running session's countdown in sync */
  function addWifiTime(u, minutes) {
    DB.users.addWifi(u.id, minutes);
    if (u.wifiSession) DB.users.patch(u.id, { wifiSession: { ...u.wifiSession, minutesAtStart: u.wifiSession.minutesAtStart + minutes } });
  }

  /* ---------- notifications (derived from shared data) ---------- */
  const TX_NOTE = {
    save: ['Points added', (t) => `+${t.points} pts saved from ${t.items.length} item${t.items.length === 1 ? '' : 's'}`, 'pts', ICON.pts],
    coins: ['Coins dispensed', (t) => `${fmtPeso(t.total)} in coins at the kiosk`, 'coins', ICON.coins],
    wifi: ['Wi-Fi voucher issued', (t) => `${t.minutes} min · code ${t.voucherCode || ''}`, 'wifi', ICON.wifi],
    claim: ['Wi-Fi claimed', (t) => `${t.minutes} min voucher from ${Math.abs(t.points)} pts`, 'wifi', ICON.wifi],
    'convert-coins': ['Points converted to coins', (t) => `${Math.abs(t.points)} pts → ${fmtPeso(t.total)}`, 'coins', ICON.swap],
    'convert-wifi': ['Points converted to Wi-Fi', (t) => `${Math.abs(t.points)} pts → ${fmtMin(t.minutes)}`, 'wifi', ICON.swap],
    cashout: ['Cash-out code created', (t) => `${fmtPeso(t.total)} · show ${t.code} at a kiosk`, 'coins', ICON.cash],
    'cashout-cancel': ['Cash-out cancelled', (t) => `${fmtPeso(t.total)} returned to coin balance`, 'coins', ICON.cash],
    'wifi-use': ['Wi-Fi session ended', (t) => `${fmtMin(t.minutes)} used`, 'wifi', ICON.wifi],
    'voucher-add': ['Voucher added to your time', (t) => `+${t.minutes} min from ${t.voucherCode}`, 'wifi', ICON.wifi],
    bundle: ['Reward redeemed', (t) => `${t.label} for ${Math.abs(t.points)} pts`, 'tier', ICON.gift],
  };
  function notifsFor(u) {
    const list = [];
    DB.transactions.forUser(u.id).slice(0, 25).forEach((t) => { const n = TX_NOTE[t.reward]; if (n) list.push({ id: 'tx-' + t.id, ts: t.ts, title: n[0], body: n[1](t), color: C[n[2]], icon: n[3], view: 'history' }); });
    if (u.prefs && u.prefs.notifs === false) return list.sort((a, b) => b.ts - a.ts).map((n) => ({ ...n, read: true }));
    DB.vouchers.forUser(u.id).forEach((v) => { if (DB.vouchers.status(v) === 'active' && v.expiresAt - Date.now() < 6 * 3600e3) list.push({ id: 'vx-' + v.code, ts: v.expiresAt - 6 * 3600e3, title: 'Voucher expiring soon', body: `${v.code} expires ${fmtDate(v.expiresAt)}. Add it to your Wi-Fi time.`, color: C.warn, icon: ICON.warn, view: 'wifi' }); });
    DB.cashouts.forUser(u.id).forEach((c) => { if (c.status === 'paid') list.push({ id: 'co-' + c.code, ts: c.paidAt, title: 'Cash-out collected', body: `${fmtPeso(c.amount)} paid out${c.machineId ? ' at ' + c.machineId : ''}`, color: C.coins, icon: ICON.cash, view: 'wallet' }); });
    if (!u.wifiSession && u.wifiMinutes > 0 && u.wifiMinutes < 5) list.push({ id: 'wifi-low', ts: Date.now() - 5 * 60e3, title: 'Wi-Fi time running low', body: `Only ${fmtMin(u.wifiMinutes)} left. Convert points to top up.`, color: C.warn, icon: ICON.wifi, view: 'wifi' });
    DB.machines.all().forEach((m) => { if (m.status !== 'online') list.push({ id: 'm-' + m.id + '-' + m.status, ts: Date.now() - 2 * 3600e3, title: `${m.name} is under ${m.status}`, body: 'Try another BOCO-FI machine nearby.', color: C.info, icon: ICON.pin, view: 'machines' }); });
    const tier = tierOf(u.bottles || 0);
    list.push({ id: 'tier-' + tier.t.name, ts: u.createdAt, title: `${tier.t.emoji} You're a ${tier.t.name}!`, body: tier.next ? `${tier.next.min - (u.bottles || 0)} more items to reach ${tier.next.name}.` : 'You reached the top tier. Amazing!', color: C.tier, icon: ICON.trophy, view: 'leaderboard' });
    return list.sort((a, b) => b.ts - a.ts).map((n) => ({ ...n, read: (u.notifRead || []).includes(n.id) }));
  }
  const unreadCount = (u) => notifsFor(u).filter((n) => !n.read).length;

  /* ---------- weekly chart ---------- */
  function weekly(u) {
    const tx = DB.transactions.forUser(u.id); const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const s = d.getTime(), e = s + 86400e3;
      days.push({ label: d.toLocaleDateString([], { weekday: 'narrow' }), n: tx.filter((t) => t.ts >= s && t.ts < e).reduce((a, t) => a + t.items.length, 0), today: i === 0 });
    }
    return days;
  }

  /* ---------- drawer ---------- */
  const drawer = $('#drawer'), overlay = $('#drawerOverlay');
  function openDrawer() { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); overlay.hidden = false; $('#btnMenu').setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; }
  function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); overlay.hidden = true; $('#btnMenu').setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
  $('#btnMenu').addEventListener('click', openDrawer);
  $('#navMenu').addEventListener('click', openDrawer);
  $('#btnCloseDrawer').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  function logout() { const u = me(); if (u) wifiDisconnect(u, true); DB.users.logout(); authTab = 'login'; closeDrawer(); location.hash = '#/home'; render(); }
  $('#btnDrawerLogout').addEventListener('click', logout);

  /* ---------- router ---------- */
  function route() { const h = (location.hash || '#/home').replace(/^#\/?/, '').split('?')[0]; return ROUTES.includes(h) ? h : 'home'; }
  function goto(v) { closeDrawer(); if (route() === v) render(); else location.hash = '#/' + v; }
  window.addEventListener('hashchange', render);
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b && !b.disabled) { e.preventDefault(); goto(b.dataset.view); } });

  function render() {
    const u = me();
    $('#shellHdr').hidden = !u; $('#nav').hidden = !u;
    if (!u) { closeDrawer(); document.title = 'BOCO-FI · Log in'; view.innerHTML = VIEWS.auth(); AFTER.auth(); return; }
    if (u.wifiSession && wifiRemaining(u) <= 0) { wifiDisconnect(u, true); toast('Your Wi-Fi time is used up'); return render(); }
    const v = route();
    document.title = 'BOCO-FI · ' + TITLES[v];
    $('#hdrAvatar').textContent = initials(u.name); $('#dAvatar').textContent = initials(u.name); $('#dName').textContent = u.name;
    const tier = tierOf(u.bottles || 0); $('#dTier').textContent = `${tier.t.emoji} ${tier.t.name} · ${u.points.toLocaleString()} pts`;
    const n = unreadCount(u);
    $('#bellBadge').hidden = !n; $('#bellBadge').textContent = n > 9 ? '9+' : n;
    $('#dBadge').hidden = !n; $('#dBadge').textContent = n;
    view.innerHTML = VIEWS[v](u);
    if (AFTER[v]) AFTER[v](u);
    $$('#nav button, #drawerNav button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    view.scrollTop = 0; window.scrollTo(0, 0);
  }

  /* ---------- shared fragments ---------- */
  const TX_META = {
    coins: ['Coins dispensed', C.coins, ICON.coins, (t) => `<div class="amt">${fmtPeso(t.total)}<small>coins</small></div>`],
    wifi: ['Wi-Fi voucher', C.wifi, ICON.wifi, (t) => `<div class="amt">${t.minutes || 0} min<small>${esc(t.voucherCode || '')}</small></div>`],
    save: ['Points saved', C.pts, ICON.pts, (t) => `<div class="amt" style="color:var(--green-700)">+${t.points} pts<small>${fmtPeso(t.total)}</small></div>`],
    claim: ['Wi-Fi claimed', C.wifi, ICON.wifi, (t) => `<div class="amt" style="color:var(--danger)">−${Math.abs(t.points)} pts<small>${t.minutes} min</small></div>`],
    'convert-coins': ['Points → coins', C.coins, ICON.swap, (t) => `<div class="amt" style="color:var(--coin)">+${fmtPeso(t.total)}<small>−${Math.abs(t.points)} pts</small></div>`],
    'convert-wifi': ['Points → Wi-Fi', C.wifi, ICON.swap, (t) => `<div class="amt" style="color:var(--wifi)">+${fmtMin(t.minutes)}<small>−${Math.abs(t.points)} pts</small></div>`],
    cashout: ['Cash-out code', C.coins, ICON.cash, (t) => `<div class="amt" style="color:var(--danger)">−${fmtPeso(t.total)}<small>${esc(t.code || '')}</small></div>`],
    'cashout-cancel': ['Cash-out cancelled', C.coins, ICON.cash, (t) => `<div class="amt" style="color:var(--coin)">+${fmtPeso(t.total)}<small>${esc(t.code || '')}</small></div>`],
    'wifi-use': ['Wi-Fi session', C.wifi, ICON.wifi, (t) => `<div class="amt" style="color:var(--danger)">−${fmtMin(t.minutes)}<small>used</small></div>`],
    'voucher-add': ['Voucher → Wi-Fi time', C.wifi, ICON.wifi, (t) => `<div class="amt" style="color:var(--wifi)">+${t.minutes} min<small>${esc(t.voucherCode || '')}</small></div>`],
    bundle: ['Reward bundle', C.tier, ICON.gift, (t) => `<div class="amt" style="color:var(--danger)">−${Math.abs(t.points)} pts<small>${esc(t.label || '')}</small></div>`],
  };
  function txRow(t) {
    const [label, color, icon, right] = TX_META[t.reward] || ['Transaction', 'var(--ink-3)', ICON.info, () => ''];
    const m = DB.machines.byId(t.machineId);
    return `<li><div class="tile" style="background:${color}">${icon}</div><div class="body"><b>${label}</b><small>${t.items.length ? t.items.length + ' item' + (t.items.length === 1 ? '' : 's') + ' · ' : ''}${m ? esc(m.name) : 'In app'} · ${fmtDate(t.ts)}</small></div>${right(t)}</li>`;
  }
  function liveCard(u) {
    const live = DB.machines.all().find((m) => m.session && m.session.userId === u.id);
    if (!live) return '';
    return `<div class="card live mb"><div class="row between"><b><span class="pulse"></span> Recycling at ${esc(live.name)}</b><span class="badge info">${esc(live.session.screen)}</span></div><div class="muted">${esc(live.session.title)} · ${live.session.items} item${live.session.items === 1 ? '' : 's'} · ${fmtPeso(live.session.total)} so far</div></div>`;
  }
  function machineCard(m) {
    const av = DB.machines.availability(m);
    const st = m.status === 'online' ? (av.binFull ? ['danger', 'Bin full'] : ['ok', 'Online']) : m.status === 'maintenance' ? ['warn', 'Maintenance'] : ['danger', 'Offline'];
    const q = encodeURIComponent(m.location + ', Bulacan');
    return `<div class="card m-card mb">
      <h4>${esc(m.name)}</h4><span class="badge ${st[0]}">${st[1]}</span>
      <div class="m-meta"><span>${ICON.pin} ${esc(m.location)}</span></div>
      <div class="m-meta"><span class="${av.coins ? '' : 'off'}">🪙 Coins</span><span class="${av.wifi ? '' : 'off'}">📶 Wi-Fi</span><span class="${av.online ? '' : 'off'}">💾 Save points</span><span>Bin ${m.binLevel}%</span></div>
      <div class="bar ${m.binLevel >= cfg().binFullThreshold ? 'danger' : m.binLevel >= cfg().binAlertThreshold ? 'warn' : ''}"><i style="width:${m.binLevel}%"></i></div>
      <div class="m-actions"><a class="btn btn-outline btn-sm" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Directions</a><button class="btn btn-sm" data-view="recycle" ${av.online && !av.binFull ? '' : 'disabled'}>Link &amp; recycle</button></div>
    </div>`;
  }

  /* ---------- views ---------- */
  const VIEWS = {
    auth: () => {
      const accounts = DB.users.all();
      const demo = accounts[0] || null;
      return `
      <div class="auth-hero">
        <img class="mark" src="../assets/img/mark.svg" alt="">
        <h1 style="margin-top:var(--space-auth-heading)">Welcome to BOCO-FI</h1>
        <p class="muted">Recycle bottles &amp; cans. Earn points, coins and free Wi-Fi.</p>
      </div>
      <div class="tabs"><button id="tabLogin" class="${authTab === 'login' ? 'active' : ''}">Log in</button><button id="tabReg" class="${authTab === 'register' ? 'active' : ''}">Create account</button></div>
      <form id="formAuth" class="card" novalidate>
        ${authTab === 'register' ? `<div class="field"><label for="fName">Full name</label><input class="input" id="fName" autocomplete="name" required></div>` : ''}
        <div class="field"><label for="fEmail">Email</label><input class="input" id="fEmail" type="email" inputmode="email" autocomplete="email" required value="${authTab === 'login' && demo ? esc(demo.email) : ''}"></div>
        <div class="field"><label for="fPin">4-digit PIN</label><input class="input" id="fPin" type="password" inputmode="numeric" pattern="\\d{4}" maxlength="4" autocomplete="${authTab === 'login' ? 'current-password' : 'new-password'}" required value="${authTab === 'login' && demo ? esc(demo.pin) : ''}"></div>
        <div class="error" id="authErr" role="alert"></div>
        <button class="btn btn-block" id="authSubmit" type="submit">${authTab === 'login' ? 'Log in' : 'Create account'}</button>
        ${authTab === 'login' ? `<p class="help center mt" role="status">${demo ? 'A demo account is pre-filled from saved local data.' : 'No accounts are saved yet. Create one to get started.'}</p>` : ''}
      </form>`;
    },

    home: (u) => {
      const allTx = DB.transactions.forUser(u.id);
      const tx = allTx.slice(0, 3);
      const recyclingTx = allTx.filter((t) => t.machineId && Array.isArray(t.items) && t.items.length > 0);
      const bottles = u.bottles || 0; const tier = tierOf(bottles);
      const wk = weekly(u); const max = Math.max(1, ...wk.map((d) => d.n));
      const machines = DB.machines.all();
      const featuredMachines = machines.slice(0, 2);
      const weekTotal = wk.reduce((a, d) => a + d.n, 0);
      const recyclingValue = recyclingTx.reduce((sum, t) => sum + Number(t.total || 0), 0);
      const pendingCash = DB.cashouts.forUser(u.id).filter((c) => DB.cashouts.status(c) === 'pending');
      return `
      <section class="hero leafy-bg">
        <div><small>${greeting()}</small><h2>Hi, ${esc(u.name.split(' ')[0])} 👋</h2></div>
        <button class="tier-chip" data-view="leaderboard">${tier.t.emoji} ${tier.t.name} · #${rankOf(u)}</button>
      </section>

      <div class="wallet-card">
        <div class="wc-main">
          <div class="lbl">Stacked points</div>
          <div class="big">${u.points.toLocaleString()} <small>pts</small></div>
          <div class="sub">≈ ${fmtPeso(pesos(u.points))} · ${fmtMin(minutesFor(u.points))} of Wi-Fi · ${cfg().pointsPerPeso} pts per ₱1 recycled</div>
        </div>
        <div class="wc-tiles">
          <button class="wc-tile coins" data-view="wallet">${ICON.coins}<small>Coin balance</small><b>${fmtPeso(u.coins)}</b><span>${pendingCash.length ? pendingCash.length + ' cash-out pending' : 'Cash out at a kiosk'}</span></button>
          <button class="wc-tile wifi" data-view="wifi">${ICON.wifi}<small>Wi-Fi time left</small><b data-wifi-left>${wifiLeftLabel(u)}</b><span>${u.wifiSession ? '● Connected' : 'Tap to connect'}</span></button>
        </div>
      </div>

      <div class="quick">
        <button data-view="recycle"><i style="background:var(--green-500)">${ICON.qr}</i>Link machine</button>
        <button data-view="wallet"><i style="background:var(--color-coin)">${ICON.swap}</i>Convert pts</button>
        <button data-view="wifi"><i style="background:var(--wifi)">${ICON.wifi}</i>${u.wifiSession ? 'Wi-Fi on' : 'Connect'}</button>
        <button data-view="machines"><i style="background:var(--color-info)">${ICON.pin}</i>Find kiosk</button>
      </div>

      ${liveCard(u)}

      <div class="card tier-card">
        <div class="row between"><b>${tier.t.emoji} ${tier.t.name}${tier.next ? ' → ' + tier.next.emoji + ' ' + tier.next.name : ' · top tier'}</b><small class="muted">${bottles} items</small></div>
        <div class="bar"><i style="width:${Math.round(tier.progress * 100)}%"></i></div>
        <div class="tier-steps">${tier.next ? `<span><b>${tier.next.min - bottles}</b> more items to level up</span><span>${tier.next.min}</span>` : '<span>You reached the top tier 🎉</span>'}</div>
      </div>

      <div class="card mt">
        <div class="row between"><h4 style="margin:0">This week</h4><small class="muted">${weekTotal} items recycled</small></div>
        ${weekTotal ? `<div class="chart">${wk.map((d) => `<div><b>${d.n || ''}</b><i class="${d.today ? 'hi' : ''}" style="height:${Math.max(4, Math.round(d.n / max * 70))}px"></i><small>${d.label}</small></div>`).join('')}</div>` : '<div class="empty">No recycling activity this week yet. Link to a machine to get started.</div>'}
      </div>

      <div class="card mt">
        <h4>Your impact</h4>
        <div class="impact"><div><b>${bottles}</b><small>items recycled</small></div><div><b>${recyclingTx.length}</b><small>kiosk transactions</small></div><div><b>${fmtPeso(recyclingValue)}</b><small>recycling value</small></div></div>
      </div>

      <div class="section-title"><h3>Machines</h3><a href="#" data-view="machines">See all</a></div>
      ${featuredMachines.length ? featuredMachines.map(machineCard).join('') : '<div class="card"><div class="empty">No machines are listed yet.</div></div>'}

      <div class="section-title"><h3>Recent activity</h3><a href="#" data-view="history">See all</a></div>
      <div class="card">${tx.length ? `<ul class="list">${tx.map(txRow).join('')}</ul>` : '<div class="empty">No activity yet. Link to a machine to start recycling.</div>'}</div>`;
    },

    wallet: (u) => {
      const c = cfg(); const codes = DB.cashouts.forUser(u.id);
      const tx = DB.transactions.forUser(u.id).filter((t) => /coins|cashout|convert|save|bundle/.test(t.reward)).slice(0, 5);
      const minCashout = c.cashoutMinAmount || 1;
      const all = Math.floor(u.coins);
      const amts = (c.cashoutDenominations || []).filter((a) => a >= minCashout && a <= u.coins);
      if (all >= minCashout && !amts.includes(all)) amts.push(all);
      return `
      <div class="page-title"><h2>Wallet</h2></div>
      <div class="card"><div class="bal-row"><div class="tile pts">${ICON.pts}</div><div class="bal"><small>Stacked points</small><b>${u.points.toLocaleString()} pts</b></div><span class="muted">≈ ${fmtPeso(pesos(u.points))}</span></div></div>
      <div class="card"><div class="bal-row"><div class="tile coins">${ICON.coins}</div><div class="bal"><small>Coin balance</small><b>${fmtPeso(u.coins)}</b></div><span class="muted">cash out at kiosk</span></div></div>
      <div class="card"><div class="bal-row"><div class="tile wifi">${ICON.wifi}</div><div class="bal"><small>Wi-Fi time remaining</small><b data-wifi-left>${wifiLeftLabel(u)}</b></div><button class="btn btn-sm btn-blue" data-view="wifi">${u.wifiSession ? 'Connected' : 'Connect'}</button></div></div>

      <div class="section-title"><h3>Convert points</h3></div>
      <div class="card">
        <div class="chips" id="convMode"><button class="chip active" data-mode="coins">→ Coins</button><button class="chip" data-mode="wifi">→ Wi-Fi time</button></div>
        <p class="help mt">${c.pointsPerPeso} pts = ₱1 · ${ptsPerMin()} pts = 1 min of Wi-Fi. You have <b>${fmtPts(u.points)}</b>.</p>
        <div class="stepper"><button type="button" id="cvMinus" aria-label="Less">−</button><input class="input" id="cvPts" type="number" inputmode="numeric" min="0" step="${c.pointsPerPeso}" value="${Math.floor(u.points / 2 / c.pointsPerPeso) * c.pointsPerPeso}"><button type="button" id="cvPlus" aria-label="More">+</button></div>
        <div class="conv"><div class="box"><small>You spend</small><b id="cvFrom">—</b></div><span class="arrow">➜</span><div class="box"><small>You get</small><b id="cvTo">—</b></div></div>
        <div class="error" id="cvErr"></div>
        <button class="btn btn-block" id="btnConvert">Convert</button>
      </div>

      <div class="section-title"><h3>Cash out coins</h3></div>
      <div class="card">
        <p class="help">Generate a code, then choose <b>COINS</b> at any BOCO-FI kiosk and enter it. The machine dispenses your coins. Codes last ${c.cashoutTtlHours} h and can be cancelled to get the balance back.</p>
        ${amts.length ? `<div class="chips" id="cashAmt">${amts.map((a, i) => `<button class="chip ${i === 0 ? 'active' : ''}" data-amt="${a}">${a === all && all !== amts[0] ? 'All ' : ''}₱${a}</button>`).join('')}</div>
        <button class="btn btn-block mt" id="btnCashout" style="background:var(--coin)">${ICON.cash} Generate cash-out code</button>` : '<div class="empty">You need at least ₱1 in coin balance. Convert points above.</div>'}
        ${codes.length ? `<div class="section-title"><h4>Your codes</h4></div>${codes.map((co) => { const st = DB.cashouts.status(co); return `<div class="code-card ${st === 'pending' ? '' : 'dim'} mb"><div class="body"><div class="code">${esc(co.code)}</div><small>${fmtPeso(co.amount)} · ${st === 'pending' ? 'expires ' + fmtDate(co.expiresAt) : st}</small></div>${st === 'pending' ? `<button class="btn btn-outline btn-sm" data-cancel-cash="${esc(co.code)}">Cancel</button>` : `<span class="badge">${st}</span>`}</div>`; }).join('')}` : '<div class="empty">No cash-out codes yet.</div>'}
      </div>

      <div class="section-title"><h3>Recent wallet activity</h3><a href="#" data-view="history">See all</a></div>
      <div class="card">${tx.length ? `<ul class="list">${tx.map(txRow).join('')}</ul>` : '<div class="empty">Nothing yet.</div>'}</div>`;
    },

    wifi: (u) => {
      const on = !!u.wifiSession; const rem = wifiRemaining(u); const total = on ? u.wifiSession.minutesAtStart : Math.max(u.wifiMinutes, 1);
      const vs = DB.vouchers.forUser(u.id);
      const opts = (cfg().wifiTopupOptions || []).map((m) => ({ m, pts: m * ptsPerMin() }));
      return `
      <div class="page-title"><h2>Wi-Fi</h2></div>
      <div class="card">
        <div class="ring-wrap">
          <div class="ring ${on ? 'on' : ''}" id="ring" style="--p:${on ? Math.round(rem / total * 100) : (u.wifiMinutes > 0 ? 100 : 0)}"><div><div class="t" data-wifi-clock>${on ? fmtClock(rem * 60) : fmtMin(u.wifiMinutes)}</div><small>${on ? 'remaining' : 'time remaining'}</small></div></div>
          <div class="wifi-status"><span class="dot ${on ? 'ok' : ''}"></span>${on ? 'Connected · BOCO-FI Free Wi-Fi' : 'Not connected'}</div>
          ${on ? `<p class="help center">Access code <b class="mono">${esc(u.wifiSession.code)}</b> · started ${fmtDate(u.wifiSession.startedAt)}</p>` : `<p class="help center">Join the <b>BOCO-FI Free Wi-Fi</b> network near any kiosk, then tap Connect. Time counts down only while connected.</p>`}
          ${on ? `<button class="btn btn-outline btn-block" id="btnWifiOff">Disconnect</button>` : `<button class="btn btn-blue btn-block" id="btnWifiOn" ${u.wifiMinutes > 0.05 ? '' : 'disabled'}>${ICON.wifi} Connect</button>`}
        </div>
      </div>

      <div class="section-title"><h3>Top up with points</h3><small class="muted">${fmtPts(u.points)}</small></div>
      <div class="card">
        <div class="topup">${opts.map((o) => `<button data-topup="${o.m}" ${u.points >= o.pts ? '' : 'disabled'}>+${o.m} min<small>${o.pts} pts</small></button>`).join('')}</div>
        <p class="help mt center">${ptsPerMin()} pts = 1 minute · need a bigger bundle? <a href="#" data-view="redeem">See rewards</a></p>
      </div>

      <div class="section-title"><h3>Vouchers from kiosks</h3></div>
      ${vs.length ? vs.map((v) => { const st = DB.vouchers.status(v); const m = DB.machines.byId(v.machineId); return `<div class="code-card wifi ${st === 'active' ? '' : 'dim'} mb"><div class="body"><div class="code">${esc(v.code)}</div><small>${v.minutes} min · ${m ? esc(m.name) : 'Claimed in app'} · ${st === 'active' ? 'expires ' + fmtDate(v.expiresAt) : st}</small></div>${st === 'active' ? `<button class="btn btn-blue btn-sm" data-add-voucher="${esc(v.code)}">Add to time</button>` : `<span class="badge">${st}</span>`}</div>`; }).join('') : '<div class="card empty">No vouchers yet. Choose <b>WI-FI</b> at a kiosk after recycling.</div>'}`;
    },

    recycle: (u) => {
      const pending = DB.links.pending();
      return `
      <div class="page-title"><h2>Recycle</h2></div>
      ${liveCard(u)}
      <form id="formLink" class="card" novalidate>
        <h4>Link to a machine</h4>
        <p class="help">On the kiosk tap <b>Log in</b>, then enter the 4-letter code shown under the QR code.</p>
        <div class="field"><label for="fCode">Machine code</label><input class="input mono" id="fCode" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="XXXX" required></div>
        <div class="error" id="linkErr" role="alert" aria-live="polite"></div>
        <button class="btn btn-blue btn-block" type="submit">${ICON.qr} Link my account</button>
        ${pending.length ? `<p class="help mt">Machines waiting for a scan:</p><div class="code-hint">${pending.map((p) => { const m = DB.machines.byId(p.machineId); return `<button type="button" class="btn btn-outline btn-sm" data-code="${esc(p.code)}">${esc(p.code)} · ${esc(m ? m.name : p.machineId)}</button>`; }).join('')}</div>` : '<p class="empty" role="status">No machine codes are waiting right now. Start a link on a kiosk, then enter its code here.</p>'}
      </form>
      <div class="card">
        <h4>How it works</h4>
        <ol class="steps">
          <li><div><b>Tap the kiosk screen</b><br><small class="muted">Choose Log in and link with your code (or continue as guest).</small></div></li>
          <li><div><b>Insert bottles &amp; cans</b><br><small class="muted">PET bottles and aluminium cans, empty and uncrushed. Each item is scanned and valued.</small></div></li>
          <li><div><b>Choose your reward</b><br><small class="muted"><b>COINS</b> dispensed on the spot · <b>WI-FI</b> voucher · <b>SAVE</b> to stack points in this app.</small></div></li>
          <li><div><b>Spend anytime</b><br><small class="muted">Convert points to coins or Wi-Fi time from your wallet.</small></div></li>
        </ol>
      </div>
      <div class="card">
        <h4>Reward rates</h4>
        <table class="rate-table">${cfg().rewardTable.map((r) => `<tr><td>${esc(r.label)}<small>${esc(r.hint)}</small></td><td>${fmtPeso(r.value)} · ${Math.round(r.value * cfg().pointsPerPeso)} pts</td></tr>`).join('')}</table>
      </div>`;
    },

    redeem: (u) => {
      const c = cfg(); const bundles = c.rewardBundles || [];
      return `
      <div class="page-title"><h2>Rewards</h2><span class="badge ok">${fmtPts(u.points)}</span></div>
      <p class="muted">Spend stacked points on Wi-Fi time or coin balance.</p>
      <div id="redeemErr" class="error" role="alert" aria-live="polite"></div>
      ${bundles.length ? bundles.map((b) => {
        const affordable = u.points >= b.points;
        const standard = b.kind === 'wifi' ? b.minutes * (c.pointsPerPeso / c.wifiMinutesPerPeso) : 0;
        const save = standard > b.points ? Math.round((1 - b.points / standard) * 100) : 0;
        return `<div class="card bundle mb">
          <div class="b-ico tile ${esc(b.kind)}">${b.kind === 'wifi' ? ICON.wifi : ICON.coins}</div>
          <div class="b-body"><b>${esc(b.label)} ${save ? `<span class="save-tag">Save ${save}%</span>` : ''}</b><small>${esc(b.sub)}</small></div>
          <div class="b-price"><b>${b.points} pts</b><button class="btn btn-sm ${affordable ? '' : 'btn-outline'}" data-bundle="${esc(b.id)}" ${affordable ? '' : 'disabled'}>${affordable ? 'Redeem' : 'Need ' + (b.points - u.points)}</button></div>
        </div>`;
      }).join('') : '<div class="card empty" role="status">No reward bundles are available right now.</div>'}
      <div class="card">
        <h4>Earn more points</h4>
        <ul class="steps">
          <li><div><b>Recycle and choose SAVE</b><br><small class="muted">${c.pointsPerPeso} pts for every ₱1 of items.</small></div></li>
          <li><div><b>Track your tier</b><br><small class="muted">Your tier follows the item thresholds listed in your profile.</small></div></li>
          <li><div><b>Invite a friend</b><br><small class="muted">Share your invite code <b class="mono">${esc(u.id)}</b>.</small></div></li>
        </ul>
        <button class="btn btn-outline btn-block" id="btnShare">Share my invite code</button>
      </div>`;
    },

    machines: () => {
      const ms = DB.machines.all().slice().sort((a, b) => (DIST[a.id] || 9) - (DIST[b.id] || 9));
      return `
      <div class="page-title"><h2>Find a machine</h2></div>
      <p class="muted">${ms.filter((m) => m.status === 'online').length} of ${ms.length} kiosks online · distances are demo values.</p>
      ${ms.map(machineCard).join('')}`;
    },

    history: (u) => {
      const all = DB.transactions.forUser(u.id);
      const F = {
        all: () => true,
        recycling: (t) => ['save', 'coins', 'wifi'].includes(t.reward) && t.machineId,
        coins: (t) => /coins|cashout/.test(t.reward),
        wifi: (t) => /wifi|claim|voucher/.test(t.reward),
        points: (t) => ['save', 'convert-coins', 'convert-wifi', 'claim', 'bundle'].includes(t.reward),
      };
      const tx = all.filter(F[histFilter] || F.all);
      const total = round2(all.reduce((n, t) => n + (t.machineId ? t.total : 0), 0));
      const items = all.reduce((n, t) => n + t.items.length, 0);
      return `
      <div class="page-title"><h2>History</h2></div>
      <div class="grid grid-2 mb"><div class="card"><small class="muted">Recycled value</small><h3>${fmtPeso(total)}</h3></div><div class="card"><small class="muted">Items recycled</small><h3>${items}</h3></div></div>
      <div class="chips mb" id="histChips">${['all', 'recycling', 'coins', 'wifi', 'points'].map((f) => `<button class="chip ${histFilter === f ? 'active' : ''}" data-filter="${f}">${f === 'wifi' ? 'Wi-Fi' : f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
      <div class="card">${tx.length ? `<ul class="list">${tx.map(txRow).join('')}</ul>` : '<div class="empty">Nothing here yet.</div>'}</div>`;
    },

    notifications: (u) => {
      const ns = notifsFor(u);
      return `
      <div class="page-title"><h2>Notifications</h2>${ns.some((n) => !n.read) ? '<button class="btn btn-ghost btn-sm" id="btnReadAll">Mark all read</button>' : ''}</div>
      <div class="card">${ns.length ? ns.map((n) => `<div class="notif ${n.read ? 'read' : ''}" data-notif="${esc(n.id)}" data-go="${n.view}" role="button" tabindex="0"><span class="n-dot"></span><div class="tile" style="background:${n.color}">${n.icon}</div><div class="n-body"><b>${esc(n.title)}</b><small>${esc(n.body)}</small></div><span class="n-time">${ago(n.ts)}</span></div>`).join('') : '<div class="empty">You\'re all caught up.</div>'}</div>`;
    },

    leaderboard: (u) => {
      const us = DB.users.all().slice().sort((a, b) => (b.bottles || 0) - (a.bottles || 0));
      const top = us.slice(0, 3); const order = [top[1], top[0], top[2]];
      return `
      <div class="page-title"><h2>Leaderboard</h2><small class="muted">by items recycled</small></div>
      <div class="podium">${order.map((x, i) => x ? `<div class="${i === 1 ? 'first' : ''}"><div class="p-av">${initials(x.name)}</div><b>${esc(x.name.split(' ')[0])}</b><small class="muted">${x.bottles || 0} items</small><small>${i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</small></div>` : '<div></div>').join('')}</div>
      <div class="card"><ul class="list">${us.map((x, i) => { const t = tierOf(x.bottles || 0); return `<li class="${x.id === u.id ? 'me' : ''}"><span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span><div class="tile" style="background:${x.id === u.id ? 'var(--green-700)' : 'var(--green-300)'}">${initials(x.name)}</div><div class="body"><b>${esc(x.name)}${x.id === u.id ? ' (you)' : ''}</b><small>${t.t.emoji} ${t.t.name} · ${((x.bottles || 0) * 0.02).toFixed(1)} kg diverted</small></div><div class="amt">${x.bottles || 0}<small>items</small></div></li>`; }).join('')}</ul></div>
      <p class="help center mt">Rankings update live as members recycle.</p>`;
    },

    profile: (u) => {
      const tier = tierOf(u.bottles || 0);
      return `
      <div class="page-title"><h2>Profile &amp; settings</h2></div>
      <div class="card row" style="gap:1rem"><div class="a-avatar" style="width:56px;height:56px;font-size:1.1rem;display:flex;align-items:center;justify-content:center;flex:none">${initials(u.name)}</div><div style="flex:1;min-width:0"><b>${esc(u.name)}</b><br><small class="muted">${esc(u.email)}</small><br><small>${tier.t.emoji} ${tier.t.name} · member since ${new Date(u.createdAt).toLocaleDateString([], { dateStyle: 'medium' })}</small></div></div>
      <form id="formProfile" class="card" novalidate>
        <h4>Edit details</h4>
        <div class="field"><label for="pName">Name</label><input class="input" id="pName" value="${esc(u.name)}" required></div>
        <div class="field"><label for="pEmail">Email</label><input class="input" id="pEmail" type="email" value="${esc(u.email)}" required></div>
        <div class="field"><label for="pPin">New PIN <small class="muted">(leave blank to keep)</small></label><input class="input" id="pPin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="new-password"></div>
        <div class="error" id="profErr"></div>
        <button class="btn btn-block" type="submit">Save changes</button>
      </form>
      <div class="card">
        <h4>Preferences</h4>
        <label class="toggle"><span>Notifications<br><small class="muted">Alerts for vouchers, Wi-Fi and machines</small></span><input type="checkbox" id="prefNotifs" ${!u.prefs || u.prefs.notifs !== false ? 'checked' : ''}></label>
        <label class="toggle"><span>Auto-disconnect Wi-Fi<br><small class="muted">Stop the timer when time runs out</small></span><input type="checkbox" checked disabled></label>
      </div>
      <div class="card">
        <h4>Account</h4>
        <div class="kv"><span>Member ID</span><span class="mono">${esc(u.id)}</span></div>
        <div class="kv"><span>Stacked points</span><span>${fmtPts(u.points)}</span></div>
        <div class="kv"><span>Coin balance</span><span>${fmtPeso(u.coins)}</span></div>
        <div class="kv"><span>Wi-Fi time</span><span>${fmtMin(wifiRemaining(u))}</span></div>
        <div class="kv"><span>Items recycled</span><span>${u.bottles || 0}</span></div>
        <div class="stack mt">
          <button class="btn btn-outline btn-block" id="btnInstall">Add to home screen</button>
          <button class="btn btn-outline btn-block" id="btnLogout">Log out</button>
          <button class="btn btn-ghost btn-block" id="btnResetDemo" style="color:var(--danger)">Reset demo data</button>
        </div>
      </div>`;
    },

    help: () => `
      <div class="page-title"><h2>Help</h2></div>
      <div class="card">
        <details class="faq" open><summary>What are stacked points?</summary><p>When you choose <b>SAVE</b> at a kiosk, the value of your items is stored as points: ${cfg().pointsPerPeso} pts per ₱1. Points never expire and can be converted to coins or Wi-Fi time in your wallet.</p></details>
        <details class="faq"><summary>How do I get my coin balance as real coins?</summary><p>In <b>Wallet → Cash out coins</b>, generate a code. At any kiosk choose <b>COINS</b>, enter the code and the machine dispenses the amount. Unused codes expire after 24 hours and you can cancel them anytime.</p></details>
        <details class="faq"><summary>How does Wi-Fi time work?</summary><p>Your Wi-Fi time only counts down while you're connected. Join the <b>BOCO-FI Free Wi-Fi</b> network near a kiosk, tap <b>Connect</b> in the app, and tap <b>Disconnect</b> when you're done. Vouchers from kiosks can be added to your time bank.</p></details>
        <details class="faq"><summary>Which items are accepted?</summary><p>Empty, uncrushed PET plastic bottles (Sakto up to 1.5 L) and aluminium cans. Glass, tetra packs and other plastics are returned through the drawer.</p></details>
        <details class="faq"><summary>The machine said no rewards are available</summary><p>The kiosk checks its coin hopper and Wi-Fi signal before each session. If a reward isn't available you can still choose the others, or <b>SAVE</b> to points and spend later.</p></details>
        <details class="faq"><summary>How do tiers work?</summary><p>${tiers().map((t) => `${t.emoji} ${t.name} from ${t.min} items`).join(' · ')}. Your tier tracks your recycled items.</p></details>
      </div>
      <div class="card">
        <h4>Contact</h4>
        <p class="muted">Kiosk problem? Note the machine name and time, then message the operator.</p>
        <a class="btn btn-outline btn-block" href="mailto:support@bocofi.ph?subject=BOCO-FI%20app">Email support</a>
      </div>`,
  };

  /* ---------- behaviours ---------- */
  const AFTER = {
    auth() {
      $('#tabLogin').onclick = () => { authTab = 'login'; render(); };
      $('#tabReg').onclick = () => { authTab = 'register'; render(); };
      $('#formAuth').onsubmit = (e) => {
        e.preventDefault();
        const email = $('#fEmail').value.trim(), pin = $('#fPin').value.trim();
        const err = $('#authErr'), button = $('#authSubmit'); err.textContent = '';
        if (button.disabled) return;
        try {
          if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits.');
          if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
          const mode = authTab;
          const name = mode === 'register' ? $('#fName').value.trim() : '';
          if (mode === 'register' && name.length < 2) throw new Error('Enter your name.');
          button.disabled = true;
          $('#tabLogin').disabled = true;
          $('#tabReg').disabled = true;
          button.setAttribute('aria-busy', 'true');
          button.textContent = mode === 'register' ? 'Creating account…' : 'Signing in…';
          setTimeout(() => {
            try {
              if (mode === 'register') {
                const u = DB.users.register(name, email, pin);
                DB.users.login(u.email, pin);
                toast(`Welcome to BOCO-FI, ${u.name.split(' ')[0]}`, 'ok');
              } else {
                DB.users.login(email, pin);
                const u = DB.users.current();
                toast(u ? `Welcome back, ${u.name.split(' ')[0]}` : 'Signed in', 'ok');
              }
              location.hash = '#/home'; render();
            } catch (ex) {
              err.textContent = ex.message;
              button.disabled = false;
              $('#tabLogin').disabled = false;
              $('#tabReg').disabled = false;
              button.removeAttribute('aria-busy');
              button.textContent = mode === 'register' ? 'Create account' : 'Log in';
            }
          }, 200);
        } catch (ex) { err.textContent = ex.message; }
      };
    },

    wallet(u) {
      const c = cfg(); let mode = 'coins';
      const inp = $('#cvPts');
      const step = () => (mode === 'coins' ? c.pointsPerPeso : ptsPerMin());
      const upd = () => {
        let pts = Math.max(0, Math.floor(Number(inp.value) || 0)); pts = Math.floor(pts / step()) * step(); pts = Math.min(pts, Math.floor(u.points / step()) * step());
        inp.value = pts; inp.step = step();
        $('#cvFrom').textContent = pts.toLocaleString() + ' pts';
        $('#cvTo').textContent = mode === 'coins' ? fmtPeso(pesos(pts)) : fmtMin(minutesFor(pts));
        $('#btnConvert').textContent = mode === 'coins' ? 'Convert to coins' : 'Convert to Wi-Fi time';
        $('#btnConvert').disabled = pts <= 0;
      };
      $$('#convMode .chip').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; $$('#convMode .chip').forEach((x) => x.classList.toggle('active', x === b)); upd(); }));
      $('#cvMinus').onclick = () => { inp.value = Number(inp.value) - step(); upd(); };
      $('#cvPlus').onclick = () => { inp.value = Number(inp.value) + step(); upd(); };
      inp.addEventListener('change', upd); upd();
      $('#btnConvert').onclick = () => {
        const pts = Number(inp.value); const err = $('#cvErr'); err.textContent = '';
        if (pts <= 0 || pts > u.points) { err.textContent = 'Not enough points.'; return; }
        const button = $('#btnConvert'); if (button.disabled) return;
        button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Converting…';
        setTimeout(() => {
          const latest = DB.users.byId(u.id);
          if (!latest || pts > latest.points) { $('#cvErr').textContent = 'Your points changed. Review the updated balance and try again.'; render(); return; }
          DB.users.addPoints(u.id, -pts);
          if (mode === 'coins') { const p = pesos(pts); DB.users.addCoins(u.id, p); DB.transactions.add({ machineId: null, userId: u.id, items: [], total: p, reward: 'convert-coins', points: -pts }); toast(`+${fmtPeso(p)} added to coin balance`, 'ok'); }
          else { const m = minutesFor(pts); addWifiTime(latest, m); DB.transactions.add({ machineId: null, userId: u.id, items: [], total: pesos(pts), reward: 'convert-wifi', points: -pts, minutes: m }); toast(`+${fmtMin(m)} of Wi-Fi added`, 'ok'); }
          render();
        }, 200);
      };
      let amt = null; const chips = $$('#cashAmt .chip'); if (chips.length) amt = Number(chips[0].dataset.amt);
      chips.forEach((b) => b.addEventListener('click', () => { amt = Number(b.dataset.amt); chips.forEach((x) => x.classList.toggle('active', x === b)); }));
      const bc = $('#btnCashout'); if (bc) bc.onclick = () => {
        if (bc.disabled) return;
        bc.disabled = true; bc.setAttribute('aria-busy', 'true'); bc.textContent = 'Generating code…';
        setTimeout(() => {
          try { const latest = DB.users.byId(u.id); if (!latest || !amt || amt > latest.coins) throw new Error('Your coin balance changed. Refresh and choose an available amount.'); const co = DB.cashouts.create(u.id, amt); DB.transactions.add({ machineId: null, userId: u.id, items: [], total: co.amount, reward: 'cashout', points: 0, code: co.code }); toast(`Code ${co.code} ready · show it at a kiosk`, 'ok'); render(); }
          catch (ex) { toast(ex.message, 'danger'); render(); }
        }, 200);
      };
      $$('[data-cancel-cash]').forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = 'Cancelling…'; setTimeout(() => { const co = DB.cashouts.byCode(b.dataset.cancelCash); if (co && DB.cashouts.status(co) === 'pending') { DB.cashouts.cancel(b.dataset.cancelCash); DB.transactions.add({ machineId: null, userId: u.id, items: [], total: co.amount, reward: 'cashout-cancel', points: 0, code: co.code }); toast('Cash-out cancelled · balance returned'); } render(); }, 200); }));
    },

    wifi(u) {
      const on = $('#btnWifiOn'); if (on) on.onclick = () => {
        if (on.disabled) return;
        on.disabled = true; on.setAttribute('aria-busy', 'true'); on.textContent = 'Connecting…';
        setTimeout(() => {
          const latest = DB.users.byId(u.id);
          if (!latest || latest.wifiSession || (latest.wifiMinutes || 0) <= 0.05) { toast(latest && latest.wifiSession ? 'A Wi-Fi session is already active.' : 'No Wi-Fi time is available. Top up your balance to connect.', 'danger'); render(); return; }
          wifiConnect(latest); render();
        }, 200);
      };
      const off = $('#btnWifiOff'); if (off) off.onclick = () => {
        if (off.disabled) return;
        off.disabled = true; off.setAttribute('aria-busy', 'true'); off.textContent = 'Disconnecting…';
        setTimeout(() => { const latest = DB.users.byId(u.id); if (latest && latest.wifiSession) wifiDisconnect(latest); render(); }, 200);
      };
      $$('[data-topup]').forEach((b) => b.addEventListener('click', () => {
        const m = Number(b.dataset.topup), pts = m * ptsPerMin();
        if (b.disabled || u.points < pts) { toast('Not enough points for this top-up.', 'danger'); return; }
        b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = 'Adding…';
        setTimeout(() => {
          const latest = DB.users.byId(u.id);
          if (!latest || pts > latest.points) { toast('Your points changed. Review the updated balance and try again.', 'danger'); render(); return; }
          DB.users.addPoints(u.id, -pts); addWifiTime(latest, m);
          DB.transactions.add({ machineId: null, userId: u.id, items: [], total: pesos(pts), reward: 'convert-wifi', points: -pts, minutes: m });
          toast(`+${m} min added`, 'ok'); render();
        }, 200);
      }));
      $$('[data-add-voucher]').forEach((b) => b.addEventListener('click', () => {
        if (b.disabled) return;
        const code = b.dataset.addVoucher; b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = 'Adding…';
        setTimeout(() => {
          const v = DB.vouchers.byCode(code);
          if (!v || DB.vouchers.status(v) !== 'active') { toast('This voucher is no longer active.', 'danger'); render(); return; }
          const latest = DB.users.byId(u.id);
          if (!latest) { toast('Account unavailable. Sign in again before using this voucher.', 'danger'); render(); return; }
          DB.vouchers.redeem(v.code); addWifiTime(latest, v.minutes);
          DB.transactions.add({ machineId: v.machineId, userId: u.id, items: [], total: 0, reward: 'voucher-add', points: 0, minutes: v.minutes, voucherCode: v.code });
          toast(`+${v.minutes} min added from ${v.code}`, 'ok'); render();
        }, 200);
      }));
    },

    recycle(u) {
      const input = $('#fCode');
      const form = $('#formLink'); const button = form.querySelector('[type="submit"]');
      const submit = (code) => {
        const err = $('#linkErr'); err.textContent = '';
        if (button.disabled) return;
        const normalized = String(code || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{4}$/.test(normalized)) { err.textContent = 'Enter the 4-character code shown on the kiosk.'; input.focus(); return; }
        button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Linking…';
        $$('[data-code]').forEach((b) => { b.disabled = true; });
        setTimeout(() => {
          try {
            const latest = DB.users.byId(u.id); if (!latest) throw new Error('Your account is unavailable. Sign in again and retry.');
            const link = DB.links.get(normalized); if (!link || link.status !== 'pending') throw new Error(link ? 'That code has already been used.' : 'Code not found. Check the machine screen and try again.');
            const m = DB.machines.byId(link.machineId);
            if (!m) throw new Error('The machine for this code is no longer listed. Ask the operator for help.');
            DB.links.resolve(normalized, latest.id);
            toast(`Linked to ${m.name} · insert your items`, 'ok'); goto('home');
          } catch (ex) {
            err.textContent = ex.message;
            button.disabled = false; button.removeAttribute('aria-busy'); button.innerHTML = `${ICON.qr} Link my account`;
            $$('[data-code]').forEach((b) => { b.disabled = false; });
          }
        }, 200);
      };
      $('#formLink').onsubmit = (e) => { e.preventDefault(); submit(input.value); };
      $$('[data-code]').forEach((b) => b.addEventListener('click', () => submit(b.dataset.code)));
      input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
    },

    redeem(u) {
      $$('[data-bundle]').forEach((b) => b.addEventListener('click', () => {
        if (b.disabled) return;
        const bd = (cfg().rewardBundles || []).find((x) => x.id === b.dataset.bundle);
        const latest = DB.users.byId(u.id); const err = $('#redeemErr'); err.textContent = '';
        if (!bd || !latest) { err.textContent = 'This reward is no longer available. Refresh and try again.'; return; }
        if (latest.points < bd.points) { err.textContent = 'You do not have enough points for this reward.'; render(); return; }
        b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = 'Redeeming…';
        setTimeout(() => {
          const current = DB.users.byId(u.id);
          const currentBundle = (cfg().rewardBundles || []).find((x) => x.id === bd.id);
          if (!current || !currentBundle || current.points < currentBundle.points) { toast('Your balance or this offer changed. Review the latest rewards and try again.', 'danger'); render(); return; }
          DB.users.addPoints(u.id, -currentBundle.points);
          if (currentBundle.kind === 'wifi') addWifiTime(current, currentBundle.minutes); else DB.users.addCoins(u.id, currentBundle.pesos);
          DB.transactions.add({ machineId: null, userId: u.id, items: [], total: currentBundle.pesos || pesos(currentBundle.points), reward: 'bundle', points: -currentBundle.points, minutes: currentBundle.minutes || 0, label: currentBundle.label });
          toast(`${currentBundle.label} redeemed`, 'ok'); render();
        }, 200);
      }));
      $('#btnShare').onclick = async () => {
        const text = `Join me on BOCO-FI — recycle bottles, earn coins and free Wi-Fi. My invite code: ${u.id}`;
        const button = $('#btnShare'); if (button.disabled) return;
        button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Preparing invite…';
        try {
          if (navigator.share) await navigator.share({ title: 'BOCO-FI', text });
          else if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); toast('Invite copied to clipboard', 'ok'); }
          else throw new Error('Sharing is not available in this browser.');
        } catch (ex) { if (ex.name !== 'AbortError') toast(ex.message || 'Could not share the invite.', 'danger'); }
        finally { if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = 'Share my invite code'; } }
      };
    },

    history() { $$('#histChips .chip').forEach((b) => b.addEventListener('click', () => { histFilter = b.dataset.filter; render(); })); },

    notifications(u) {
      const markRead = (id) => { if (!(u.notifRead || []).includes(id)) DB.users.patch(u.id, { notifRead: [...(u.notifRead || []), id] }); };
      $$('[data-notif]').forEach((el) => { const go = () => { markRead(el.dataset.notif); goto(el.dataset.go || 'home'); }; el.addEventListener('click', go); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
      const all = $('#btnReadAll'); if (all) all.onclick = () => { DB.users.patch(u.id, { notifRead: notifsFor(u).map((n) => n.id) }); render(); };
    },

    profile(u) {
      $('#formProfile').onsubmit = (e) => {
        e.preventDefault();
        const err = $('#profErr'); err.textContent = '';
        const name = $('#pName').value.trim(), email = $('#pEmail').value.trim().toLowerCase(), pin = $('#pPin').value.trim();
        try {
          if (name.length < 2) throw new Error('Enter your name.');
          if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
          const other = DB.users.byEmail(email); if (other && other.id !== u.id) throw new Error('That email is used by another account.');
          if (pin && !/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits.');
          DB.users.patch(u.id, Object.assign({ name, email }, pin ? { pin } : {}));
          toast('Profile saved', 'ok'); render();
        } catch (ex) { err.textContent = ex.message; }
      };
      $('#prefNotifs').addEventListener('change', (e) => { DB.users.patch(u.id, { prefs: { ...(u.prefs || {}), notifs: e.target.checked } }); toast(e.target.checked ? 'Notifications on' : 'Notifications off'); render(); });
      $('#btnLogout').onclick = logout;
      $('#btnInstall').onclick = () => { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; } else toast(/iphone|ipad/i.test(navigator.userAgent) ? 'In Safari: Share → Add to Home Screen' : 'Use your browser menu → Install app / Add to Home screen'); };
      $('#btnResetDemo').onclick = () => { if (confirm('Reset all demo data (users, machines, history) on this device?')) { DB.reset(); authTab = 'login'; location.hash = '#/home'; render(); toast('Demo data reset'); } };
    },
  };

  /* ---------- live Wi-Fi countdown (no full re-render) ---------- */
  setInterval(() => {
    const u = me(); if (!u || !u.wifiSession) return;
    const rem = wifiRemaining(u);
    if (rem <= 0) { wifiDisconnect(u, true); toast('Your Wi-Fi time is used up'); render(); return; }
    $$('[data-wifi-clock], [data-wifi-left]').forEach((el) => { el.textContent = fmtClock(rem * 60); });
    const ring = $('#ring'); if (ring) ring.style.setProperty('--p', Math.round(rem / u.wifiSession.minutesAtStart * 100));
  }, 1000);

  /* ---------- PWA install prompt ---------- */
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

  // re-render when the kiosk or admin changes shared data in another tab
  DB.on((d, source) => { if (source !== 'local') render(); });
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
