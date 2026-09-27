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
  const S = { screen: '1.1', mode: null, user: null, items: [], total: 0, pendingItem: null, rejectReason: null, crusherError: null, rewardError: null, linkCode: null, alerted: false, reward: null };
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
    if (S.linkCode) DB.links.cancel(S.linkCode);
    Object.assign(S, { mode: null, user: null, items: [], total: 0, pendingItem: null, rejectReason: null, crusherError: null, rewardError: null, linkCode: null, alerted: false, reward: null });
  }

  /* ---------- navigation ---------- */
  function go(screen) {
    if (S.screen === '2.2' && screen !== '2.2' && S.linkCode) {
      DB.links.cancel(S.linkCode);
      S.linkCode = null;
    }
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

    '1.2': () => {
      const m = machine();
      const available = m && m.status === 'online';
      return `
      <div class="icon-circle pop" ${available ? '' : 'style="--accent:var(--color-danger)"'}>${available ? ICON.check : ICON.x}</div>
      <h1>${available ? 'Ready when you are' : 'Machine unavailable'}</h1>
      <p class="sub" role="${available ? 'status' : 'alert'}">${available ? `Connected to ${esc(m.name)}. Press start to begin.` : `This machine is ${esc(m ? m.status : 'unavailable')}. Choose another machine or ask for help.`}</p>
      <div class="actions"><button class="btn btn-lg" id="btnContinue" ${available ? '' : 'data-go="1.1"'}>${available ? 'START' : 'BACK TO IDLE'}</button>${available ? '<button class="btn btn-ghost" data-go="1.1">BACK</button>' : ''}</div>`;
    },

    '2.1': () => {
      const m = machine();
      const available = !!m && m.status === 'online';
      return `
      <h1>How do you want to continue?</h1>
      <p class="sub" role="status">${available ? `At ${esc(m.name)}, log in to save credits to your account or continue as a guest.` : 'Login and guest sessions are unavailable until this machine is online.'}</p>
      <div class="actions">
        <button class="btn btn-blue btn-lg" data-go="2.2" ${available ? '' : 'disabled'}>LOG IN</button>
        <button class="btn btn-outline btn-lg" data-go="2.4" ${available ? '' : 'disabled'}>GUEST</button>
        <button class="btn btn-ghost" data-go="1.2">BACK</button>
      </div>
      ${available ? '' : `<p class="start-status" role="alert">${esc(m ? `This machine is ${m.status}. Select an available machine in the service menu.` : 'No recycling machine is configured.')}</p>`}`;
    },

    '2.2': () => {
      const m = machine();
      if (!m || m.status !== 'online') return `
        <div class="icon-circle pop" style="--accent:var(--color-danger)">${ICON.x}</div>
        <h2>Machine unavailable</h2>
        <p class="sub" role="alert">${esc(m ? `This machine is ${m.status}; account linking is paused.` : 'No recycling machine is configured.')}</p>
        <div class="actions"><button class="btn btn-ghost" data-go="2.1">BACK</button></div>`;
      return `
      <h2>Link your account in the BOCO-FI app</h2>
      <div class="qr-box"><canvas id="qr" width="29" height="29" aria-label="Decorative QR preview; use the code below"></canvas></div>
      <p class="sub" id="linkStatus" role="status">Open Link to Machine and enter this one-time code.</p>
      <div class="qr-code" id="qrCode">Preparing…</div>
      <div class="actions"><button class="btn btn-ghost" data-go="2.1">BACK</button></div>`;
    },

    '2.3': () => S.user ? `
      <div class="icon-circle pop" style="--accent:var(--color-ok)">${ICON.check}</div>
      <h1>Welcome back, ${esc(S.user.name.split(' ')[0])}</h1>
      <p class="sub" role="status">Your balance is <b>${fmtPts(S.user.points)}</b>.</p>
      <div class="actions"><button class="btn btn-blue btn-lg" id="btnLinkedContinue">CONTINUE</button></div>` : `
      <div class="icon-circle pop" style="--accent:var(--color-danger)">${ICON.x}</div>
      <h1>Account could not be linked</h1>
      <p class="sub" role="alert">The linked account is no longer available. Please try again.</p>
      <div class="actions"><button class="btn btn-blue btn-lg" data-go="2.1">TRY AGAIN</button></div>`,

    '2.4': () => {
      const m = machine();
      const online = !!m && m.status === 'online';
      const a = m ? DB.machines.availability(m) : { coins: false, wifi: false };
      return `
      <h2>Guest mode</h2>
      <p class="sub" role="status">${online ? `Using ${esc(m.name)}. Recycling credits cannot be saved in a guest session.` : 'Guest recycling is unavailable while this machine is offline.'}</p>
      <div class="panel">
        <div class="status-row"><span class="lbl"><i class="dot ${a.coins || a.wifi ? 'info' : 'danger'}"></i>Coins &amp; vouchers</span><span class="val ${a.coins || a.wifi ? 'ok' : 'bad'}">${a.coins || a.wifi ? 'Available' : 'Not available'}</span></div>
        <div class="status-row"><span class="lbl"><i class="dot danger"></i>Saving credits</span><span class="val bad">Not available</span></div>
      </div>
      ${online ? '<p class="sub">Log in with the app next time to save credits to your account.</p>' : '<p class="start-status" role="alert">Select an available machine in the service menu to continue.</p>'}
      <div class="actions"><button class="btn btn-blue" id="btnGuestContinue" ${online ? '' : 'disabled'}>CONTINUE</button><button class="btn btn-ghost" data-go="2.1">BACK</button></div>`;
    },

    '3.1': () => {
      const m = machine();
      const online = !!m && m.status === 'online';
      const ok = online && m.wifiSignal === 'strong', weak = online && m.wifiSignal === 'weak';
      return `
      <h2>System check</h2>
      <div class="panel">
        <div class="status-row"><span class="lbl"><i class="dot ${ok ? 'ok' : weak ? 'warn' : 'danger'}"></i>Wi-Fi signal</span><span class="val ${ok ? 'ok' : weak ? 'warn' : 'bad'}">${esc(m ? wifiLabel(m.wifiSignal) : 'Unavailable')}</span></div>
      </div>
      <p class="sub" role="${online ? 'status' : 'alert'}">${online ? `Checking connection for ${esc(m.name)}…` : 'Machine unavailable. System check cannot continue.'}</p>
      <div class="actions"><button class="btn btn-blue" id="btnWifiContinue" ${online ? '' : 'disabled'}>CONTINUE</button><button class="btn btn-ghost" data-go="${S.mode === 'guest' ? '2.4' : '2.1'}">BACK</button></div>`;
    },

    '3.2': () => {
      const m = machine();
      const online = !!m && m.status === 'online';
      const a = m ? DB.machines.availability(m) : { coins: false };
      const hopper = m ? clamp(Number(m.coinHopper) || 0, 0, 100) : 0;
      return `
      <h2>System check</h2>
      <div class="panel">
        <div class="lbl-top">Coin hopper level</div>
        <div class="bar ${a.coins ? '' : 'danger'}"><i style="width:${hopper}%"></i></div>
        <div class="muted" role="${online ? 'status' : 'alert'}">${online ? `${hopper}% · ${a.coins ? 'Enough for this session' : 'Coins are running out'}` : 'Machine unavailable'}</div>
      </div>
      <div class="actions"><button class="btn btn-blue" id="btnCoinsContinue" ${online ? '' : 'disabled'}>CONTINUE</button><button class="btn btn-ghost" data-go="3.1">BACK</button></div>`;
    },

    '3.3': () => {
      const m = machine();
      const a = m ? DB.machines.availability(m) : { online: false, binFull: false, coins: false, wifi: false };
      const row = (label, ok) => `<div class="status-row"><span class="lbl"><i class="dot ${ok ? 'ok' : 'danger'}"></i>${label}</span><span class="val ${ok ? 'ok' : 'bad'}">${ok ? 'Available' : 'Not available'}</span></div>`;
      return `
      <h2>Rewards available today</h2>
      <div class="panel">${row('Coins', a.coins)}${row('Wi-Fi voucher', a.wifi)}${S.user ? row('Save to account', true) : ''}</div>
      <p class="sub" role="${a.online && !a.binFull && (a.coins || a.wifi || S.user) ? 'status' : 'alert'}">${a.online && !a.binFull ? `Checked for ${esc(m.name)}.` : !a.online ? 'This machine is offline.' : 'The recycling bin is full.'}</p>
      <div class="actions"><button class="btn btn-blue" id="btnRewardsContinue" ${a.online && !a.binFull && (a.coins || a.wifi || S.user) ? '' : 'disabled'}>CONTINUE</button><button class="btn btn-ghost" data-go="3.2">BACK</button></div>`;
    },

    '3.4': () => {
      const m = machine();
      const a = m ? DB.machines.availability(m) : { online: false, binFull: false, coins: false, wifi: false };
      const reason = !m ? 'No recycling machine is configured.' : !a.online ? `Machine ${esc(m.name)} is ${esc(m.status)}.` : a.binFull ? `The bin at ${esc(m.name)} is full.` : !a.coins && !a.wifi ? 'Coins and Wi-Fi vouchers are unavailable.' : 'Reward availability changed during the system check.';
      return `
      <div class="icon-circle pop" style="--accent:var(--color-danger)">${ICON.x}</div>
      <h1>No rewards available</h1>
      <p class="sub" id="noRewardsWhy" role="alert">${reason} Use the service menu to check another machine, or return to account choices.</p>
      <div class="actions"><button class="btn btn-blue" id="btnNoRewardRestart">START OVER</button><button class="btn btn-ghost" id="btnNoRewardOptions">ACCOUNT CHOICES</button></div>`;
    },

    '4.1': () => {
      const m = machine();
      const a = m ? DB.machines.availability(m) : { online: false, binFull: false };
      const table = DB.config.get().rewardTable;
      const ready = !!m && a.online && !a.binFull;
      const disabledItems = ready ? '' : 'disabled';
      const notice = !m ? 'No recycling machine is configured.' : !a.online ? `Machine ${esc(m.name)} is ${esc(m.status)}.` : a.binFull ? 'The recycling bin is full.' : '';
      return `
      <div class="icon-circle bounce">${ICON.down}</div>
      <h1>Insert your bottle or can</h1>
      <p class="sub" role="${ready ? 'status' : 'alert'}">${ready ? `Plastic bottles and aluminium cans · ${esc(m.name)}` : esc(notice)}</p>
      ${S.items.length ? `<div class="chip" role="status">Session total <b>${fmtPeso(S.total)}</b> · ${S.items.length} item${S.items.length > 1 ? 's' : ''}</div>
        <div class="actions"><button class="btn btn-outline" data-go="6.1" ${a.online ? '' : 'disabled'}>CLAIM REWARDS</button></div>` : ''}
      <div class="sim">
        <div class="sim-title">Demo · sensor simulator — insert an item</div>
        ${table.length ? `<div class="sim-btns">
          ${table.map((r) => `<button class="btn btn-outline" data-insert="${esc(r.id)}" ${disabledItems}>${esc(r.label)} <small>${fmtPeso(r.value)}</small></button>`).join('')}
          <button class="btn btn-danger" data-insert="invalid" ${disabledItems}>Unknown item</button>
        </div>` : '<p class="sub" role="alert">No recyclable item types are configured.</p>'}
        ${S.items.length ? '' : `<div class="actions"><button class="btn btn-ghost" data-go="7.2">CANCEL</button></div>`}
      </div>`;
    },

    '4.2': () => `
      <div class="scan-frame" aria-hidden="true"><div class="bottle"></div></div>
      <h2>Scanning…</h2>
      <p class="sub" role="status" aria-live="polite">Checking ${esc(S.pendingItem ? S.pendingItem.label : 'the item')} for material and weight.</p>`,

    '4.3': () => {
      const last = S.items[S.items.length - 1];
      return last ? `
      <div class="icon-circle pop" style="--accent:var(--color-ok)">${ICON.check}</div>
      <h1>Item accepted</h1>
      <p class="sub" role="status">${esc(last.label)}</p>
      <div class="big-value">+${fmtPeso(last.value)}</div>
      <div class="chip" role="status">Session total <b>${fmtPeso(S.total)}</b> · ${S.items.length} item${S.items.length === 1 ? '' : 's'}</div>
      <div class="actions"><button class="btn btn-blue" id="btnAcceptedContinue">CONTINUE</button></div>` : `
      <div class="icon-circle pop" style="--accent:var(--color-danger)">${ICON.x}</div>
      <h1>Item details unavailable</h1>
      <p class="sub" role="alert">No accepted item is available for this session. Please try again.</p>
      <div class="actions"><button class="btn btn-blue" data-go="4.1">TRY AGAIN</button></div>`;
    },

    '4.4': () => {
      const m = machine();
      const a = m && DB.machines.availability(m);
      const canRetry = !!a && a.online && !a.binFull;
      return `
      <div class="icon-circle pop" style="--accent:var(--color-danger)">${ICON.x}</div>
      <h1>Item not recognised</h1>
      <p class="sub" role="alert">${esc(S.rejectReason || 'Please take the item from the drawer.')}</p>
      <div class="actions"><button class="btn btn-blue" id="btnRejectContinue">CONTINUE</button><button class="btn btn-outline" data-go="4.1" ${canRetry ? '' : 'disabled'}>${canRetry ? 'TRY AGAIN' : 'RETRY UNAVAILABLE'}</button></div>`;
    },

    '4.5': () => {
      const m = machine();
      const a = m && DB.machines.availability(m);
      const canInsert = !!a && a.online && !a.binFull;
      return `
      <h1>${S.items.length ? 'Add another item?' : 'Try another item?'}</h1>
      <p class="sub" role="${canInsert ? 'status' : 'alert'}">${S.items.length ? `${S.items.length} accepted item${S.items.length === 1 ? '' : 's'} · session total ${fmtPeso(S.total)}.` : 'No valid items have been accepted yet.'}${canInsert ? '' : ' Intake is unavailable on this machine.'}</p>
      <div class="actions">
        <button class="btn btn-lg" data-go="4.1" ${canInsert ? '' : 'disabled'}>YES</button>
        <button class="btn btn-outline btn-lg" id="btnNoMore">${S.items.length ? 'FINISH AND CLAIM' : 'END SESSION'}</button>
      </div>`;
    },

    '5.1': () => {
      const m = machine();
      const config = DB.config.get();
      const level = m ? clamp(Number(m.binLevel) || 0, 0, 100) : 0;
      const online = !!m && m.status === 'online';
      const high = online && DB.machines.availability(m).binHigh;
      return `
      <h2>Bin capacity</h2>
      <div class="panel">
        <div class="bar warn"><i style="width:${level}%"></i></div>
        <div class="muted" role="${online ? 'status' : 'alert'}">${m ? `${esc(m.name)} · bin at ${level}% (crusher threshold ${config.binAlertThreshold}%).` : 'No recycling machine is configured.'}</div>
      </div>
      <p class="sub" role="${online ? 'status' : 'alert'}">${S.crusherError ? esc(S.crusherError) : online ? high ? 'The bin is ready for a crusher cycle.' : 'The bin is below the crusher threshold.' : `Machine ${esc(m ? m.status : 'unavailable')}; the crusher cannot run.`}</p>
      <div class="actions"><button class="btn btn-blue" id="btnCapacityContinue">${online && high ? 'START CRUSHING' : 'CONTINUE TO REWARDS'}</button></div>`;
    },

    '5.2': () => {
      const m = machine();
      const level = m ? clamp(Number(m.binLevel) || 0, 0, 100) : 0;
      return `
      <h2>Crushing</h2>
      <div class="panel" aria-busy="true">
        <div class="bar warn"><i id="crushBar" style="width:0%"></i></div>
        <div class="muted" role="status">${m ? `Compacting the ${level}% bin at ${esc(m.name)}. Please wait.` : 'Machine data is unavailable; the cycle cannot start.'}</div>
      </div>`;
    },

    '5.3': () => {
      const m = machine();
      const a = m && DB.machines.availability(m);
      const canAdd = !!a && a.online && !a.binFull;
      return `
      <h1>What would you like to do?</h1>
      <div class="chip" role="status">Session total <b>${fmtPeso(S.total)}</b> · ${S.items.length} item${S.items.length === 1 ? '' : 's'}</div>
      <p class="sub" role="${S.items.length && a && a.online ? 'status' : 'alert'}">${S.items.length ? a && a.online ? 'Your accepted items are ready for another item or a reward.' : 'The machine is unavailable. You can still review available account rewards.' : 'There are no accepted items to claim yet.'}</p>
      ${S.crusherError ? `<p class="start-status" role="alert">${esc(S.crusherError)}</p>` : ''}
      <div class="actions">
        <button class="btn btn-lg" style="background:var(--color-primary)" data-go="4.1" ${canAdd ? '' : 'disabled'}>ADD MORE</button>
        <button class="btn btn-outline btn-lg" style="border-color:var(--color-primary-strong);color:var(--color-primary-strong)" data-go="6.1" ${S.items.length ? '' : 'disabled'}>CLAIM</button>
      </div>`;
    },

    '6.1': () => {
      const m = machine();
      const a = m ? DB.machines.availability(m) : { online: false, coins: false, wifi: false };
      const c = DB.config.get();
      const user = S.user && DB.users.byId(S.user.id);
      const hasItems = S.items.length > 0 && S.total > 0;
      const hasReward = a.coins || a.wifi || !!user;
      const status = S.rewardError || (!m ? 'No recycling machine is configured.' : !hasItems ? 'No accepted items are available to claim.' : !hasReward ? `No reward is currently available at ${esc(m.name)}.` : !a.coins && !a.wifi ? 'Coin and Wi-Fi payouts are unavailable; account saving is available.' : `Choose a reward for ${esc(m.name)}.`);
      return `
      <h1>Choose your reward</h1>
      <div class="chip" role="status">Session total <b>${fmtPeso(S.total)}</b> · ${S.items.length} item${S.items.length === 1 ? '' : 's'}</div>
      <div class="reward-grid">
        <button class="reward-card" data-reward="coins" ${a.coins && hasItems ? '' : 'disabled'}>${ICON.coins}COINS<small>${a.coins ? fmtPeso(S.total) + ' in coins' : 'Not available'}</small></button>
        <button class="reward-card" data-reward="wifi" ${a.wifi && hasItems ? '' : 'disabled'}>${ICON.wifi}WI-FI<small>${a.wifi ? sessionMinutes() + ' min voucher' : 'Not available'}</small></button>
        <button class="reward-card" data-reward="save" ${user && hasItems ? '' : 'disabled'}>${ICON.save}SAVE<small>${user ? '+' + sessionPoints() + ' pts to account' : 'Log in to save'}</small></button>
      </div>
      <p class="sub ${S.rewardError || !hasItems || !hasReward ? 'start-status' : 'muted'}" role="${S.rewardError || !hasItems || !hasReward ? 'alert' : 'status'}">${esc(status)}</p>
      <p class="sub muted">${c.pointsPerPeso} pts = ₱1 · ${c.wifiMinutesPerPeso} min Wi-Fi = ₱1</p>
      <div class="actions"><button class="btn btn-ghost" data-go="5.3">BACK</button></div>`;
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
    '1.2': (el) => {
      if (machine()?.status !== 'online') return;
      const button = $('#btnContinue', el);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Checking machine…';
        later(350, () => go(machine()?.status === 'online' ? '2.1' : '1.2'));
      });
      later(2500, () => go(machine()?.status === 'online' ? '2.1' : '1.2'));
    },

    '2.2': (el) => {
      if (machine()?.status !== 'online') return;
      S.linkCode = DB.links.create(machineId);
      $('#qrCode', el).textContent = S.linkCode;
      drawQR($('#qr', el), `BOCOFI:${machineId}:${S.linkCode}`);
      const poll = () => {
        if (S.screen !== '2.2' || !S.linkCode) return;
        if (machine()?.status !== 'online') {
          if (S.linkCode) DB.links.cancel(S.linkCode);
          S.linkCode = null;
          go('2.2');
          return;
        }
        const l = DB.links.get(S.linkCode);
        if (l && l.status === 'linked') {
          S.user = DB.users.byId(l.userId);
          if (!S.user) {
            DB.links.cancel(S.linkCode); S.linkCode = null;
            $('#linkStatus', el).textContent = 'That account is no longer available. Go back and try again.';
            $('#qrCode', el).textContent = 'EXPIRED';
            return;
          }
          S.mode = 'user';
          go('2.3');
        } else if (!l || Date.now() - l.createdAt >= 5 * 60 * 1000) {
          if (S.linkCode) DB.links.cancel(S.linkCode);
          S.linkCode = null;
          $('#linkStatus', el).textContent = 'This link code has expired. Go back and choose LOG IN again.';
          $('#qrCode', el).textContent = 'EXPIRED';
        } else later(700, poll);
      };
      later(700, poll);
    },
    '2.3': (el) => {
      if (!S.user) return;
      const button = $('#btnLinkedContinue', el);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Continuing…';
        later(350, () => go('3.1'));
      });
      later(2400, () => go('3.1'));
    },
    '2.4': (el) => {
      S.mode = 'guest';
      if (machine()?.status !== 'online') return;
      const button = $('#btnGuestContinue', el);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Checking rewards…';
        later(350, () => go(machine()?.status === 'online' ? '3.1' : '2.4'));
      });
      later(3500, () => go(machine()?.status === 'online' ? '3.1' : '2.4'));
    },

    '3.1': (el) => {
      if (machine()?.status !== 'online') return;
      const button = $('#btnWifiContinue', el);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Checking…';
        later(300, () => go(machine()?.status === 'online' ? '3.2' : '3.4'));
      });
      later(1800, () => go(machine()?.status === 'online' ? '3.2' : '3.4'));
    },
    '3.2': (el) => {
      if (machine()?.status !== 'online') return;
      const continueCheck = () => {
        const current = machine();
        const available = current && DB.machines.availability(current);
        go(!available || !available.online || available.binFull || (!available.coins && !available.wifi && !S.user) ? '3.4' : '3.3');
      };
      const button = $('#btnCoinsContinue', el);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Checking…';
        later(300, continueCheck);
      });
      later(1800, continueCheck);
    },
    '3.3': (el) => {
      const current = machine();
      const a = current ? DB.machines.availability(current) : { online: false, binFull: true, coins: false, wifi: false };
      if (!S.alerted && a.online && !a.binFull && ((!a.coins && !a.wifi) || !a.coins || !a.wifi)) {
        // flowchart: "Notifies OWNER — user told only COINS / only WIFI VOUCHER can be selected"
        const onlySave = !a.coins && !a.wifi;
        DB.alerts.add(machineId, onlySave ? 'rewards' : !a.coins ? 'coins' : 'wifi', onlySave ? 'critical' : 'warning', onlySave ? S.user ? 'Coins and Wi-Fi are unavailable; logged-in users can still save credits.' : 'No rewards are currently available on this machine.' : !a.coins ? 'Coin hopper low — users are being offered Wi-Fi vouchers only.' : 'Wi-Fi unavailable — users are being offered coins only.');
        S.alerted = true;
      }
      const continueCheck = () => {
        const m = machine();
        const availability = m && DB.machines.availability(m);
        go(!availability || !availability.online || availability.binFull || (!availability.coins && !availability.wifi && !S.user) ? '3.4' : '4.1');
      };
      const button = $('#btnRewardsContinue', el);
      if (button && !button.disabled) button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Checking rewards…';
        later(300, continueCheck);
      });
      later(2600, continueCheck);
    },
    '3.4': (el) => {
      if (!S.alerted && machine()) { DB.alerts.add(machineId, 'rewards', 'critical', 'No rewards available — user was turned away.'); S.alerted = true; }
      const restart = () => { resetSession(); go('1.1'); };
      const restartButton = $('#btnNoRewardRestart', el);
      restartButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        restartButton.disabled = true;
        restartButton.setAttribute('aria-busy', 'true');
        restartButton.textContent = 'Resetting…';
        later(300, restart);
      });
      $('#btnNoRewardOptions', el).addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        resetSession();
        go('2.1');
      });
      later(4000, restart);
    },

    '4.1': (el) => {
      el.querySelectorAll('[data-insert]').forEach((b) => b.addEventListener('click', () => insertItem(b.dataset.insert)));
    },
    '4.2': () => later(1700, () => {
      const pending = S.pendingItem; S.pendingItem = null;
      const m = machine();
      const availability = m && DB.machines.availability(m);
      if (!pending) { S.rejectReason = 'We could not identify this item type.'; go('4.4'); return; }
      if (!availability || !availability.online) { S.rejectReason = 'The machine became unavailable during the scan. Keep the item and try another machine.'; go('4.4'); return; }
      if (availability.binFull) { S.rejectReason = 'The bin became full during the scan. Keep the item and try again later.'; go('4.4'); return; }
      S.items.push(pending); S.total = round2(S.total + pending.value);
      S.rejectReason = null;
      // fill-level sensor: each item adds ~1.5% to the bin
      DB.machines.patch(machineId, { binLevel: clamp(round2(m.binLevel + 1.5), 0, 100) });
      go('4.3');
    }),
    '4.3': (el) => {
      if (!S.items.length) return;
      const next = () => {
        const m = machine();
        const a = m && DB.machines.availability(m);
        go(a && a.binHigh ? '5.1' : '5.3');
      };
      const button = $('#btnAcceptedContinue', el);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Continuing…';
        later(300, next);
      });
      later(2200, next);
    },
    '4.4': (el) => {
      const button = $('#btnRejectContinue', el);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Continuing…';
        later(300, () => go('4.5'));
      });
      later(2600, () => go('4.5'));
    },
    '4.5': (el) => { $('#btnNoMore', el).addEventListener('click', () => go(S.items.length ? '6.1' : '7.2')); },

    '5.1': (el) => {
      const continueCapacity = () => {
        const m = machine();
        const a = m && DB.machines.availability(m);
        go(a && a.online && a.binHigh ? '5.2' : '5.3');
      };
      const button = $('#btnCapacityContinue', el);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Checking bin…';
        later(300, continueCapacity);
      });
      later(2200, continueCapacity);
    },
    '5.2': (el) => {
      const initial = machine();
      const initialAvailability = initial && DB.machines.availability(initial);
      if (!initialAvailability || !initialAvailability.online || !initialAvailability.binHigh) {
        S.crusherError = !initialAvailability || !initialAvailability.online ? 'The crusher could not start because the machine is unavailable. Your accepted items are still in this session.' : 'The bin is below its crusher threshold. Your accepted items are still in this session.';
        go('5.1');
        return;
      }
      const bar = $('#crushBar', el);
      requestAnimationFrame(() => { bar.style.transition = 'width 2.8s linear'; bar.style.width = '100%'; });
      later(3000, () => {
        const m = machine();
        if (!m || m.status !== 'online') {
          S.crusherError = 'The machine became unavailable before the crusher cycle finished. Your accepted items are still in this session.';
          go('5.1');
          return;
        }
        // crusher compacts the contents: fill level drops, owner is notified
        DB.machines.patch(machineId, { binLevel: clamp(Math.round(m.binLevel * 0.55), 0, 100), lastCrush: Date.now() });
        DB.alerts.add(machineId, 'bin', 'warning', `Bin reached ${Math.round(m.binLevel)}% — crusher cycle ran. Schedule a collection soon.`);
        S.crusherError = null;
        toast('Crusher cycle complete');
        go('5.3');
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
    const m = machine();
    const a = m && DB.machines.availability(m);
    if (!a || !a.online || a.binFull) { toast(!a || !a.online ? 'Machine unavailable — cannot scan items' : 'Bin is full — cannot accept more items', 'danger'); go('4.1'); return; }
    const r = DB.config.rewardFor(typeId);
    S.rejectReason = r ? null : 'We could not identify this item type.';
    S.pendingItem = r ? { type: r.id, label: r.label, value: r.value } : null;
    go('4.2');
  }

  function chooseReward(kind) {
    const m = machine(); const c = DB.config.get();
    const a = m && DB.machines.availability(m);
    const user = S.user && DB.users.byId(S.user.id);
    if (!m || !S.items.length || S.total <= 0) {
      S.rewardError = !m ? 'No recycling machine is configured.' : 'There are no accepted items to claim.';
      go('6.1');
      return;
    }
    S.rewardError = null;
    if (kind === 'coins' && !a.coins) S.rewardError = 'Coins are no longer available. Choose another reward.';
    else if (kind === 'wifi' && !a.wifi) S.rewardError = 'Wi-Fi vouchers are no longer available. Choose another reward.';
    else if (kind === 'save' && !user) S.rewardError = 'This account is no longer available. Link an account or choose another reward.';
    else if (!['coins', 'wifi', 'save'].includes(kind)) S.rewardError = 'Choose a reward from the available options.';
    if (S.rewardError) { go('6.1'); return; }
    S.rewardError = null;
    if (user) S.user = user;
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
      const pts = sessionPoints();
      const tx = DB.transactions.add(Object.assign({}, base, { points: pts }));
      S.reward = tx;
      DB.users.addPoints(S.user.id, pts, S.items.length);
      DB.machines.patch(machineId, { totalBottles: m.totalBottles + S.items.length });
      S.user = DB.users.byId(S.user.id); // refresh balance for later screens
      go('6.6');
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
