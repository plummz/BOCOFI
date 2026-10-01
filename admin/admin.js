(function () {
  'use strict';
  const DB = window.BocofiDB;
  const { esc, fmtPeso, fmtPts, fmtDate, fmtTime, round2, clamp } = DB.util;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const themeColor = $('meta[name="theme-color"]');
  if (themeColor) themeColor.content = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-strong').trim();
  const page = $('#page');
  const filters = { txMachine: '', txReward: '', alerts: 'unread', vStatus: '', cStatus: '' };

  function toast(msg, kind = '') {
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
    $('#toasts').appendChild(el); setTimeout(() => el.remove(), 2800);
  }
  const wifiLabel = (s) => ({ strong: 'Strong', weak: 'Weak', none: 'No signal' }[s] || s);
  const wifiKind = (s) => ({ strong: 'ok', weak: 'warn', none: 'danger' }[s] || '');
  const statusKind = (s) => ({ online: 'ok', offline: 'danger', maintenance: 'warn' }[s] || '');
  const levelKind = (v, warn, danger) => (v >= danger ? 'danger' : v >= warn ? 'warn' : '');
  const alertTile = (t) => ({ bin: ['var(--c-storage)', '🗑'], coins: ['var(--c-check)', '🪙'], wifi: ['var(--blue-700)', '📶'], rewards: ['var(--danger)', '⚠'] }[t] || ['var(--ink-3)', '•']);
  const userName = (id) => { const u = id && DB.users.byId(id); return u ? u.name : 'Guest'; };
  const machineName = (id) => { const m = id && DB.machines.byId(id); return m ? m.name : 'In app'; };

  function gate() {
    const ok = !!DB.admin.current();
    $('#login').hidden = ok; $('#shell').hidden = !ok;
    if (ok) { $('#whoami').textContent = DB.admin.current().user; route(); }
  }
  $('#formLogin').onsubmit = (e) => {
    e.preventDefault();
    try { DB.admin.login($('#lUser').value.trim(), $('#lPass').value); gate(); } catch (ex) { $('#loginErr').textContent = ex.message; }
  };
  $('#btnLogout').onclick = () => { DB.admin.logout(); gate(); };

  function route() {
    const [name, arg] = (location.hash.replace('#', '') || 'dashboard').split('/');
    const view = VIEWS[name] ? name : 'dashboard';
    $$('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.route === view));
    $('#pageTitle').textContent = TITLES[view];
    page.innerHTML = VIEWS[view](arg);
    if (AFTER[view]) AFTER[view](arg);
    const n = DB.alerts.unread(); const pill = $('#navAlertCount'); pill.hidden = n === 0; pill.textContent = n;
    closeSide();
  }
  window.addEventListener('hashchange', route);
  const TITLES = { dashboard: 'Dashboard', machines: 'Machines', alerts: 'Owner alerts', transactions: 'Transactions', users: 'Users', vouchers: 'Wi-Fi vouchers', cashouts: 'Cash-out codes', settings: 'Settings' };

  function openSide() { $('#side').classList.add('open'); $('#scrim').hidden = false; }
  function closeSide() { $('#side').classList.remove('open'); $('#scrim').hidden = true; }
  $('#btnSide').onclick = openSide; $('#scrim').onclick = closeSide;

  function machineGauges(m) {
    const c = DB.config.get();
    return `
      <div class="gauge"><span>Bin fill</span><div class="bar ${levelKind(m.binLevel, c.binAlertThreshold, c.binFullThreshold)}"><i style="width:${m.binLevel}%"></i></div><span class="v">${Math.round(m.binLevel)}%</span></div>
      <div class="gauge"><span>Coin hopper</span><div class="bar ${m.coinHopper < c.coinLowThreshold ? 'danger' : m.coinHopper < 30 ? 'warn' : ''}"><i style="width:${m.coinHopper}%"></i></div><span class="v">${Math.round(m.coinHopper)}%</span></div>
      <div class="gauge"><span>Wi-Fi</span><div class="bar blue ${wifiKind(m.wifiSignal) === 'danger' ? 'danger' : ''}"><i style="width:${{ strong: 100, weak: 45, none: 0 }[m.wifiSignal] || 0}%"></i></div><span class="v">${wifiLabel(m.wifiSignal)}</span></div>`;
  }
  function availChips(m) {
    const a = DB.machines.availability(m);
    return `<div class="chips">
      <span class="badge ${statusKind(m.status)}">${esc(m.status)}</span>
      <span class="badge ${a.coins ? 'ok' : 'danger'}">coins ${a.coins ? 'available' : 'unavailable'}</span>
      <span class="badge ${a.wifi ? 'ok' : 'danger'}">wi-fi ${a.wifi ? 'available' : 'unavailable'}</span>
      ${a.binFull ? '<span class="badge danger">bin full</span>' : a.binHigh ? '<span class="badge warn">crusher armed</span>' : ''}
      ${m.session ? `<span class="badge info">in session · ${esc(m.session.screen)}</span>` : ''}
    </div>`;
  }
  function machineCard(m) {
    return `<div class="mcard" data-machine="${esc(m.id)}" role="link" tabindex="0">
      <div class="head"><div><b>${esc(m.name)}</b><div class="id">${esc(m.id)} · ${esc(m.location)}</div></div><span class="badge ${statusKind(m.status)}">${esc(m.status)}</span></div>
      ${machineGauges(m)}
      ${availChips(m)}
    </div>`;
  }
  function alertRow(a) {
    const [color, glyph] = alertTile(a.type);
    return `<div class="alert ${a.read ? '' : 'unread'}">
      <div class="tile" style="background:${color}">${glyph}</div>
      <div class="body"><b>${esc(a.message)}</b><small>${esc(machineName(a.machineId))} · ${esc(a.machineId || '')} · ${fmtDate(a.ts)} · <span class="badge ${a.level === 'critical' ? 'danger' : 'warn'}">${esc(a.level)}</span></small></div>
      ${a.read ? '' : `<button class="btn btn-ghost btn-sm" data-read="${esc(a.id)}">Mark read</button>`}
    </div>`;
  }
  function txRows(list) {
    return list.map((t) => `<tr>
      <td class="mono">${esc(t.id)}</td><td>${fmtDate(t.ts)}</td><td>${esc(machineName(t.machineId))}</td><td>${esc(userName(t.userId))}</td>
      <td class="num">${(t.items || []).length}</td><td class="num">${fmtPeso(t.total || 0)}</td>
      <td><span class="badge ${{ coins: 'warn', wifi: 'info', save: 'ok', cashout: 'warn', 'convert-coins': 'warn', 'convert-wifi': 'info', 'cashout-cancel': 'ok', 'wifi-use': 'info', 'voucher-add': 'info', bundle: 'ok', adjust: '' }[t.reward] || ''}">${esc(t.reward)}</span></td>
      <td>${t.reward === 'wifi' ? `<span class="mono">${esc(t.voucherCode || '')}</span> · ${t.minutes || ''} min` : t.reward === 'save' || t.reward === 'adjust' ? `${Number(t.points) > 0 ? '+' : ''}${fmtPts(t.points || 0)} pts${t.note ? ` · ${esc(t.note)}` : ''}` : t.reward === 'cashout' || t.reward === 'cashout-cancel' ? `${fmtPeso(t.total || 0)} · <span class="mono">${esc(t.code || '')}</span>` : t.reward === 'convert-coins' ? `${fmtPeso(t.total || 0)} coins · ${fmtPts(Math.abs(t.points || 0))} pts` : t.reward === 'convert-wifi' ? `${t.minutes || 0} min · ${fmtPts(Math.abs(t.points || 0))} pts` : t.reward === 'wifi-use' || t.reward === 'voucher-add' ? `${t.minutes || 0} min${t.voucherCode ? ` · <span class="mono">${esc(t.voucherCode)}</span>` : ''}` : t.reward === 'bundle' ? `${esc(t.label || 'Reward bundle')} · ${fmtPts(Math.abs(t.points || 0))} pts` : '—'}</td>
    </tr>`).join('');
  }

  const VIEWS = {
    dashboard() {
      const s = DB.stats();
      const ms = DB.machines.all();
      const alerts = DB.alerts.all().slice(0, 5);
      const tx = DB.transactions.all().slice(0, 6);
      const days = []; const dayMs = 86400000; const today = new Date(); today.setHours(0, 0, 0, 0);
      for (let i = 6; i >= 0; i--) {
        const start = today.getTime() - i * dayMs, end = start + dayMs;
        const n = DB.transactions.all().filter((t) => t.ts >= start && t.ts < end).reduce((a, t) => a + t.items.length, 0);
        days.push({ label: new Date(start).toLocaleDateString([], { weekday: 'short' }), n });
      }
      const max = Math.max(1, ...days.map((d) => d.n));
      return `
      <div class="kpis">
        <div class="kpi" style="--accent:var(--c-startup)"><small>Items today</small><b>${s.bottlesToday}</b><span class="sub">${s.sessionsToday} session${s.sessionsToday === 1 ? '' : 's'}</span></div>
        <div class="kpi" style="--accent:var(--c-check)"><small>Value today</small><b>${fmtPeso(s.valueToday)}</b><span class="sub">${fmtPeso(s.valueAll)} all-time</span></div>
        <div class="kpi" style="--accent:var(--c-deposit)"><small>Machines online</small><b>${s.machinesOnline}/${s.machinesTotal}</b><span class="sub">${s.bottlesAll.toLocaleString()} items all-time</span></div>
        <div class="kpi" style="--accent:var(--c-close)"><small>Unread alerts</small><b>${s.unreadAlerts}</b><span class="sub"><a href="#alerts">View alerts</a></span></div>
        <div class="kpi" style="--accent:var(--c-identify)"><small>Registered users</small><b>${s.users}</b><span class="sub">${s.activeVouchers} active voucher${s.activeVouchers === 1 ? '' : 's'}</span></div>
      </div>
      <div class="two">
        <div class="stack">
          <div class="card"><div class="card-title"><h3>Items recycled · last 7 days</h3></div>
            <div class="chart">${days.map((d) => `<div class="col"><b>${d.n}</b><i style="height:${Math.round(d.n / max * 100)}%"></i><small>${d.label}</small></div>`).join('')}</div>
          </div>
          <div class="card"><div class="card-title"><h3>Machines</h3><a href="#machines">Manage</a></div><div class="mgrid">${ms.map(machineCard).join('')}</div></div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-title"><h3>Latest alerts</h3><a href="#alerts">All</a></div>${alerts.length ? alerts.map(alertRow).join('') : '<p class="muted">No alerts.</p>'}</div>
          <div class="card"><div class="card-title"><h3>Recent transactions</h3><a href="#transactions">All</a></div>
            <div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Machine</th><th>User</th><th class="num">₱</th><th>Reward</th></tr></thead>
            <tbody>${tx.map((t) => `<tr><td>${fmtTime(t.ts)}</td><td>${esc(machineName(t.machineId))}</td><td>${esc(userName(t.userId))}</td><td class="num">${fmtPeso(t.total)}</td><td><span class="badge">${esc(t.reward)}</span></td></tr>`).join('')}</tbody></table></div>
          </div>
        </div>
      </div>`;
    },

    machines(id) {
      if (id) { const m = DB.machines.byId(id); if (m) return machineDetail(m); }
      return `<div class="mgrid">${DB.machines.all().map(machineCard).join('')}</div>`;
    },

    alerts() {
      const all = DB.alerts.all();
      const list = filters.alerts === 'unread' ? all.filter((a) => !a.read) : all;
      return `
      <div class="filters">
        <select class="select" id="fAlerts"><option value="unread" ${filters.alerts === 'unread' ? 'selected' : ''}>Unread only</option><option value="all" ${filters.alerts === 'all' ? 'selected' : ''}>All alerts</option></select>
        <span class="spacer"></span>
        <button class="btn btn-outline btn-sm" id="btnReadAll">Mark all read</button>
        <button class="btn btn-ghost btn-sm" id="btnClearAlerts">Clear all</button>
      </div>
      <div class="card">${list.length ? list.map(alertRow).join('') : '<p class="muted">Nothing here — all machines are behaving.</p>'}</div>
      <p class="help mt">Alerts are raised by the machines themselves (flowchart: "Notifies OWNER") when rewards become unavailable, when the bin reaches the crusher threshold, and when a user is turned away.</p>`;
    },

    transactions() {
      let list = DB.transactions.all();
      if (filters.txMachine) list = list.filter((t) => (t.machineId || 'app') === filters.txMachine);
      if (filters.txReward) list = list.filter((t) => t.reward === filters.txReward);
      const total = round2(list.reduce((n, t) => n + t.total, 0));
      const items = list.reduce((n, t) => n + (t.items || []).length, 0);
      return `
      <div class="filters">
        <select class="select" id="fTxMachine"><option value="">All machines</option>${DB.machines.all().map((m) => `<option value="${esc(m.id)}" ${filters.txMachine === m.id ? 'selected' : ''}>${esc(m.id)} · ${esc(m.name)}</option>`).join('')}<option value="app" ${filters.txMachine === 'app' ? 'selected' : ''}>In app</option></select>
        <select class="select" id="fTxReward"><option value="">All rewards</option>${Array.from(new Set(DB.transactions.all().map((t) => t.reward))).sort().map((r) => `<option value="${esc(r)}" ${filters.txReward === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <span class="spacer"></span>
        <span class="muted">${list.length} transactions · ${items} items · ${fmtPeso(total)}</span>
        <button class="btn btn-outline btn-sm" id="btnCsv">Export CSV</button>
      </div>
      <div class="card table-wrap"><table class="table"><thead><tr><th>ID</th><th>Time</th><th>Machine</th><th>User</th><th class="num">Items</th><th class="num">Value</th><th>Reward</th><th>Detail</th></tr></thead><tbody>${txRows(list) || '<tr><td colspan="8" class="muted">No transactions match.</td></tr>'}</tbody></table></div>`;
    },

    users() {
      const us = DB.users.all().slice().sort((a, b) => b.points - a.points);
      return `
      <div class="card table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th class="num">Points</th><th class="num">Items</th><th>Joined</th><th>Actions</th></tr></thead>
      <tbody>${us.map((u) => `<tr>
        <td><b>${esc(u.name)}</b><br><small class="mono muted">${esc(u.id)}</small></td><td>${esc(u.email)}</td><td class="num">${u.points.toLocaleString()}</td><td class="num">${u.bottles || 0}</td><td>${fmtDate(u.createdAt)}</td>
        <td class="row"><button class="btn btn-outline btn-sm" data-adjust="${esc(u.id)}">Adjust pts</button><button class="btn btn-ghost btn-sm" data-resetpin="${esc(u.id)}">Reset PIN</button><button class="btn btn-danger btn-sm" data-del="${esc(u.id)}">Delete</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">No users yet.</td></tr>'}</tbody></table></div>`;
    },

    vouchers() {
      let vs = DB.vouchers.all();
      if (filters.vStatus) vs = vs.filter((v) => DB.vouchers.status(v) === filters.vStatus);
      return `
      <div class="filters">
        <select class="select" id="fVStatus"><option value="">All statuses</option>${['active', 'used', 'expired', 'revoked'].map((s) => `<option value="${s}" ${filters.vStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <span class="spacer"></span><span class="muted">${vs.length} vouchers</span>
      </div>
      <div class="card table-wrap"><table class="table"><thead><tr><th>Code</th><th class="num">Minutes</th><th>User</th><th>Source</th><th>Created</th><th>Expires</th><th>Status</th><th></th></tr></thead>
      <tbody>${vs.map((v) => { const st = DB.vouchers.status(v); return `<tr>
        <td class="mono"><b>${esc(v.code)}</b></td><td class="num">${v.minutes}</td><td>${esc(userName(v.userId))}</td><td>${esc(machineName(v.machineId))}</td><td>${fmtDate(v.createdAt)}</td><td>${fmtDate(v.expiresAt)}</td>
        <td><span class="badge ${{ active: 'ok', used: '', expired: 'danger', revoked: 'danger' }[st]}">${st}</span></td>
        <td>${st === 'active' ? `<button class="btn btn-ghost btn-sm" data-revoke="${esc(v.code)}">Revoke</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">No vouchers.</td></tr>'}</tbody></table></div>`;
    },

    cashouts() {
      let codes = DB.cashouts.all();
      if (filters.cStatus) codes = codes.filter((c) => DB.cashouts.status(c) === filters.cStatus);
      const pending = DB.cashouts.all().filter((c) => DB.cashouts.status(c) === 'pending').length;
      return `
      <div class="filters"><select class="select" id="fCashoutStatus"><option value="">All statuses</option>${['pending', 'paid', 'expired', 'cancelled'].map((s) => `<option value="${s}" ${filters.cStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select><span class="spacer"></span><span class="muted">${codes.length} codes · ${pending} pending · ${fmtPeso(DB.cashouts.all().filter((c) => DB.cashouts.status(c) === 'pending').reduce((n, c) => n + c.amount, 0))} awaiting payout</span></div>
      <div class="card table-wrap"><table class="table"><thead><tr><th>Code</th><th>User</th><th class="num">Amount</th><th>Issued</th><th>Expires</th><th>Redeemed at</th><th>Status</th></tr></thead><tbody>${codes.map((c) => { const s = DB.cashouts.status(c); return `<tr><td class="mono"><b>${esc(c.code)}</b></td><td>${esc(userName(c.userId))}</td><td class="num">${fmtPeso(c.amount)}</td><td>${fmtDate(c.createdAt)}</td><td>${fmtDate(c.expiresAt)}</td><td>${c.status === 'paid' ? `${esc(machineName(c.machineId))}${c.paidAt ? ` · ${fmtDate(c.paidAt)}` : ''}` : '—'}</td><td><span class="badge ${{ pending: 'warn', paid: 'ok', expired: 'danger', cancelled: '' }[s] || ''}">${esc(s)}</span></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">No cash-out codes match this status.</td></tr>'}</tbody></table></div>`;
    },

    settings() {
      const c = DB.config.get();
      return `
      <div class="settings-grid">
        <form class="card" id="formRewards">
          <div class="card-title"><h3>Reward table</h3><button type="button" class="btn btn-outline btn-sm" id="btnAddRow">+ Add item type</button></div>
          <p class="help">Weight-based reward per accepted item (flowchart: Sakto ₱0.05, 500 ml ₱0.10, aluminium can ₱0.20–0.30). The kiosk simulator lists these types.</p>
          <div class="reward-rows" id="rewardRows">${c.rewardTable.map(rewardRow).join('')}</div>
          <button class="btn btn-block mt" type="submit">Save reward table</button>
        </form>
        <div class="stack">
          <form class="card" id="formRates">
            <h3>Rates &amp; thresholds</h3>
            <div class="grid grid-2">
              <div class="field"><label>Points per ₱1</label><input class="input" name="pointsPerPeso" type="number" min="1" step="1" value="${c.pointsPerPeso}"></div>
              <div class="field"><label>Wi-Fi minutes per ₱1</label><input class="input" name="wifiMinutesPerPeso" type="number" min="1" step="1" value="${c.wifiMinutesPerPeso}"></div>
              <div class="field"><label>Bin crusher threshold %</label><input class="input" name="binAlertThreshold" type="number" min="10" max="100" value="${c.binAlertThreshold}"></div>
              <div class="field"><label>Bin full threshold %</label><input class="input" name="binFullThreshold" type="number" min="10" max="100" value="${c.binFullThreshold}"></div>
              <div class="field"><label>Coins unavailable below %</label><input class="input" name="coinLowThreshold" type="number" min="0" max="100" value="${c.coinLowThreshold}"></div>
              <div class="field"><label>Voucher validity (hours)</label><input class="input" name="voucherTtlHours" type="number" min="1" value="${c.voucherTtlHours}"></div>
              <div class="field"><label>Voucher on-screen seconds</label><input class="input" name="voucherDisplaySeconds" type="number" min="5" value="${c.voucherDisplaySeconds}"></div>
              <div class="field"><label>Kiosk idle timeout (s)</label><input class="input" name="idleTimeoutSeconds" type="number" min="15" value="${c.idleTimeoutSeconds}"></div>
            </div>
            <button class="btn btn-block" type="submit">Save rates</button>
          </form>
          <form class="card" id="formAdmin">
            <h3>Owner account</h3>
            <div class="field"><label>Organisation name</label><input class="input" name="orgName" value="${esc(c.orgName)}"></div>
            <div class="field"><label>Username</label><input class="input" name="adminUser" value="${esc(c.adminUser)}" autocomplete="username"></div>
            <div class="field"><label>New password <small class="muted">(blank to keep)</small></label><input class="input" name="adminPass" type="password" autocomplete="new-password"></div>
            <button class="btn btn-block" type="submit">Save account</button>
          </form>
          <div class="card danger-zone">
            <h3>Demo data</h3>
            <p class="help">Reset the shared store to the seeded demo data (machines, users, transactions). This also signs you out.</p>
            <button class="btn btn-danger" id="btnReset">Reset all data</button>
          </div>
        </div>
      </div>`;
    },
  };

  function rewardRow(r = { id: '', label: '', hint: '', value: 0.1 }) {
    return `<div class="reward-row" data-id="${esc(r.id)}">
      <input class="input" placeholder="Label (e.g. 500 ml bottle)" value="${esc(r.label)}" data-f="label" required>
      <input class="input" placeholder="Hint (e.g. PET)" value="${esc(r.hint)}" data-f="hint">
      <input class="input" type="number" step="0.01" min="0" value="${r.value}" data-f="value" required>
      <button type="button" class="del" aria-label="Remove">✕</button>
    </div>`;
  }

  function machineDetail(m) {
    const a = DB.machines.availability(m);
    const tx = DB.transactions.all().filter((t) => t.machineId === m.id).slice(0, 8);
    const alerts = DB.alerts.all().filter((x) => x.machineId === m.id).slice(0, 5);
    return `
    <div class="detail-head">
      <a class="btn btn-ghost btn-sm" href="#machines">← All machines</a>
      <h2>${esc(m.name)}</h2><span class="mono muted">${esc(m.id)} · ${esc(m.location)}</span>
      <span class="spacer" style="flex:1"></span>
      <a class="btn btn-outline btn-sm" href="../kiosk/index.html?machine=${encodeURIComponent(m.id)}" target="_blank" rel="noopener">Open this kiosk ↗</a>
    </div>
    <div class="two">
      <div class="stack">
        <div class="card">
          <div class="card-title"><h3>Status</h3>${availChips(m)}</div>
          ${machineGauges(m)}
          <div class="row wrap mt muted" style="font-size:var(--text-size-08)">
            <span>${m.totalBottles.toLocaleString()} items lifetime</span><span>·</span><span>${fmtPeso(m.totalPaidOut)} paid out</span><span>·</span>
            <span>Emptied ${fmtDate(m.lastEmptied)}</span><span>·</span><span>Coins refilled ${fmtDate(m.lastRefilled)}</span>${m.lastCrush ? `<span>·</span><span>Crusher ran ${fmtDate(m.lastCrush)}</span>` : ''}
          </div>
        </div>
        ${m.session ? `<div class="card live-session"><div class="card-title"><h3>Live session</h3><span class="badge info">${esc(m.session.screen)} · ${esc(m.session.title)}</span></div>
          <p class="muted" style="margin:var(--space-value-0)">${m.session.userName ? esc(m.session.userName) : m.session.mode === 'guest' ? 'Guest' : 'Not identified yet'} · ${m.session.items} item${m.session.items === 1 ? '' : 's'} · ${fmtPeso(m.session.total)} · updated ${fmtTime(m.session.updatedAt)}</p></div>` : ''}
        <div class="card"><div class="card-title"><h3>Recent transactions</h3></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>ID</th><th>Time</th><th>Machine</th><th>User</th><th class="num">Items</th><th class="num">Value</th><th>Reward</th><th>Detail</th></tr></thead><tbody>${txRows(tx) || '<tr><td colspan="8" class="muted">No transactions yet.</td></tr>'}</tbody></table></div></div>
        <div class="card"><div class="card-title"><h3>Alerts from this machine</h3></div>${alerts.length ? alerts.map(alertRow).join('') : '<p class="muted">None.</p>'}</div>
      </div>
      <div class="stack">
        <div class="card controls" id="controls" data-machine="${esc(m.id)}">
          <h3>Controls &amp; sensor simulator</h3>
          <div class="field"><label>Machine status</label><select class="select" data-c="status">${['online', 'maintenance', 'offline'].map((s) => `<option value="${s}" ${m.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Bin fill level · <output data-o="binLevel">${Math.round(m.binLevel)}%</output></label><input type="range" min="0" max="100" value="${m.binLevel}" data-c="binLevel"></div>
          <div class="field"><label>Coin hopper · <output data-o="coinHopper">${Math.round(m.coinHopper)}%</output></label><input type="range" min="0" max="100" value="${m.coinHopper}" data-c="coinHopper"></div>
          <div class="field"><label>Wi-Fi signal</label><select class="select" data-c="wifiSignal">${['strong', 'weak', 'none'].map((s) => `<option value="${s}" ${m.wifiSignal === s ? 'selected' : ''}>${wifiLabel(s)}</option>`).join('')}</select></div>
          <div class="toggle"><span>Offer coins</span><label class="switch"><input type="checkbox" data-c="coinsEnabled" ${m.coinsEnabled ? 'checked' : ''}><span></span></label></div>
          <div class="toggle"><span>Offer Wi-Fi vouchers</span><label class="switch"><input type="checkbox" data-c="wifiEnabled" ${m.wifiEnabled ? 'checked' : ''}><span></span></label></div>
          <h4 class="mt">Maintenance actions</h4>
          <div class="actions-row">
            <button class="btn btn-outline btn-sm" data-act="empty">Empty bin</button>
            <button class="btn btn-outline btn-sm" data-act="refill">Refill coins</button>
            <button class="btn btn-outline btn-sm" data-act="crush">Run crusher</button>
            <button class="btn btn-ghost btn-sm" data-act="endsession" ${m.session ? '' : 'disabled'}>Clear session</button>
          </div>
          <p class="help mt">Availability shown to users right now: coins <b>${a.coins ? 'yes' : 'no'}</b>, Wi-Fi <b>${a.wifi ? 'yes' : 'no'}</b>. The kiosk picks these up live.</p>
        </div>
      </div>
    </div>`;
  }

  const AFTER = {
    dashboard() { bindMachineCards(); bindAlertButtons(); },
    machines(id) {
      if (!id) { bindMachineCards(); return; }
      const box = $('#controls'); if (!box) return;
      const mid = box.dataset.machine;
      box.addEventListener('input', (e) => {
        const el = e.target; const key = el.dataset.c; if (!key) return;
        let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
        DB.machines.patch(mid, { [key]: v });
        const out = box.querySelector(`[data-o="${key}"]`); if (out) out.textContent = Math.round(v) + '%';
        if (el.type !== 'range') route();
      });
      box.addEventListener('change', (e) => { if (e.target.type === 'range') route(); });
      box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
        const m = DB.machines.byId(mid);
        switch (b.dataset.act) {
          case 'empty': DB.machines.patch(mid, { binLevel: 0, lastEmptied: Date.now() }); DB.alerts.add(mid, 'bin', 'warning', 'Bin emptied by owner.'); toast('Bin emptied', 'ok'); break;
          case 'refill': DB.machines.patch(mid, { coinHopper: 100, lastRefilled: Date.now() }); toast('Coin hopper refilled', 'ok'); break;
          case 'crush': DB.machines.patch(mid, { binLevel: clamp(Math.round(m.binLevel * 0.55), 0, 100), lastCrush: Date.now() }); toast('Crusher cycle complete'); break;
          case 'endsession': DB.machines.setSession(mid, null); toast('Session cleared'); break;
        }
        route();
      }));
      bindAlertButtons();
    },
    alerts() {
      $('#fAlerts').onchange = (e) => { filters.alerts = e.target.value; route(); };
      $('#btnReadAll').onclick = () => { DB.alerts.markAllRead(); route(); };
      $('#btnClearAlerts').onclick = () => { if (confirm('Delete all alerts?')) { DB.alerts.clear(); route(); } };
      bindAlertButtons();
    },
    transactions() {
      $('#fTxMachine').onchange = (e) => { filters.txMachine = e.target.value; route(); };
      $('#fTxReward').onchange = (e) => { filters.txReward = e.target.value; route(); };
      $('#btnCsv').onclick = () => {
        let list = DB.transactions.all();
        if (filters.txMachine) list = list.filter((t) => (t.machineId || 'app') === filters.txMachine);
        if (filters.txReward) list = list.filter((t) => t.reward === filters.txReward);
        const rows = [['id', 'timestamp', 'machine', 'user', 'items', 'value_php', 'reward', 'points', 'minutes', 'voucher']]
          .concat(list.map((t) => [t.id, new Date(t.ts).toISOString(), t.machineId || 'app', userName(t.userId), (t.items || []).length, Number(t.total || 0).toFixed(2), t.reward, t.points || '', t.minutes || '', t.voucherCode || t.code || '']));
        const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `bocofi-transactions-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
      };
    },
    users() {
      $$('[data-adjust]').forEach((b) => b.onclick = () => {
        const u = DB.users.byId(b.dataset.adjust); const v = prompt(`Adjust points for ${u.name} (current ${u.points}). Enter + or − amount:`, '100');
        if (v === null) return; const n = Number(v); if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) { toast('Enter a non-zero whole number of points', 'danger'); return; }
        const before = u.points; DB.users.addPoints(u.id, n); const latest = DB.users.byId(u.id); const applied = latest.points - before;
        if (!applied) { toast('Points were not changed', 'danger'); return; }
        DB.transactions.add({ machineId: null, userId: u.id, items: [], total: 0, reward: 'adjust', points: applied, note: 'Owner adjustment' }); toast(`${fmtPts(Math.abs(applied))} points ${applied > 0 ? 'added' : 'removed'}`, 'ok'); route();
      });
      $$('[data-resetpin]').forEach((b) => b.onclick = () => { DB.users.patch(b.dataset.resetpin, { pin: '0000' }); toast('PIN reset to 0000', 'ok'); });
      $$('[data-del]').forEach((b) => b.onclick = () => { const u = DB.users.byId(b.dataset.del); if (confirm(`Delete ${u.name}? Their history is kept but unlinked.`)) { DB.users.remove(u.id); route(); } });
    },
    vouchers() {
      $('#fVStatus').onchange = (e) => { filters.vStatus = e.target.value; route(); };
      $$('[data-revoke]').forEach((b) => b.onclick = () => { DB.vouchers.revoke(b.dataset.revoke); toast('Voucher revoked', 'ok'); route(); });
    },
    cashouts() { $('#fCashoutStatus').onchange = (e) => { filters.cStatus = e.target.value; route(); }; },
    settings() {
      $('#btnAddRow').onclick = () => { $('#rewardRows').insertAdjacentHTML('beforeend', rewardRow()); };
      $('#rewardRows').addEventListener('click', (e) => { if (e.target.classList.contains('del')) e.target.closest('.reward-row').remove(); });
      $('#formRewards').onsubmit = (e) => {
        e.preventDefault();
        const rows = $$('#rewardRows .reward-row').map((r) => {
          const get = (f) => r.querySelector(`[data-f="${f}"]`).value.trim();
          const label = get('label'); const id = r.dataset.id || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || DB.util.uid('t-').toLowerCase();
          return { id, label, hint: get('hint'), value: round2(Number(get('value'))) };
        }).filter((r) => r.label && r.value >= 0);
        if (!rows.length) { toast('Keep at least one item type', 'danger'); return; }
        DB.config.patch({ rewardTable: rows }); toast('Reward table saved', 'ok'); route();
      };
      $('#formRates').onsubmit = (e) => {
        e.preventDefault(); const f = new FormData(e.target); const patch = {};
        for (const [k, v] of f.entries()) { const n = Number(v); if (!Number.isFinite(n) || n < 0) { toast(`Invalid value for ${k}`, 'danger'); return; } patch[k] = n; }
        if (patch.binAlertThreshold > patch.binFullThreshold) { toast('Crusher threshold must be ≤ full threshold', 'danger'); return; }
        DB.config.patch(patch); toast('Rates saved', 'ok');
      };
      $('#formAdmin').onsubmit = (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        const patch = { orgName: f.get('orgName').trim(), adminUser: f.get('adminUser').trim() };
        if (!patch.adminUser) { toast('Username required', 'danger'); return; }
        const pass = f.get('adminPass'); if (pass) { if (pass.length < 6) { toast('Password must be 6+ characters', 'danger'); return; } patch.adminPass = pass; }
        DB.config.patch(patch); $('#whoami').textContent = patch.adminUser; toast('Account saved', 'ok');
      };
      $('#btnReset').onclick = () => { if (confirm('Reset ALL data to the demo seed? This cannot be undone.')) { DB.reset(); gate(); } };
    },
  };

  function bindMachineCards() {
    $$('[data-machine].mcard').forEach((c) => {
      const open = () => { location.hash = '#machines/' + c.dataset.machine; };
      c.addEventListener('click', open);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }
  function bindAlertButtons() {
    $$('[data-read]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); DB.alerts.markRead(b.dataset.read); route(); });
  }

  DB.on((d, source) => {
    if (source !== 'remote' || !DB.admin.current()) return;
    const ae = document.activeElement; if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) return;
    route();
  });

  gate();
  void fmtPts;
})();
