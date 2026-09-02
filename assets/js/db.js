/* ==========================================================================
   BOCO-FI · shared data layer
   --------------------------------------------------------------------------
   One localStorage document shared by the kiosk, the user app and the admin
   dashboard. Cross-tab sync uses the `storage` event, so all three surfaces
   can be open in separate tabs and react to each other live.

   This stands in for a real backend. Swap the load()/save() functions for
   API calls when a server exists — the rest of the code only talks to the
   helpers exported below.
   ========================================================================== */
(function (global) {
  'use strict';

  const KEY = 'bocofi.db.v1';
  const listeners = new Set();
  let db = null;

  /* ---------- utilities ---------- */
  const uid = (p = '') => p + Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).slice(-3).toUpperCase();
  const now = () => Date.now();
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const round2 = (n) => Math.round(n * 100) / 100;
  const fmtPeso = (n) => '₱' + Number(n || 0).toFixed(2);
  const fmtPts = (n) => Number(n || 0).toLocaleString() + ' pts';
  const fmtDate = (ts) => new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { timeStyle: 'short' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- seed data ---------- */
  function seed() {
    const t = now();
    const h = 3600 * 1000;
    const users = [
      { id: 'U-MARIA', name: 'Maria Santos', email: 'maria@example.com', pin: '1234', points: 850, coins: 12.5, wifiMinutes: 45, wifiSession: null, bottles: 34, notifRead: [], prefs: { notifs: true }, createdAt: t - 40 * 24 * h },
      { id: 'U-JOSE', name: 'Jose Reyes', email: 'jose@example.com', pin: '1234', points: 120, coins: 0, wifiMinutes: 5, wifiSession: null, bottles: 6, notifRead: [], prefs: { notifs: true }, createdAt: t - 12 * 24 * h },
      { id: 'U-ANA', name: 'Ana Dela Cruz', email: 'ana@example.com', pin: '1234', points: 2140, coins: 4, wifiMinutes: 120, wifiSession: null, bottles: 112, notifRead: [], prefs: { notifs: true }, createdAt: t - 90 * 24 * h },
      { id: 'U-LEO', name: 'Leo Bautista', email: 'leo@example.com', pin: '1234', points: 40, coins: 0, wifiMinutes: 0, wifiSession: null, bottles: 2, notifRead: [], prefs: { notifs: true }, createdAt: t - 3 * 24 * h },
    ];
    const machines = [
      { id: 'BCF-001', name: 'Barangay Hall', location: 'Poblacion, Bocaue', status: 'online', binLevel: 42, coinHopper: 68, wifiSignal: 'strong', coinsEnabled: true, wifiEnabled: true, totalBottles: 1284, totalPaidOut: 148.6, lastEmptied: t - 2 * 24 * h, lastRefilled: t - 5 * 24 * h, session: null },
      { id: 'BCF-002', name: 'Campus Gate', location: 'Bulacan State University', status: 'online', binLevel: 81, coinHopper: 22, wifiSignal: 'weak', coinsEnabled: true, wifiEnabled: true, totalBottles: 2093, totalPaidOut: 231.2, lastEmptied: t - 6 * 24 * h, lastRefilled: t - 9 * 24 * h, session: null },
      { id: 'BCF-003', name: 'Public Market', location: 'Bocaue Public Market', status: 'maintenance', binLevel: 97, coinHopper: 0, wifiSignal: 'none', coinsEnabled: true, wifiEnabled: true, totalBottles: 3410, totalPaidOut: 402.9, lastEmptied: t - 10 * 24 * h, lastRefilled: t - 14 * 24 * h, session: null },
    ];
    const transactions = [
      { id: 'TX-SEED1', machineId: 'BCF-001', userId: 'U-MARIA', items: [{ type: 'b500', label: '500 ml bottle', value: 0.10 }, { type: 'can', label: 'Aluminium can', value: 0.25 }], total: 0.35, reward: 'save', points: 35, ts: t - 26 * h },
      { id: 'TX-SEED2', machineId: 'BCF-002', userId: null, items: [{ type: 'sakto', label: 'Sakto bottle', value: 0.05 }, { type: 'sakto', label: 'Sakto bottle', value: 0.05 }, { type: 'b1l', label: '1 L bottle', value: 0.15 }], total: 0.25, reward: 'coins', ts: t - 20 * h },
      { id: 'TX-SEED3', machineId: 'BCF-001', userId: 'U-JOSE', items: [{ type: 'can', label: 'Aluminium can', value: 0.25 }, { type: 'can', label: 'Aluminium can', value: 0.25 }], total: 0.50, reward: 'wifi', voucherCode: 'BC-91A2', minutes: 5, ts: t - 5 * h },
      { id: 'TX-SEED4', machineId: 'BCF-001', userId: 'U-MARIA', items: [{ type: 'b500', label: '500 ml bottle', value: 0.10 }], total: 0.10, reward: 'coins', ts: t - 1.5 * h },
    ];
    const vouchers = [
      { code: 'BC-91A2', minutes: 5, txId: 'TX-SEED3', userId: 'U-JOSE', machineId: 'BCF-001', createdAt: t - 5 * h, expiresAt: t + 19 * h, redeemed: false },
    ];
    const alerts = [
      { id: 'AL-SEED1', machineId: 'BCF-003', type: 'bin', level: 'critical', message: 'Bin at 97% — machine paused until emptied.', ts: t - 8 * h, read: false },
      { id: 'AL-SEED2', machineId: 'BCF-003', type: 'coins', level: 'critical', message: 'Coin hopper empty — only Wi-Fi vouchers can be selected.', ts: t - 8 * h, read: false },
      { id: 'AL-SEED3', machineId: 'BCF-002', type: 'bin', level: 'warning', message: 'Bin reached 80% — crusher cycle ran.', ts: t - 3 * h, read: true },
      { id: 'AL-SEED4', machineId: 'BCF-002', type: 'wifi', level: 'warning', message: 'Wi-Fi signal weak.', ts: t - 1 * h, read: false },
    ];
    return {
      version: 1,
      config: {
        rewardTable: [
          { id: 'sakto', label: 'Sakto bottle', hint: '≤ 350 ml PET', value: 0.05 },
          { id: 'b500', label: '500 ml bottle', hint: 'PET', value: 0.10 },
          { id: 'b1l', label: '1 L bottle', hint: 'PET', value: 0.15 },
          { id: 'b15l', label: '1.5 L bottle', hint: 'PET', value: 0.20 },
          { id: 'can', label: 'Aluminium can', hint: '330 ml', value: 0.25 },
        ],
        pointsPerPeso: 100,          // ₱1.40 → 140 pts (matches wireframe 6.6)
        wifiMinutesPerPeso: 10,      // ₱1.40 → 14 min of Wi-Fi
        binAlertThreshold: 80,       // % — crusher runs, owner notified
        binFullThreshold: 95,        // % — machine refuses new items
        coinLowThreshold: 10,        // % — coins unavailable below this
        voucherTtlHours: 24,
        voucherDisplaySeconds: 30,   // wireframe 6.5 "Disappears in 30 seconds"
        idleTimeoutSeconds: 90,
        adminUser: 'admin',
        adminPass: 'admin123',
        orgName: 'BOCO-FI Recycling Rewards',
      },
      users,
      machines,
      transactions,
      vouchers,
      alerts,
      cashouts: [],   // app cash-out codes redeemed at a kiosk → { code, userId, amount, status, createdAt }
      links: {},        // kiosk QR login codes → { machineId, status, userId, createdAt }
      appSession: null, // user app: logged-in user id
      adminSession: null,
    };
  }

  /* ---------- persistence ---------- */
  /** Fill in fields added after a store was first seeded (safe on every load). */
  function migrate(d) {
    if (!d || typeof d !== 'object') return seed();
    if (!Array.isArray(d.cashouts)) d.cashouts = [];
    (d.users || []).forEach((u) => {
      if (typeof u.coins !== 'number') u.coins = 0;
      if (typeof u.wifiMinutes !== 'number') u.wifiMinutes = 0;
      if (u.wifiSession === undefined) u.wifiSession = null;
      if (!Array.isArray(u.notifRead)) u.notifRead = [];
      if (!u.prefs) u.prefs = { notifs: true };
    });
    return d;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { db = migrate(JSON.parse(raw)); return db; }
    } catch (e) { console.warn('[BocofiDB] corrupt store, reseeding', e); }
    db = seed();
    persist();
    return db;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error('[BocofiDB] save failed', e); }
  }
  function emit(source) { listeners.forEach((fn) => { try { fn(db, source); } catch (e) { console.error(e); } }); }

  function get() { return db || load(); }
  function update(mutator) {
    get();
    mutator(db);
    persist();
    emit('local');
    return db;
  }
  function reset() { db = seed(); persist(); emit('reset'); return db; }

  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  global.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try { db = JSON.parse(e.newValue); } catch { return; }
    emit('remote');
  });

  /* ---------- domain helpers ---------- */
  const users = {
    all: () => get().users,
    byId: (id) => get().users.find((u) => u.id === id) || null,
    byEmail: (email) => get().users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase()) || null,
    register(name, email, pin) {
      if (users.byEmail(email)) throw new Error('An account with that email already exists.');
      const u = { id: uid('U-'), name: name.trim(), email: email.trim().toLowerCase(), pin: String(pin), points: 0, coins: 0, wifiMinutes: 0, wifiSession: null, bottles: 0, notifRead: [], prefs: { notifs: true }, createdAt: now() };
      update((d) => d.users.push(u));
      return u;
    },
    login(email, pin) {
      const u = users.byEmail(email);
      if (!u || u.pin !== String(pin)) throw new Error('Email or PIN is incorrect.');
      update((d) => { d.appSession = u.id; });
      return u;
    },
    logout() { update((d) => { d.appSession = null; }); },
    current() { const d = get(); return d.appSession ? users.byId(d.appSession) : null; },
    addPoints(id, pts, bottles = 0) {
      update((d) => { const u = d.users.find((x) => x.id === id); if (u) { u.points = Math.max(0, Math.round(u.points + pts)); u.bottles = (u.bottles || 0) + bottles; } });
    },
    addCoins(id, pesos) { update((d) => { const u = d.users.find((x) => x.id === id); if (u) u.coins = Math.max(0, round2((u.coins || 0) + pesos)); }); },
    addWifi(id, minutes) { update((d) => { const u = d.users.find((x) => x.id === id); if (u) u.wifiMinutes = Math.max(0, Math.round(((u.wifiMinutes || 0) + minutes) * 100) / 100); }); },
    patch(id, fields) { update((d) => { const u = d.users.find((x) => x.id === id); if (u) Object.assign(u, fields); }); },
    remove(id) { update((d) => { d.users = d.users.filter((x) => x.id !== id); if (d.appSession === id) d.appSession = null; }); },
  };

  const machines = {
    all: () => get().machines,
    byId: (id) => get().machines.find((m) => m.id === id) || null,
    patch(id, fields) { update((d) => { const m = d.machines.find((x) => x.id === id); if (m) Object.assign(m, fields); }); },
    /** availability derived from sensor state + owner toggles */
    availability(m) {
      const c = get().config;
      const online = m.status === 'online';
      return {
        online,
        coins: online && m.coinsEnabled && m.coinHopper >= c.coinLowThreshold,
        wifi: online && m.wifiEnabled && m.wifiSignal !== 'none',
        binFull: m.binLevel >= c.binFullThreshold,
        binHigh: m.binLevel >= c.binAlertThreshold,
      };
    },
    setSession(id, session) { update((d) => { const m = d.machines.find((x) => x.id === id); if (m) m.session = session; }); },
  };

  const transactions = {
    all: () => get().transactions.slice().sort((a, b) => b.ts - a.ts),
    forUser: (userId) => transactions.all().filter((t) => t.userId === userId),
    add(tx) { const rec = Object.assign({ id: uid('TX-'), ts: now() }, tx); update((d) => d.transactions.push(rec)); return rec; },
  };

  const vouchers = {
    all: () => get().vouchers.slice().sort((a, b) => b.createdAt - a.createdAt),
    forUser: (userId) => vouchers.all().filter((v) => v.userId === userId),
    byCode: (code) => get().vouchers.find((v) => v.code === String(code).trim().toUpperCase()) || null,
    create({ minutes, txId = null, userId = null, machineId = null }) {
      const c = get().config;
      const code = 'BC-' + Math.random().toString(16).slice(2, 6).toUpperCase();
      const v = { code, minutes, txId, userId, machineId, createdAt: now(), expiresAt: now() + c.voucherTtlHours * 3600 * 1000, redeemed: false };
      update((d) => d.vouchers.push(v));
      return v;
    },
    redeem(code) { update((d) => { const v = d.vouchers.find((x) => x.code === code); if (v) { v.redeemed = true; v.redeemedAt = now(); } }); },
    status(v) { if (v.redeemed) return 'used'; if (v.expiresAt < now()) return 'expired'; return 'active'; },
  };

  const alerts = {
    all: () => get().alerts.slice().sort((a, b) => b.ts - a.ts),
    unread: () => get().alerts.filter((a) => !a.read).length,
    add(machineId, type, level, message) {
      const a = { id: uid('AL-'), machineId, type, level, message, ts: now(), read: false };
      update((d) => d.alerts.push(a));
      return a;
    },
    markRead(id) { update((d) => { const a = d.alerts.find((x) => x.id === id); if (a) a.read = true; }); },
    markAllRead() { update((d) => d.alerts.forEach((a) => { a.read = true; })); },
    clear() { update((d) => { d.alerts = []; }); },
  };

  /** Cash-out codes: the app locks coin balance behind a code the user shows at a kiosk. */
  const cashouts = {
    all: () => get().cashouts.slice().sort((a, b) => b.createdAt - a.createdAt),
    forUser: (userId) => cashouts.all().filter((c) => c.userId === userId),
    byCode: (code) => get().cashouts.find((c) => c.code === String(code).trim().toUpperCase()) || null,
    create(userId, amount) {
      amount = round2(amount);
      const u = users.byId(userId);
      if (!u || amount <= 0 || amount > (u.coins || 0)) throw new Error('Not enough coin balance.');
      const code = 'CO-' + Math.random().toString(16).slice(2, 6).toUpperCase();
      const c = { code, userId, amount, status: 'pending', createdAt: now(), expiresAt: now() + 24 * 3600 * 1000 };
      update((d) => { const usr = d.users.find((x) => x.id === userId); usr.coins = round2(usr.coins - amount); d.cashouts.push(c); });
      return c;
    },
    cancel(code) { update((d) => { const c = d.cashouts.find((x) => x.code === code); if (c && c.status === 'pending') { c.status = 'cancelled'; const u = d.users.find((x) => x.id === c.userId); if (u) u.coins = round2(u.coins + c.amount); } }); },
    markPaid(code, machineId = null) { update((d) => { const c = d.cashouts.find((x) => x.code === code); if (c && c.status === 'pending') { c.status = 'paid'; c.paidAt = now(); c.machineId = machineId; } }); },
    status(c) { if (c.status !== 'pending') return c.status; if (c.expiresAt < now()) return 'expired'; return 'pending'; },
  };

  /** QR login handshake: kiosk creates a code, the app resolves it. */
  const links = {
    create(machineId) {
      const code = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[O0I1]/g, 'X');
      update((d) => {
        // prune stale codes (older than 5 min)
        Object.keys(d.links).forEach((k) => { if (now() - d.links[k].createdAt > 5 * 60 * 1000) delete d.links[k]; });
        d.links[code] = { machineId, status: 'pending', userId: null, createdAt: now() };
      });
      return code;
    },
    get: (code) => get().links[String(code).trim().toUpperCase()] || null,
    pending: () => Object.entries(get().links).filter(([, l]) => l.status === 'pending').map(([code, l]) => ({ code, ...l })),
    resolve(code, userId) {
      code = String(code).trim().toUpperCase();
      const l = links.get(code);
      if (!l) throw new Error('Code not found. Check the machine screen and try again.');
      if (l.status !== 'pending') throw new Error('That code has already been used.');
      update((d) => { d.links[code].status = 'linked'; d.links[code].userId = userId; d.links[code].linkedAt = now(); });
      return l.machineId;
    },
    cancel(code) { update((d) => { delete d.links[code]; }); },
  };

  const config = {
    get: () => get().config,
    patch(fields) { update((d) => Object.assign(d.config, fields)); },
    rewardFor(typeId) { return get().config.rewardTable.find((r) => r.id === typeId) || null; },
  };

  const admin = {
    login(user, pass) {
      const c = get().config;
      if (user !== c.adminUser || pass !== c.adminPass) throw new Error('Invalid username or password.');
      update((d) => { d.adminSession = { user, at: now() }; });
    },
    logout() { update((d) => { d.adminSession = null; }); },
    current: () => get().adminSession,
  };

  /** Aggregate stats for the owner dashboard */
  function stats() {
    const d = get();
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const today = d.transactions.filter((t) => t.ts >= dayStart.getTime());
    const bottles = (list) => list.reduce((n, t) => n + t.items.length, 0);
    const value = (list) => round2(list.reduce((n, t) => n + t.total, 0));
    return {
      bottlesToday: bottles(today),
      valueToday: value(today),
      bottlesAll: bottles(d.transactions),
      valueAll: value(d.transactions),
      sessionsToday: today.length,
      machinesOnline: d.machines.filter((m) => m.status === 'online').length,
      machinesTotal: d.machines.length,
      unreadAlerts: d.alerts.filter((a) => !a.read).length,
      users: d.users.length,
      activeVouchers: d.vouchers.filter((v) => vouchers.status(v) === 'active').length,
    };
  }

  global.BocofiDB = {
    KEY, get, update, reset, on, load,
    users, machines, transactions, vouchers, alerts, cashouts, links, config, admin, stats,
    util: { uid, now, clamp, round2, fmtPeso, fmtPts, fmtDate, fmtTime, esc },
  };
  load();
})(window);
