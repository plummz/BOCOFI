/* ==========================================================================
   BOCO-FI · user app
   Views: auth · home · link · vouchers · history · profile
   ========================================================================== */
(function () {
  'use strict';
  const DB = window.BocofiDB;
  const { esc, fmtPeso, fmtPts, fmtDate, round2, clamp } = DB.util;
  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#view');
  let current = 'home';
  let authTab = 'login';

  const ICON = {
    coins: '<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="9" r="6"/><path d="M14.5 8.2A6 6 0 1 1 8.2 14.5"/></svg>',
    wifi: '<svg class="ico" viewBox="0 0 24 24"><path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/></svg>',
    save: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 7a8 3 0 0 1 16 0v10a8 3 0 0 1-16 0z"/><path d="M4 7a8 3 0 0 0 16 0M4 12a8 3 0 0 0 16 0"/></svg>',
    qr: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v7h-7"/></svg>',
    claim: '<svg class="ico" viewBox="0 0 24 24"><path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/></svg>',
  };
  const REWARD_META = { coins: ['Coins collected', 'var(--c-rewards)', ICON.coins], wifi: ['Wi-Fi voucher', 'var(--blue-700)', ICON.wifi], save: ['Saved to account', 'var(--green-500)', ICON.save], claim: ['Claimed Wi-Fi', 'var(--blue-700)', ICON.wifi] };

  function toast(msg, kind = '') {
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
    $('#toasts').appendChild(el); setTimeout(() => el.remove(), 2800);
  }
  const me = () => DB.users.current();
  const initials = (n) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const pesos = (pts) => round2(pts / DB.config.get().pointsPerPeso);
  const minutesFor = (pts) => Math.floor(pesos(pts) * DB.config.get().wifiMinutesPerPeso);

  /* ---------- router ---------- */
  function render() {
    const u = me();
    $('#nav').hidden = !u; $('#hdrAvatar').hidden = !u;
    if (u) $('#hdrAvatar').textContent = initials(u.name);
    if (!u) { current = 'auth'; view.innerHTML = VIEWS.auth(); AFTER.auth(); return; }
    if (current === 'auth') current = 'home';
    view.innerHTML = VIEWS[current](u);
    if (AFTER[current]) AFTER[current](u);
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === current));
    view.scrollTop = 0;
  }
  function goto(v) { current = v; render(); }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) goto(b.dataset.view); });

  /* ---------- views ---------- */
  const VIEWS = {
    auth: () => `
      <div class="auth-hero">
        <img class="mark" src="../assets/img/mark.svg" alt="">
        <h1 style="margin-top:.8rem">Welcome to BOCO-FI</h1>
        <p class="muted">Recycle bottles &amp; cans. Earn coins, Wi-Fi and points.</p>
      </div>
      <div class="tabs"><button id="tabLogin" class="${authTab === 'login' ? 'active' : ''}">Log in</button><button id="tabReg" class="${authTab === 'register' ? 'active' : ''}">Create account</button></div>
      <form id="formAuth" class="card" novalidate>
        ${authTab === 'register' ? `<div class="field"><label for="fName">Full name</label><input class="input" id="fName" autocomplete="name" required></div>` : ''}
        <div class="field"><label for="fEmail">Email</label><input class="input" id="fEmail" type="email" inputmode="email" autocomplete="email" required value="${authTab === 'login' ? 'maria@example.com' : ''}"></div>
        <div class="field"><label for="fPin">4-digit PIN</label><input class="input" id="fPin" type="password" inputmode="numeric" pattern="\\d{4}" maxlength="4" autocomplete="${authTab === 'login' ? 'current-password' : 'new-password'}" required value="${authTab === 'login' ? '1234' : ''}"></div>
        <div class="error" id="authErr"></div>
        <button class="btn btn-block" type="submit">${authTab === 'login' ? 'Log in' : 'Create account'}</button>
        ${authTab === 'login' ? '<p class="help center mt">Demo account is pre-filled: maria@example.com / 1234</p>' : ''}
      </form>`,

    home: (u) => {
      const tx = DB.transactions.forUser(u.id).slice(0, 3);
      const live = DB.machines.all().find((m) => m.session && m.session.userId === u.id);
      const bottles = u.bottles || 0;
      return `
      <h2>Hi, ${esc(u.name.split(' ')[0])} 👋</h2>
      <div class="balance">
        <div class="lbl">Your balance</div>
        <div class="pts">${(u.points).toLocaleString()} pts</div>
        <div class="peso">≈ ${fmtPeso(pesos(u.points))} · ${minutesFor(u.points)} min Wi-Fi</div>
        <div class="stats"><div><b>${bottles}</b>items recycled</div><div><b>${(bottles * 0.02).toFixed(2)} kg</b>plastic diverted</div><div><b>${DB.vouchers.forUser(u.id).filter((v) => DB.vouchers.status(v) === 'active').length}</b>active vouchers</div></div>
      </div>
      ${live ? `<div class="card live mt"><div class="row between"><b><span class="pulse"></span> Session at ${esc(live.name)}</b><span class="badge info">${esc(live.session.screen)}</span></div><div class="muted">${esc(live.session.title)} · ${live.session.items} item${live.session.items === 1 ? '' : 's'} · ${fmtPeso(live.session.total)}</div></div>` : ''}
      <div class="quick">
        <button data-view="link">${ICON.qr}Link to machine<small>Scan the kiosk code</small></button>
        <button data-view="vouchers">${ICON.claim}Claim Wi-Fi<small>Turn points into a voucher</small></button>
      </div>
      <div class="section-title"><h3>Recent activity</h3><a href="#" data-view="history">See all</a></div>
      <div class="card">${tx.length ? `<ul class="list">${tx.map(txRow).join('')}</ul>` : '<div class="empty">No activity yet. Link to a machine to start recycling.</div>'}</div>`;
    },

    link: () => {
      const pending = DB.links.pending();
      return `
      <h2>Link to a machine</h2>
      <p class="muted">On the kiosk, tap <b>Log in</b>. Enter the 4-letter code shown under the QR code.</p>
      <form id="formLink" class="card" novalidate>
        <div class="field"><label for="fCode">Machine code</label><input class="input mono" id="fCode" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="XXXX" required></div>
        <div class="error" id="linkErr"></div>
        <button class="btn btn-blue btn-block" type="submit">Link account</button>
      </form>
      <div class="card">
        <h4>Scan with camera</h4>
        <p class="help">Camera-based QR scanning needs a native wrapper or a QR library; in this prototype type the code instead.</p>
        ${pending.length ? `<h4 class="mt">Demo · machines waiting for a scan</h4><div class="code-hint">${pending.map((p) => `<button class="btn btn-outline btn-sm" data-code="${esc(p.code)}">${esc(p.code)} · ${esc(p.machineId)}</button>`).join('')}</div>` : ''}
      </div>`;
    },

    vouchers: (u) => {
      const c = DB.config.get();
      const vs = DB.vouchers.forUser(u.id);
      const maxPts = u.points;
      const stepPts = c.pointsPerPeso / c.wifiMinutesPerPeso; // pts per minute
      return `
      <h2>Wi-Fi vouchers</h2>
      <div class="card">
        <h4>Claim saved credits</h4>
        <p class="help">${c.wifiMinutesPerPeso} min of Wi-Fi = ₱1 = ${c.pointsPerPeso} pts. You have <b>${fmtPts(u.points)}</b>.</p>
        ${maxPts >= stepPts ? `
        <div class="range-row"><input type="range" id="rngPts" min="${stepPts}" max="${maxPts}" step="${stepPts}" value="${Math.min(maxPts, Math.max(stepPts, Math.floor(maxPts / 2 / stepPts) * stepPts))}"><output id="outPts" class="mono"></output></div>
        <div class="claim-preview"><div><small>Wi-Fi time</small><b id="pvMin">—</b></div><div><small>Balance after</small><b id="pvBal">—</b></div></div>
        <button class="btn btn-block" id="btnClaim" style="background:var(--c-rewards)">Generate voucher</button>` : `<div class="empty">You need at least ${stepPts} pts to claim a voucher.</div>`}
      </div>
      <div class="section-title"><h3>My vouchers</h3></div>
      ${vs.length ? vs.map(vCard).join('') : '<div class="card empty">No vouchers yet.</div>'}`;
    },

    history: (u) => {
      const tx = DB.transactions.forUser(u.id);
      const total = round2(tx.reduce((n, t) => n + t.total, 0));
      const items = tx.reduce((n, t) => n + t.items.length, 0);
      return `
      <h2>History</h2>
      <div class="grid grid-2 mb"><div class="card"><small class="muted">Total value</small><h3>${fmtPeso(total)}</h3></div><div class="card"><small class="muted">Items recycled</small><h3>${items}</h3></div></div>
      <div class="card">${tx.length ? `<ul class="list">${tx.map(txRow).join('')}</ul>` : '<div class="empty">Nothing here yet.</div>'}</div>`;
    },

    profile: (u) => `
      <h2>Profile</h2>
      <form id="formProfile" class="card" novalidate>
        <div class="field"><label for="pName">Name</label><input class="input" id="pName" value="${esc(u.name)}" required></div>
        <div class="field"><label for="pEmail">Email</label><input class="input" id="pEmail" type="email" value="${esc(u.email)}" required></div>
        <div class="field"><label for="pPin">New PIN <small class="muted">(leave blank to keep)</small></label><input class="input" id="pPin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="new-password"></div>
        <div class="error" id="profErr"></div>
        <button class="btn btn-block" type="submit">Save changes</button>
      </form>
      <div class="card">
        <h4>Account</h4>
        <p class="muted">Member since ${fmtDate(u.createdAt)} · ID <span class="mono">${esc(u.id)}</span></p>
        <button class="btn btn-outline btn-block" id="btnLogout">Log out</button>
      </div>`,
  };

  function txRow(t) {
    const [label, color, icon] = REWARD_META[t.reward] || ['Transaction', 'var(--ink-3)', ''];
    const m = DB.machines.byId(t.machineId);
    let right = '';
    if (t.reward === 'coins') right = `<div class="amt">${fmtPeso(t.total)}<small>coins</small></div>`;
    else if (t.reward === 'wifi') right = `<div class="amt">${t.minutes || ''} min<small>${esc(t.voucherCode || '')}</small></div>`;
    else if (t.reward === 'save') right = `<div class="amt" style="color:var(--green-700)">+${t.points} pts<small>${fmtPeso(t.total)}</small></div>`;
    else if (t.reward === 'claim') right = `<div class="amt" style="color:var(--danger)">−${Math.abs(t.points)} pts<small>${t.minutes} min</small></div>`;
    return `<li><div class="tile" style="background:${color}">${icon}</div><div class="body"><b>${label}</b><small>${t.items.length ? t.items.length + ' item' + (t.items.length === 1 ? '' : 's') + ' · ' : ''}${m ? esc(m.name) : 'In app'} · ${fmtDate(t.ts)}</small></div>${right}</li>`;
  }

  function vCard(v) {
    const st = DB.vouchers.status(v);
    const m = DB.machines.byId(v.machineId);
    return `<div class="vcard ${st === 'active' ? '' : 'dim'} mb">
      <div style="flex:1"><div class="code">${esc(v.code)}</div><small class="muted">${v.minutes} min · ${m ? esc(m.name) : 'Claimed in app'} · ${st === 'active' ? 'expires ' + fmtDate(v.expiresAt) : st}</small></div>
      ${st === 'active' ? `<button class="btn btn-outline btn-sm" data-use="${esc(v.code)}">Mark used</button>` : `<span class="badge">${st}</span>`}
    </div>`;
  }

  /* ---------- behaviours ---------- */
  const AFTER = {
    auth() {
      $('#tabLogin').onclick = () => { authTab = 'login'; render(); };
      $('#tabReg').onclick = () => { authTab = 'register'; render(); };
      $('#formAuth').onsubmit = (e) => {
        e.preventDefault();
        const email = $('#fEmail').value.trim(), pin = $('#fPin').value.trim();
        const err = $('#authErr'); err.textContent = '';
        try {
          if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits.');
          if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
          if (authTab === 'register') {
            const name = $('#fName').value.trim();
            if (name.length < 2) throw new Error('Enter your name.');
            const u = DB.users.register(name, email, pin);
            DB.users.login(u.email, pin);
            toast('Account created', 'ok');
          } else { DB.users.login(email, pin); }
          current = 'home'; render();
        } catch (ex) { err.textContent = ex.message; }
      };
    },

    link() {
      const input = $('#fCode');
      const submit = (code) => {
        const err = $('#linkErr'); err.textContent = '';
        try {
          const mId = DB.links.resolve(code, me().id);
          const m = DB.machines.byId(mId);
          toast(`Linked to ${m ? m.name : mId}`, 'ok');
          goto('home');
        } catch (ex) { err.textContent = ex.message; }
      };
      $('#formLink').onsubmit = (e) => { e.preventDefault(); submit(input.value); };
      document.querySelectorAll('[data-code]').forEach((b) => b.addEventListener('click', () => submit(b.dataset.code)));
      input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
      setTimeout(() => input.focus(), 50);
    },

    vouchers(u) {
      const rng = $('#rngPts'); if (!rng) { bindUse(); return; }
      const c = DB.config.get();
      const upd = () => {
        const pts = Number(rng.value);
        $('#outPts').textContent = pts + ' pts';
        $('#pvMin').textContent = minutesFor(pts) + ' min';
        $('#pvBal').textContent = (u.points - pts).toLocaleString() + ' pts';
      };
      rng.addEventListener('input', upd); upd();
      $('#btnClaim').onclick = () => {
        const pts = Number(rng.value);
        if (pts > u.points || pts <= 0) { toast('Not enough points', 'danger'); return; }
        const minutes = minutesFor(pts);
        const v = DB.vouchers.create({ minutes, userId: u.id, machineId: null });
        DB.transactions.add({ machineId: null, userId: u.id, items: [], total: pesos(pts), reward: 'claim', points: -pts, minutes, voucherCode: v.code });
        DB.users.addPoints(u.id, -pts);
        toast(`Voucher ${v.code} ready · ${minutes} min`, 'ok');
        render();
        void c;
      };
      bindUse();
      function bindUse() {
        document.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => { DB.vouchers.redeem(b.dataset.use); toast('Voucher marked as used'); render(); }));
      }
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
      $('#btnLogout').onclick = () => { DB.users.logout(); authTab = 'login'; render(); };
    },
  };

  // re-render when the kiosk or admin changes shared data in another tab
  DB.on((d, source) => { if (source !== 'local') render(); });
  render();

  // optional: register service worker when served over http(s)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  void clamp;
})();
