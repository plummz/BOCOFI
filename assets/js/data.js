// BOCO-FI shared data
// All three parts (kiosk, app, admin) read and write the same data in localStorage.
// This is only for the prototype. Later this will be replaced with a real database.

var DATA_KEY = 'bocofi_data_v2';

function getDefaultData() {
  var now = Date.now();
  var hour = 60 * 60 * 1000;
  var day = 24 * hour;

  return {
    settings: {
      pointsPerPeso: 100,      // 1 peso = 100 points
      wifiMinutesPerPeso: 10,  // 1 peso = 10 minutes of wifi
      binCrushLevel: 80,       // crusher runs when bin reaches 80%
      binFullLevel: 95,        // machine stops accepting items at 95%
      coinLowLevel: 10,        // no coin payout if hopper is below 10%
      voucherHours: 24,
      cashoutHours: 24,
      adminUser: 'admin',
      adminPass: 'admin123'
    },

    // reward per item
    items: [
      { id: 'sakto', name: 'Sakto bottle', value: 0.05 },
      { id: 'b500', name: '500 ml bottle', value: 0.10 },
      { id: 'b1l', name: '1 L bottle', value: 0.15 },
      { id: 'b15l', name: '1.5 L bottle', value: 0.20 },
      { id: 'can', name: 'Aluminum can', value: 0.25 }
    ],

    users: [
      { id: 'U001', name: 'Juan Dela Cruz', email: 'juandelacruz@gmail.com', pin: '1234', points: 850, coins: 12.5, wifiMinutes: 45, itemsRecycled: 34, joined: now - 40 * day, wifiStart: null, wifiStartMinutes: 0 },
      { id: 'U002', name: 'Jose Reyes', email: 'jose@example.com', pin: '1234', points: 120, coins: 0, wifiMinutes: 5, itemsRecycled: 6, joined: now - 12 * day, wifiStart: null, wifiStartMinutes: 0 },
      { id: 'U003', name: 'Ana Dela Cruz', email: 'ana@example.com', pin: '1234', points: 2140, coins: 4, wifiMinutes: 120, itemsRecycled: 112, joined: now - 90 * day, wifiStart: null, wifiStartMinutes: 0 }
    ],

    machines: [
      { id: 'BCF-001', name: 'Barangay Hall', location: 'Molo Plaza, Molo', status: 'online', binLevel: 42, coinLevel: 68, wifiSignal: 'strong', totalItems: 1284, totalPaid: 148.6 },
      { id: 'BCF-002', name: 'Campus Gate', location: 'WVSU, La Paz', status: 'online', binLevel: 81, coinLevel: 22, wifiSignal: 'weak', totalItems: 2093, totalPaid: 231.2 },
      { id: 'BCF-003', name: 'Public Market', location: 'La Paz Public Market', status: 'maintenance', binLevel: 97, coinLevel: 0, wifiSignal: 'none', totalItems: 3410, totalPaid: 402.9 }
    ],

    transactions: [
      { id: 'T1001', date: now - 26 * hour, machineId: 'BCF-001', userId: 'U001', type: 'save', items: 2, amount: 0.35, points: 35 },
      { id: 'T1002', date: now - 20 * hour, machineId: 'BCF-002', userId: null, type: 'coins', items: 3, amount: 0.25 },
      { id: 'T1003', date: now - 5 * hour, machineId: 'BCF-001', userId: 'U002', type: 'wifi', items: 2, amount: 0.50, minutes: 5, code: 'WF-91A2' },
      { id: 'T1004', date: now - 1.5 * hour, machineId: 'BCF-001', userId: 'U001', type: 'coins', items: 1, amount: 0.10 }
    ],

    vouchers: [
      { code: 'WF-91A2', minutes: 5, userId: 'U002', machineId: 'BCF-001', created: now - 5 * hour, expires: now + 19 * hour, used: false }
    ],

    cashouts: [],

    alerts: [
      { id: 'A1001', machineId: 'BCF-003', message: 'Bin is at 97%. Machine paused until emptied.', level: 'critical', date: now - 8 * hour, read: false },
      { id: 'A1002', machineId: 'BCF-003', message: 'Coin hopper is empty.', level: 'critical', date: now - 8 * hour, read: false },
      { id: 'A1003', machineId: 'BCF-002', message: 'Wi-Fi signal is weak.', level: 'warning', date: now - 1 * hour, read: false }
    ],

    // codes shown on the kiosk for linking the app
    links: [],

    // id of the user logged in on the app
    loggedInUser: null
  };
}

