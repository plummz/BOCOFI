/* ==========================================================================
   BOCO-FI · kiosk state machine
   Implements every screen of the wireframe site map:
     1.1 Idle · 1.2 Interact · 2.1 Log in/Guest · 2.2 QR scan · 2.3 Account linked · 2.4 Guest mode
     3.1 Wi-Fi sync · 3.2 Coin sync · 3.3 Reward availability · 3.4 Reward not available
     4.1 Insert · 4.2 Scanning · 4.3 Accepted · 4.4 Rejected · 4.5 Try another
     5.1 Bin at 80% · 5.2 Crushing · 5.3 Add more / Claim
     6.1 Reward options · 6.2 Dispensing · 6.3 Coins dispensed · 6.4 Wi-Fi generating
     6.5 Wi-Fi confirmation · 6.6 Store to account · 6.7 Store confirmation
     7.1 Thank you · 7.2 Session ended
   ========================================================================== */
(function () {
  'use strict';
  const DB = window.BocofiDB;
  const { esc, fmtPeso, fmtPts, round2, clamp } = DB.util;
  const $ = (s, r = document) => r.querySelector(s);

  /* ---------- machine selection ---------- */
  const MKEY = 'bocofi.kiosk.machine';
  const params = new URLSearchParams(location.search);
  let machineId = params.get('machine') || localStorage.getItem(MKEY) || DB.machines.all()[0].id;
  if (!DB.machines.byId(machineId)) machineId = DB.machines.all()[0].id;
  localStorage.setItem(MKEY, machineId);
  const machine = () => DB.machines.byId(machineId);

  /* ---------- session state ---------- */
  const S = { screen: '1.1', mode: null, user: null, items: [], total: 0, linkCode: null, alerted: false, reward: null };
  let timers = [];
  let idleTimer = null;
  const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  const PHASE_COLOR = { 1: 'var(--c-startup)', 2: 'var(--c-identify)', 3: 'var(--c-check)', 4: 'var(--c-deposit)', 5: 'var(--c-storage)', 6: 'var(--c-rewards)', 7: 'var(--c-close)' };
  const TITLES = {
    '1.1': 'Idle', '1.2': 'Interact prompt', '2.1': 'Log in or guest', '2.2': 'QR scan', '2.3': 'Account linked', '2.4': 'Guest mode',
    '3.1': 'Wi-Fi sync', '3.2': 'Coin sync', '3.3': 'Reward availability', '3.4': 'Reward not available',
    '4.1': 'Insert prompt', '4.2': 'Scanning', '4.3': 'Item accepted', '4.4': 'Item rejected', '4.5': 'Try another item',
    '5.1': 'Bin at 80%', '5.2': 'Crushing', '5.3': 'Add more or claim',
    '6.1': 'Reward options', '6.2': 'Coin dispense', '6.3': 'Coin confirmation', '6.4': 'Wi-Fi generating', '6.5': 'Wi-Fi confirmation', '6.6': 'Store to account', '6.7': 'Store confirmation',
    '7.1': 'Thank you', '7.2': 'Session ended',
  };

  const ICON = {
    check: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 12l5 5L19 7"/></svg>',
    x: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    down: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 4v16M5 13l7 7 7-7"/></svg>',
    coins: '<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="9" r="6"/><path d="M14.5 8.2A6 6 0 1 1 8.2 14.5"/></svg>',
    wifi: '<svg class="ico" viewBox="0 0 24 24"><path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/></svg>',
    save: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 7a8 3 0 0 1 16 0v10a8 3 0 0 1-16 0z"/><path d="M4 7a8 3 0 0 0 16 0M4 12a8 3 0 0 0 16 0"/></svg>',
    leaf: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 19C5 9 11 5 20 4c0 9-4 15-14 15z"/><path d="M5 19l8-8"/></svg>',
  };

  /* ---------- helpers ---------- */
  function toast(msg, kind = '') {
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
    $('#toasts').appendChild(el); setTimeout(() => el.remove(), 2800);
  }
  const wifiLabel = (s) => ({ strong: 'Strong', weak: 'Weak', none: 'No signal' }[s] || s);
  const sessionMinutes = () => Math.max(1, Math.round(S.total * DB.config.get().wifiMinutesPerPeso));
  const sessionPoints = () => Math.round(S.total * DB.config.get().pointsPerPeso);

  function publishSession() {
    DB.machines.setSession(machineId, S.screen === '1.1' ? null : {
      screen: S.screen, title: TITLES[S.screen], mode: S.mode, userId: S.user ? S.user.id : null, userName: S.user ? S.user.name : null,
      items: S.items.length, total: S.total, updatedAt: Date.now(),
    });
  }

  function resetSession() {
    Object.assign(S, { mode: null, user: null, items: [], total: 0, linkCode: null, alerted: false, reward: null });
  }

  /* ---------- navigation ---------- */
  function go(screen) {
    clearTimers();
    S.screen = screen;
    const phase = Number(screen.split('.')[0]);
    document.documentElement.style.setProperty('--accent', PHASE_COLOR[phase]);
    $('#stepLabel').textContent = `${screen} · ${TITLES[screen]}`;
    $('#progressFill').style.width = (phase / 7 * 100) + '%';
    const stage = $('#stage');
    stage.innerHTML = '';
    const el = document.createElement('section');
    el.className = 'screen'; el.dataset.screen = screen;
    el.innerHTML = SCREENS[screen]();
    stage.appendChild(el);
    if (AFTER[screen]) AFTER[screen](el);
    publishSession();
    armIdle();
    renderHeader();
  }

  function armIdle() {
    clearTimeout(idleTimer);
    if (S.screen === '1.1') return;
    idleTimer = setTimeout(() => { resetSession(); go('1.1'); toast('Session timed out'); }, DB.config.get().idleTimeoutSeconds * 1000);
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, armIdle, { passive: true }));

  /* ---------- screen templates ---------- */
  const SCREENS = {
    '1.1': () => {
      const m = machine();
      const unavailable = !m || m.status !== 'online';
      const reason = m ? `This machine is ${m.status}. Please choose an available machine or ask for help.` : 'No recycling machine is configured.';
      return `
      <button class="start-circle" id="btnStart" aria-label="Recycle Today — tap to start" ${unavailable ? 'disabled aria-describedby="startStatus"' : ''}>Recycle<br>Today<small>${unavailable ? 'Unavailable' : 'Tap to Start'}</small></button>
      ${unavailable ? `<p class="start-status" id="startStatus" role="status">${esc(reason)}</p>` : ''}`;
    },

    '1.2': () => `
      <div class="icon-circle pop">${ICON.check}</div>
      <h1>Ready when you are</h1>
      <p class="sub">Press start to begin</p>
      <div class="actions"><button class="btn btn-lg" data-go="2.1">START</button></div>`,

    '2.1': () => `
      <h1>How do you want to continue?</h1>
      <p class="sub">Log in to save credits to your account, or continue as a guest.</p>
      <div class="actions">
        <button class="btn btn-blue btn-lg" data-go="2.2">LOG IN</button>
        <button class="btn btn-outline btn-lg" data-go="2.4">GUEST</button>
      </div>`,

    '2.2': () => `
      <h2>Scan this in the BOCO-FI app</h2>
      <div class="qr-box"><canvas id="qr" width="29" height="29" aria-label="Login QR code"></canvas></div>
      <p class="sub">Or enter this code in the app under <b>Link to machine</b></p>
      <div class="qr-code" id="qrCode">····</div>
      <div class="actions"><button class="btn btn-ghost" data-go="2.1">Back</button></div>`,

    '2.3': () => `
      <div class="icon-circle pop">${ICON.check}</div>
      <h1>Welcome back${S.user ? ', ' + esc(S.user.name.split(' ')[0]) : ''}</h1>
      <p class="sub">Balance <b>${fmtPts(S.user ? S.user.points : 0)}</b></p>`,

    '2.4': () => {
      const a = DB.machines.availability(machine());
      return `
      <h2>Guest mode</h2>
      <div class="panel">
        <div class="status-row"><span class="lbl"><i class="dot ${a.coins || a.wifi ? 'info' : 'danger'}"></i>Coins &amp; vouchers</span><span class="val ${a.coins || a.wifi ? 'ok' : 'bad'}">${a.coins || a.wifi ? 'Available' : 'Not available'}</span></div>
        <div class="status-row"><span class="lbl"><i class="dot danger"></i>Saving credits</span><span class="val bad">Not available</span></div>
      </div>
      <p class="sub">Log in with the app next time to save credits to your account.</p>
      <div class="actions"><button class="btn btn-blue" data-go="3.1">CONTINUE</button></div>`;
    },

    '3.1': () => {
      const m = machine();
      const ok = m.wifiSignal === 'strong', weak = m.wifiSignal === 'weak';
      return `
      <h2>System check</h2>
      <div class="panel">
        <div class="status-row"><span class="lbl"><i class="dot ${ok ? 'ok' : weak ? 'warn' : 'danger'}"></i>Wi-Fi signal</span><span class="val ${ok ? 'ok' : weak ? 'warn' : 'bad'}">${wifiLabel(m.wifiSignal)}</span></div>
      </div>
      <p class="sub">Checking connection…</p>`;
    },

    '3.2': () => {
      const m = machine(); const a = DB.machines.availability(m);
      return `
      <h2>System check</h2>
      <div class="panel">
        <div class="lbl-top">Coin hopper level</div>
        <div class="bar ${a.coins ? '' : 'danger'}"><i style="width:${m.coinHopper}%"></i></div>
        <div class="muted">${a.coins ? 'Enough for this session' : 'Coins are running out'}</div>
      </div>`;
    },

    '3.3': () => {
      const a = DB.machines.availability(machine());
      const row = (label, ok) => `<div class="status-row"><span class="lbl"><i class="dot ${ok ? 'ok' : 'danger'}"></i>${label}</span><span class="val ${ok ? 'ok' : 'bad'}">${ok ? 'Available' : 'Not available'}</span></div>`;
      return `
      <h2>Rewards available today</h2>
      <div class="panel">${row('Coins', a.coins)}${row('Wi-Fi voucher', a.wifi)}${S.user ? row('Save to account', true) : ''}</div>`;
    },

    '3.4': () => `
      <div class="icon-circle pop" style="--accent:var(--c-close)">${ICON.x}</div>
      <h1>No rewards available</h1>
      <p class="sub" id="noRewardsWhy">Please come back later</p>`,

    '4.1': () => {
      const table = DB.config.get().rewardTable;
      return `
      <div class="icon-circle bounce">${ICON.down}</div>
      <h1>Insert your bottle or can</h1>
      <p class="sub">Plastic bottles and aluminium cans</p>
      ${S.items.length ? `<div class="chip">Session total <b>${fmtPeso(S.total)}</b> · ${S.items.length} item${S.items.length > 1 ? 's' : ''}</div>
        <div class="actions"><button class="btn btn-outline" data-go="6.1">CLAIM REWARDS</button></div>` : ''}
      <div class="sim">
        <div class="sim-title">Demo · sensor simulator — insert an item</div>
        <div class="sim-btns">
          ${table.map((r) => `<button class="btn btn-outline" data-insert="${r.id}">${esc(r.label)} <small>${fmtPeso(r.value)}</small></button>`).join('')}
          <button class="btn btn-danger" data-insert="invalid">Unknown item</button>
        </div>
      </div>`;
    },

    '4.2': () => `
      <div class="scan-frame"><div class="bottle"></div></div>
      <h2>Scanning…</h2>
      <p class="sub">Checking material and weight</p>`,

    '4.3': () => {
      const last = S.items[S.items.length - 1];
      return `
      <p class="sub">Item accepted · ${esc(last.label)}</p>
      <div class="big-value">+${fmtPeso(last.value)}</div>
      <div class="chip">Session total <b>${fmtPeso(S.total)}</b></div>`;
    },

    '4.4': () => `
      <div class="icon-circle pop" style="--accent:var(--c-close)">${ICON.x}</div>
      <h1>Item not recognised</h1>
      <p class="sub">Please take it from the drawer</p>`,

    '4.5': () => `
      <h1>Try another item?</h1>
      <div class="actions">
        <button class="btn btn-lg" data-go="4.1">YES</button>
        <button class="btn btn-outline btn-lg" id="btnNoMore">NO</button>
      </div>`,

    '5.1': () => `
      <h2>Bin capacity</h2>
      <div class="panel">
        <div class="bar warn"><i style="width:${machine().binLevel}%"></i></div>
        <div class="muted">Bin at ${machine().binLevel}% — crusher will run shortly</div>
      </div>`,

    '5.2': () => `
      <h2>Crushing</h2>
      <div class="panel">
        <div class="bar warn"><i id="crushBar" style="width:0%"></i></div>
        <div class="muted">Please wait a moment</div>
      </div>`,

    '5.3': () => `
      <h1>What would you like to do?</h1>
      <div class="chip">Session total <b>${fmtPeso(S.total)}</b> · ${S.items.length} item${S.items.length > 1 ? 's' : ''}</div>
      <div class="actions">
        <button class="btn btn-lg" style="background:var(--c-storage)" data-go="4.1">ADD MORE</button>
        <button class="btn btn-outline btn-lg" style="border-color:var(--c-storage);color:var(--c-storage)" data-go="6.1">CLAIM</button>
      </div>`,

    '6.1': () => {
      const a = DB.machines.availability(machine());
      const c = DB.config.get();
      return `
      <h1>Choose your reward</h1>
      <div class="chip">Session total <b>${fmtPeso(S.total)}</b></div>
      <div class="reward-grid">
        <button class="reward-card" data-reward="coins" ${a.coins ? '' : 'disabled'}>${ICON.coins}COINS<small>${a.coins ? fmtPeso(S.total) + ' in coins' : 'Not available'}</small></button>
        <button class="reward-card" data-reward="wifi" ${a.wifi ? '' : 'disabled'}>${ICON.wifi}WI-FI<small>${a.wifi ? sessionMinutes() + ' min voucher' : 'Not available'}</small></button>
        <button class="reward-card" data-reward="save" ${S.user ? '' : 'disabled'}>${ICON.save}SAVE<small>${S.user ? '+' + sessionPoints() + ' pts to account' : 'Log in to save'}</small></button>
      </div>
      <p class="sub muted">${c.pointsPerPeso} pts = ₱1 · ${c.wifiMinutesPerPeso} min Wi-Fi = ₱1</p>`;
    },

    '6.2': () => `
      <p class="sub">Dispensing</p>
      <div class="big-value">${fmtPeso(S.total)}</div>
      <div class="panel"><div class="bar" style="--accent:var(--c-rewards)"><i id="dispBar" style="width:0%;background:var(--c-rewards)"></i></div></div>
      <div class="chip">Collect from the tray below</div>`,

    '6.3': () => `
      <div class="icon-circle pop">${ICON.check}</div>
      <h1>Coins dispensed</h1>
      <p class="sub">Thank you for recycling</p>`,

    '6.4': () => `
      <h2>Generating your voucher</h2>
      <div class="panel"><div class="bar"><i id="genBar" style="width:0%;background:var(--c-rewards)"></i></div><div class="muted">Please wait</div></div>`,

    '6.5': () => `
      <p class="sub">Your Wi-Fi voucher · ${sessionMinutes()} minutes</p>
      <div class="voucher" id="voucherCode">${esc(S.reward && S.reward.voucherCode || '')}</div>
      <p class="countdown">Disappears in <span id="cd">${DB.config.get().voucherDisplaySeconds}</span> seconds</p>
      <div class="actions"><button class="btn" style="background:var(--c-rewards)" data-go="7.1">DONE</button></div>`,

    '6.6': () => `
      <p class="sub">Saving to your account</p>
      <div class="big-value">+${sessionPoints()} pts</div>
      <div class="chip">New balance <b>${fmtPts((S.user ? S.user.points : 0) + sessionPoints())}</b></div>`,

    '6.7': () => `
      <div class="icon-circle pop">${ICON.check}</div>
      <h1>Credits saved</h1>
      <p class="sub">Claim them in the app anytime</p>`,

    '7.1': () => `
      <div class="icon-circle pop">${ICON.leaf}</div>
      <h1>Thank you for recycling</h1>
      <p class="sub">${S.items.length} item${S.items.length === 1 ? '' : 's'} · ${fmtPeso(S.total)}${S.user ? ' · ' + esc(S.user.name.split(' ')[0]) : ''}</p>
      <div class="actions"><button class="btn btn-lg" style="background:var(--c-close)" id="btnDone">DONE</button></div>`,

    '7.2': () => `
      <div class="icon-circle pop">${ICON.x}</div>
      <h1>Session ended</h1>
      <p class="sub">No valid items were inserted</p>`,
  };

  /* ---------- per-screen behaviour ---------- */
  const AFTER = {
    '1.1': (el) => {
      const button = $('#btnStart', el);
      if (!button || button.disabled) return;
      button.addEventListener('click', () => {
        button.disabled = true;
        button.classList.add('is-loading');
        button.setAttribute('aria-busy', 'true');
        button.innerHTML = `Starting…<small>${esc(machine().name)}</small>`;
        later(450, () => go('1.2'));
      });
    },
    '1.2': () => later(2500, () => go('2.1')),

    '2.2': (el) => {
      S.linkCode = DB.links.create(machineId);
      $('#qrCode', el).textContent = S.linkCode;
      drawQR($('#qr', el), `BOCOFI:${machineId}:${S.linkCode}`);
      const poll = () => {
        const l = DB.links.get(S.linkCode);
        if (l && l.status === 'linked') {
          S.user = DB.users.byId(l.userId); S.mode = 'user';
          DB.links.cancel(S.linkCode);
          go('2.3');
        } else later(700, poll);
      };
      later(700, poll);
    },
    '2.3': () => later(2400, () => go('3.1')),
    '2.4': () => { S.mode = 'guest'; later(3500, () => go('3.1')); },

    '3.1': () => later(1800, () => go('3.2')),
    '3.2': () => later(1800, () => {
      const m = machine(); const a = DB.machines.availability(m);
      if (a.binFull || !a.online) { go('3.4'); $('#noRewardsWhy').textContent = a.online ? 'The bin is full — please come back later' : 'Machine is under maintenance'; return; }
      if (!a.coins && !a.wifi) { go('3.4'); return; }
      go('3.3');
    }),
    '3.3': () => {
      const a = DB.machines.availability(machine());
      if (!S.alerted && (!a.coins || !a.wifi)) {
        // flowchart: "Notifies OWNER — user told only COINS / only WIFI VOUCHER can be selected"
        DB.alerts.add(machineId, !a.coins ? 'coins' : 'wifi', 'warning', !a.coins ? 'Coin hopper low — users are being offered Wi-Fi vouchers only.' : 'Wi-Fi unavailable — users are being offered coins only.');
        S.alerted = true;
      }
      later(2600, () => go('4.1'));
    },
    '3.4': () => {
      if (!S.alerted) { DB.alerts.add(machineId, 'rewards', 'critical', 'No rewards available — user was turned away.'); S.alerted = true; }
      later(4000, () => { resetSession(); go('1.1'); });
    },

    '4.1': (el) => {
      el.querySelectorAll('[data-insert]').forEach((b) => b.addEventListener('click', () => insertItem(b.dataset.insert)));
    },
    '4.2': () => later(1700, () => {
      const pending = S.pendingItem; S.pendingItem = null;
      if (!pending) { go('4.4'); return; }
      S.items.push(pending); S.total = round2(S.total + pending.value);
      // fill-level sensor: each item adds ~1.5% to the bin
      const m = machine();
      DB.machines.patch(machineId, { binLevel: clamp(round2(m.binLevel + 1.5), 0, 100) });
      go('4.3');
    }),
    '4.3': () => later(2200, () => {
      const a = DB.machines.availability(machine());
      go(a.binHigh ? '5.1' : '5.3');
    }),
    '4.4': () => later(2600, () => go('4.5')),
    '4.5': (el) => { $('#btnNoMore', el).addEventListener('click', () => go(S.items.length ? '6.1' : '7.2')); },

    '5.1': () => later(2200, () => go('5.2')),
    '5.2': (el) => {
      const bar = $('#crushBar', el);
      requestAnimationFrame(() => { bar.style.transition = 'width 2.8s linear'; bar.style.width = '100%'; });
      later(3000, () => {
        const m = machine();
        // crusher compacts the contents: fill level drops, owner is notified
        DB.machines.patch(machineId, { binLevel: clamp(Math.round(m.binLevel * 0.55), 0, 100), lastCrush: Date.now() });
        DB.alerts.add(machineId, 'bin', 'warning', `Bin reached ${Math.round(m.binLevel)}% — crusher cycle ran. Schedule a collection soon.`);
        toast('Crusher cycle complete');
        go('6.1');
      });
    },

    '6.1': (el) => {
      el.querySelectorAll('[data-reward]').forEach((b) => b.addEventListener('click', () => chooseReward(b.dataset.reward)));
    },
    '6.2': (el) => {
      const bar = $('#dispBar', el);
      requestAnimationFrame(() => { bar.style.transition = 'width 2.4s ease'; bar.style.width = '100%'; });
      later(2700, () => go('6.3'));
    },
    '6.3': () => later(2400, () => go('7.1')),
    '6.4': (el) => {
      const bar = $('#genBar', el);
      requestAnimationFrame(() => { bar.style.transition = 'width 1.8s ease'; bar.style.width = '100%'; });
      later(2000, () => go('6.5'));
    },
    '6.5': (el) => {
      let n = DB.config.get().voucherDisplaySeconds;
      const tick = () => { n -= 1; $('#cd', el).textContent = n; if (n <= 0) go('7.1'); else later(1000, tick); };
      later(1000, tick);
    },
    '6.6': () => later(2600, () => go('6.7')),
    '6.7': () => later(2400, () => go('7.1')),

    '7.1': (el) => { $('#btnDone', el).addEventListener('click', () => { resetSession(); go('1.1'); }); later(8000, () => { resetSession(); go('1.1'); }); },
    '7.2': () => later(4000, () => { resetSession(); go('1.1'); }),
  };

  /* ---------- domain actions ---------- */
  function insertItem(typeId) {
    const a = DB.machines.availability(machine());
    if (a.binFull) { toast('Bin is full — cannot accept more items', 'danger'); return; }
    const r = DB.config.rewardFor(typeId);
    S.pendingItem = r ? { type: r.id, label: r.label, value: r.value } : null;
    go('4.2');
  }

  function chooseReward(kind) {
    const m = machine(); const c = DB.config.get();
    const base = { machineId, userId: S.user ? S.user.id : null, items: S.items.slice(), total: S.total, reward: kind };
    if (kind === 'coins') {
      const tx = DB.transactions.add(base);
      S.reward = tx;
      // hopper drains roughly 2% per peso paid out
      DB.machines.patch(machineId, { totalBottles: m.totalBottles + S.items.length, totalPaidOut: round2(m.totalPaidOut + S.total), coinHopper: clamp(round2(m.coinHopper - S.total * 2), 0, 100) });
      if (S.user) DB.users.addPoints(S.user.id, 0, S.items.length);
      go('6.2');
    } else if (kind === 'wifi') {
      const minutes = sessionMinutes();
      const tx = DB.transactions.add(Object.assign({}, base, { minutes }));
      const v = DB.vouchers.create({ minutes, txId: tx.id, userId: S.user ? S.user.id : null, machineId });
      DB.update((d) => { const t = d.transactions.find((x) => x.id === tx.id); if (t) t.voucherCode = v.code; });
      S.reward = Object.assign({}, tx, { voucherCode: v.code });
      DB.machines.patch(machineId, { totalBottles: m.totalBottles + S.items.length });
      if (S.user) DB.users.addPoints(S.user.id, 0, S.items.length);
      go('6.4');
    } else if (kind === 'save') {
      if (!S.user) return;
      const pts = sessionPoints();
      const tx = DB.transactions.add(Object.assign({}, base, { points: pts }));
      S.reward = tx;
      DB.users.addPoints(S.user.id, pts, S.items.length);
      DB.machines.patch(machineId, { totalBottles: m.totalBottles + S.items.length });
      go('6.6');
      S.user = DB.users.byId(S.user.id); // refresh balance for later screens
    }
    void c;
  }

  /* ---------- pseudo QR renderer (deterministic pattern with finder squares) ---------- */
  function drawQR(canvas, text) {
    const N = 29, ctx = canvas.getContext('2d');
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, N, N); ctx.fillStyle = '#1d2733';
    const finder = (x, y) => { ctx.fillRect(x, y, 7, 7); ctx.fillStyle = '#fff'; ctx.fillRect(x + 1, y + 1, 5, 5); ctx.fillStyle = '#1d2733'; ctx.fillRect(x + 2, y + 2, 3, 3); };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const inFinder = (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
      if (!inFinder && rnd() > 0.55) ctx.fillRect(x, y, 1, 1);
    }
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
  }

  /* ---------- header: bell, avatar, drawer ---------- */
  function renderHeader() {
    const m = machine(); const a = DB.machines.availability(m);
    const notices = [];
    if (!a.online) notices.push(['danger', 'Machine is ' + m.status]);
    if (a.binFull) notices.push(['danger', `Bin full (${m.binLevel}%)`]);
    else if (a.binHigh) notices.push(['warn', `Bin at ${m.binLevel}% — crusher armed`]);
    if (!a.coins) notices.push(['warn', `Coins unavailable (hopper ${m.coinHopper}%)`]);
    if (!a.wifi) notices.push(['warn', 'Wi-Fi voucher unavailable']);
    const bc = $('#bellCount'); bc.hidden = notices.length === 0; bc.textContent = notices.length;
    $('#noticeList').innerHTML = notices.length ? notices.map(([k, t]) => `<li><i class="dot ${k}"></i><span>${esc(t)}</span></li>`).join('') : '<li class="muted">All systems normal.</li>';
    const av = $('#btnUser');
    av.classList.toggle('linked', !!S.user);
    av.innerHTML = S.user ? esc(S.user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()) : '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
    $('#userInfo').textContent = S.user ? `${S.user.name} · ${fmtPts(S.user.points)}` : S.mode === 'guest' ? 'Guest session — credits cannot be saved.' : 'No user linked.';
    $('#machineLabel').textContent = `${m.id} · ${m.name}`;
  }

  function togglePop(id) {
    const el = $(id); const open = el.hidden;
    ['#popNotices', '#popUser'].forEach((s) => { $(s).hidden = true; });
    el.hidden = !open;
  }
  $('#btnBell').addEventListener('click', () => togglePop('#popNotices'));
  $('#btnUser').addEventListener('click', () => togglePop('#popUser'));
  $('#stage').addEventListener('pointerdown', () => { $('#popNotices').hidden = true; $('#popUser').hidden = true; });

  function openDrawer(open) {
    $('#drawer').hidden = !open; $('#scrim').hidden = !open; $('#btnMenu').setAttribute('aria-expanded', String(open));
    if (open) syncDrawer();
  }
  function syncDrawer() {
    const m = machine();
    const sel = $('#selMachine');
    sel.innerHTML = DB.machines.all().map((x) => `<option value="${x.id}" ${x.id === machineId ? 'selected' : ''}>${x.id} · ${esc(x.name)}</option>`).join('');
    $('#rngBin').value = m.binLevel; $('#outBin').textContent = Math.round(m.binLevel) + '%';
    $('#rngCoins').value = m.coinHopper; $('#outCoins').textContent = Math.round(m.coinHopper) + '%';
    $('#selWifi').value = m.wifiSignal;
  }
  $('#btnMenu').addEventListener('click', () => openDrawer(true));
  $('#btnCloseDrawer').addEventListener('click', () => openDrawer(false));
  $('#scrim').addEventListener('click', () => openDrawer(false));
  $('#selMachine').addEventListener('change', (e) => { machineId = e.target.value; localStorage.setItem(MKEY, machineId); resetSession(); go('1.1'); syncDrawer(); });
  $('#rngBin').addEventListener('input', (e) => { $('#outBin').textContent = e.target.value + '%'; DB.machines.patch(machineId, { binLevel: Number(e.target.value) }); renderHeader(); });
  $('#rngCoins').addEventListener('input', (e) => { $('#outCoins').textContent = e.target.value + '%'; DB.machines.patch(machineId, { coinHopper: Number(e.target.value) }); renderHeader(); });
  $('#selWifi').addEventListener('change', (e) => { DB.machines.patch(machineId, { wifiSignal: e.target.value }); renderHeader(); });
  $('#btnSimScan').addEventListener('click', () => {
    if (S.screen !== '2.2' || !S.linkCode) { toast('Go to the Log in screen first (2.2)', 'danger'); return; }
    DB.links.resolve(S.linkCode, DB.users.all()[0].id); openDrawer(false);
  });
  $('#btnResetSession').addEventListener('click', () => { resetSession(); go('1.1'); openDrawer(false); });

  // generic [data-go] navigation
  $('#stage').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

  // react to changes made from other tabs (admin toggles, app linking)
  DB.on((d, source) => { if (source === 'remote') { renderHeader(); if (!$('#drawer').hidden) syncDrawer(); } });

  /* ---------- progress ticks + boot ---------- */
  $('#progressTicks').innerHTML = '<i></i>'.repeat(7);
  go('1.1');
})();