function loadData() {
  var saved = localStorage.getItem(DATA_KEY);
  if (saved) {
    return JSON.parse(saved);
  }
  var data = getDefaultData();
  saveData(data);
  return data;
}

function saveData(data) {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

function resetData() {
  localStorage.removeItem(DATA_KEY);
  return loadData();
}

// ---------- helpers ----------

function peso(n) {
  return '₱' + Number(n || 0).toFixed(2);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatDate(time) {
  var d = new Date(time);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatMinutes(min) {
  min = Math.max(0, Math.floor(min));
  var h = Math.floor(min / 60);
  var m = min % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  return m + ' min';
}

// random code like WF-3F9A
function makeCode(prefix, length) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix + code;
}

function newId(prefix) {
  return prefix + Date.now().toString().slice(-6) + Math.floor(Math.random() * 10);
}

function findUser(data, id) {
  for (var i = 0; i < data.users.length; i++) {
    if (data.users[i].id === id) return data.users[i];
  }
  return null;
}

function findUserByEmail(data, email) {
  email = email.trim().toLowerCase();
  for (var i = 0; i < data.users.length; i++) {
    if (data.users[i].email.toLowerCase() === email) return data.users[i];
  }
  return null;
}

function findMachine(data, id) {
  for (var i = 0; i < data.machines.length; i++) {
    if (data.machines[i].id === id) return data.machines[i];
  }
  return null;
}

function findVoucher(data, code) {
  for (var i = 0; i < data.vouchers.length; i++) {
    if (data.vouchers[i].code === code) return data.vouchers[i];
  }
  return null;
}

function findCashout(data, code) {
  for (var i = 0; i < data.cashouts.length; i++) {
    if (data.cashouts[i].code === code) return data.cashouts[i];
  }
  return null;
}

function findLink(data, code) {
  for (var i = 0; i < data.links.length; i++) {
    if (data.links[i].code === code) return data.links[i];
  }
  return null;
}

function addTransaction(data, tx) {
  tx.id = newId('T');
  tx.date = Date.now();
  data.transactions.push(tx);
  return tx;
}

function addAlert(data, machineId, message, level) {
  data.alerts.push({
    id: newId('A'),
    machineId: machineId,
    message: message,
    level: level,
    date: Date.now(),
    read: false
  });
}

// machine checks
function canGiveCoins(data, m) {
  return m.status === 'online' && m.coinLevel >= data.settings.coinLowLevel;
}

function canGiveWifi(m) {
  return m.status === 'online' && m.wifiSignal !== 'none';
}

function isBinFull(data, m) {
  return m.binLevel >= data.settings.binFullLevel;
}

function voucherStatus(v) {
  if (v.used) return 'used';
  if (v.expires < Date.now()) return 'expired';
  return 'active';
}

function cashoutStatus(c) {
  if (c.status === 'pending' && c.expires < Date.now()) return 'expired';
  return c.status;
}

// newest first
function sortByDate(list) {
  return list.slice().sort(function (a, b) {
    return b.date - a.date;
  });
}

// readable name for each transaction type
function typeName(type) {
  var names = {
    'coins': 'Coins',
    'wifi': 'Wi-Fi voucher',
    'save': 'Saved points',
    'convert-coins': 'Points to coins',
    'convert-wifi': 'Points to Wi-Fi',
    'cashout': 'Cash-out code',
    'cashout-paid': 'Cash-out paid',
    'cashout-cancel': 'Cash-out cancelled',
    'voucher-add': 'Voucher added',
    'wifi-use': 'Wi-Fi used',
    'adjust': 'Points adjusted'
  };
  return names[type] || type;
}
