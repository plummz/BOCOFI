// BOCO-FI Admin

var currentSection = 'dashboard';

function showMessage(text) {
  var box = document.getElementById('message');
  box.textContent = text;
  box.style.display = 'block';
  setTimeout(function () {
    box.style.display = 'none';
  }, 2500);
}

function userName(data, id) {
  var u = findUser(data, id);
  return u ? u.name : 'Guest';
}

function machineName(data, id) {
  var m = findMachine(data, id);
  return m ? m.name : 'App';
}

function statusTag(status) {
  var color = 'green';
  if (status === 'maintenance' || status === 'pending' || status === 'warning') color = 'yellow';
  if (status === 'offline' || status === 'expired' || status === 'critical') color = 'red';
  if (status === 'used' || status === 'paid' || status === 'cancelled') color = '';
  return '<span class="tag ' + color + '">' + status + '</span>';
}

// ---------- login ----------

function adminLogin(event) {
  event.preventDefault();
  var data = loadData();
  var user = document.getElementById('username').value.trim();
  var pass = document.getElementById('password').value;

  if (user === data.settings.adminUser && pass === data.settings.adminPass) {
    sessionStorage.setItem('bocofi_admin', 'yes');
    document.getElementById('password').value = '';
    document.getElementById('loginError').textContent = '';
    start();
  } else {
    document.getElementById('loginError').textContent = 'Wrong username or password.';
  }
}

function adminLogout() {
  sessionStorage.removeItem('bocofi_admin');
  start();
}

// ---------- sections ----------

function showSection(name) {
  currentSection = name;

  var sections = document.querySelectorAll('.section');
  for (var i = 0; i < sections.length; i++) {
    sections[i].classList.add('hidden');
  }
  document.getElementById('section-' + name).classList.remove('hidden');

  var buttons = document.querySelectorAll('.sidebar button');
  for (var j = 0; j < buttons.length; j++) {
    buttons[j].classList.remove('active');
  }
  document.getElementById('nav-' + name).classList.add('active');

  loadSection();
}

function loadSection() {
  var data = loadData();

  // unread alerts count in the sidebar
  var unread = data.alerts.filter(function (a) {
    return !a.read;
  }).length;
  document.getElementById('alertCount').textContent = unread > 0 ? unread : '';

  if (currentSection === 'dashboard') loadDashboard(data);
  if (currentSection === 'machines') loadMachines(data);
  if (currentSection === 'alerts') loadAlerts(data);
  if (currentSection === 'transactions') loadTransactions();
  if (currentSection === 'users') loadUsers(data);
  if (currentSection === 'codes') loadCodes(data);
  if (currentSection === 'settings') loadSettings(data);
}

// ---------- dashboard ----------

function loadDashboard(data) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var itemsToday = 0;
  var valueToday = 0;
  for (var i = 0; i < data.transactions.length; i++) {
    var t = data.transactions[i];
    if (t.date >= today.getTime() && (t.type === 'coins' || t.type === 'wifi' || t.type === 'save')) {
      itemsToday += t.items;
      valueToday += t.amount;
    }
  }

  var online = data.machines.filter(function (m) {
    return m.status === 'online';
  }).length;

  document.getElementById('statItems').textContent = itemsToday;
  document.getElementById('statValue').textContent = peso(valueToday);
  document.getElementById('statMachines').textContent = online + ' / ' + data.machines.length;
  document.getElementById('statUsers').textContent = data.users.length;

  var rows = '';
  for (var j = 0; j < data.machines.length; j++) {
    var m = data.machines[j];
    rows += '<tr><td><b>' + m.name + '</b><br><span class="small gray">' + m.id + '</span></td>' +
      '<td>' + statusTag(m.status) + '</td>' +
      '<td>' + Math.round(m.binLevel) + '%</td>' +
      '<td>' + Math.round(m.coinLevel) + '%</td>' +
      '<td>' + m.wifiSignal + '</td></tr>';
  }
  document.getElementById('dashMachines').innerHTML = rows;

  var list = sortByDate(data.transactions).slice(0, 6);
  var txRows = '';
  for (var k = 0; k < list.length; k++) {
    var tx = list[k];
    txRows += '<tr><td>' + formatDate(tx.date) + '</td><td>' + machineName(data, tx.machineId) + '</td>' +
      '<td>' + userName(data, tx.userId) + '</td><td>' + typeName(tx.type) + '</td><td>' + peso(tx.amount) + '</td></tr>';
  }
  document.getElementById('dashTransactions').innerHTML = txRows;
}

// ---------- machines ----------

function loadMachines(data) {
  var html = '';
  for (var i = 0; i < data.machines.length; i++) {
    var m = data.machines[i];
    html += '<div class="card machine">' +
      '<h3>' + m.name + ' ' + statusTag(m.status) + '</h3>' +
      '<p class="small gray">' + m.id + ', ' + m.location + '</p>' +

      '<p>Bin level: ' + Math.round(m.binLevel) + '%</p>' +
      '<div class="bar"><div style="width:' + m.binLevel + '%"></div></div>' +
      '<p>Coin hopper: ' + Math.round(m.coinLevel) + '%</p>' +
      '<div class="bar"><div style="width:' + m.coinLevel + '%"></div></div>' +
      '<p>Wi-Fi signal: ' + m.wifiSignal + '</p>' +
      '<p class="small gray">Total items: ' + m.totalItems + ' | Total paid out: ' + peso(m.totalPaid) + '</p>' +

      '<label>Status</label>' +
      '<select onchange="changeStatus(\'' + m.id + '\', this.value)">' +
      '<option value="online"' + (m.status === 'online' ? ' selected' : '') + '>online</option>' +
      '<option value="maintenance"' + (m.status === 'maintenance' ? ' selected' : '') + '>maintenance</option>' +
      '<option value="offline"' + (m.status === 'offline' ? ' selected' : '') + '>offline</option>' +
      '</select>' +

      '<button class="btn btn-small" onclick="emptyBin(\'' + m.id + '\')">Empty bin</button> ' +
      '<button class="btn btn-small" onclick="refillCoins(\'' + m.id + '\')">Refill coins</button> ' +
      '<a class="btn btn-white btn-small" href="../kiosk/index.html" target="_blank">Open kiosk</a>' +
      '</div>';
  }
  document.getElementById('machineCards').innerHTML = html;
}

function changeStatus(id, status) {
  var data = loadData();
  findMachine(data, id).status = status;
  saveData(data);
  showMessage('Status changed to ' + status);
  loadSection();
}

function emptyBin(id) {
  var data = loadData();
  findMachine(data, id).binLevel = 0;
  saveData(data);
  showMessage('Bin emptied');
  loadSection();
}

function refillCoins(id) {
  var data = loadData();
  findMachine(data, id).coinLevel = 100;
  saveData(data);
  showMessage('Coins refilled');
  loadSection();
}

// ---------- alerts ----------

function loadAlerts(data) {
  var list = sortByDate(data.alerts);
  var rows = '';
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    rows += '<tr class="' + (a.read ? 'read' : '') + '">' +
      '<td>' + formatDate(a.date) + '</td><td>' + machineName(data, a.machineId) + '</td>' +
      '<td>' + a.message + '</td><td>' + statusTag(a.level) + '</td>' +
      '<td>' + (a.read ? '' : '<button class="btn btn-white btn-small" onclick="markRead(\'' + a.id + '\')">Mark read</button>') + '</td></tr>';
  }
  if (rows === '') rows = '<tr><td colspan="5" class="gray">No alerts.</td></tr>';
  document.getElementById('alertTable').innerHTML = rows;
}

function markRead(id) {
  var data = loadData();
  for (var i = 0; i < data.alerts.length; i++) {
    if (data.alerts[i].id === id) data.alerts[i].read = true;
  }
  saveData(data);
  loadSection();
}

function markAllRead() {
  var data = loadData();
  for (var i = 0; i < data.alerts.length; i++) {
    data.alerts[i].read = true;
  }
  saveData(data);
  loadSection();
}

// ---------- transactions ----------

function loadTransactions() {
  var data = loadData();
  var select = document.getElementById('filterMachine');
  var selected = select.value;

  // fill the filter dropdown
  var options = '<option value="">All machines</option>';
  for (var i = 0; i < data.machines.length; i++) {
    var m = data.machines[i];
    options += '<option value="' + m.id + '"' + (selected === m.id ? ' selected' : '') + '>' + m.name + '</option>';
  }
  select.innerHTML = options;

  var list = sortByDate(data.transactions);
  if (selected !== '') {
    list = list.filter(function (t) {
      return t.machineId === selected;
    });
  }

  var rows = '';
  for (var j = 0; j < list.length; j++) {
    var t = list[j];
    rows += '<tr><td class="small">' + t.id + '</td><td>' + formatDate(t.date) + '</td>' +
      '<td>' + machineName(data, t.machineId) + '</td><td>' + userName(data, t.userId) + '</td>' +
      '<td>' + t.items + '</td><td>' + peso(t.amount) + '</td><td>' + typeName(t.type) + '</td></tr>';
  }
  if (rows === '') rows = '<tr><td colspan="7" class="gray">No transactions.</td></tr>';
  document.getElementById('transactionTable').innerHTML = rows;
}

// ---------- users ----------

function loadUsers(data) {
  var rows = '';
  for (var i = 0; i < data.users.length; i++) {
    var u = data.users[i];
    rows += '<tr><td><b>' + u.name + '</b></td><td>' + u.email + '</td>' +
      '<td>' + u.points + '</td><td>' + peso(u.coins) + '</td><td>' + u.itemsRecycled + '</td>' +
      '<td><button class="btn btn-white btn-small" onclick="adjustPoints(\'' + u.id + '\')">Add points</button> ' +
      '<button class="btn btn-red btn-small" onclick="deleteUser(\'' + u.id + '\')">Delete</button></td></tr>';
  }
  if (rows === '') rows = '<tr><td colspan="6" class="gray">No users yet.</td></tr>';
  document.getElementById('userTable').innerHTML = rows;
}

function adjustPoints(id) {
  var data = loadData();
  var u = findUser(data, id);
  var input = prompt('How many points to add to ' + u.name + '? (use a minus sign to remove)', '100');
  if (input === null) return;

  var pts = parseInt(input);
  if (isNaN(pts) || pts === 0) {
    showMessage('Please enter a number.');
    return;
  }

  u.points = Math.max(0, u.points + pts);
  addTransaction(data, { machineId: null, userId: u.id, type: 'adjust', items: 0, amount: 0, points: pts });
  saveData(data);
  showMessage('Points updated');
  loadSection();
}

function deleteUser(id) {
  var data = loadData();
  var u = findUser(data, id);
  if (!confirm('Delete ' + u.name + '?')) return;

  data.users = data.users.filter(function (x) {
    return x.id !== id;
  });
  if (data.loggedInUser === id) data.loggedInUser = null;
  saveData(data);
  loadSection();
}

// ---------- vouchers and cash-outs ----------

function loadCodes(data) {
  var vouchers = data.vouchers.slice().reverse();
  var rows = '';
  for (var i = 0; i < vouchers.length; i++) {
    var v = vouchers[i];
    rows += '<tr><td class="code">' + v.code + '</td><td>' + v.minutes + '</td><td>' + userName(data, v.userId) + '</td>' +
      '<td>' + machineName(data, v.machineId) + '</td><td>' + formatDate(v.expires) + '</td><td>' + statusTag(voucherStatus(v)) + '</td></tr>';
  }
  if (rows === '') rows = '<tr><td colspan="6" class="gray">No vouchers yet.</td></tr>';
  document.getElementById('voucherTable').innerHTML = rows;

  var cashouts = data.cashouts.slice().reverse();
  var rows2 = '';
  for (var j = 0; j < cashouts.length; j++) {
    var c = cashouts[j];
    rows2 += '<tr><td class="code">' + c.code + '</td><td>' + userName(data, c.userId) + '</td><td>' + peso(c.amount) + '</td>' +
      '<td>' + formatDate(c.created) + '</td><td>' + statusTag(cashoutStatus(c)) + '</td></tr>';
  }
  if (rows2 === '') rows2 = '<tr><td colspan="5" class="gray">No cash-out codes yet.</td></tr>';
  document.getElementById('cashoutTable').innerHTML = rows2;
}

// ---------- settings ----------

function loadSettings(data) {
  var rows = '';
  for (var i = 0; i < data.items.length; i++) {
    var item = data.items[i];
    rows += '<tr><td>' + item.name + '</td>' +
      '<td><input type="number" step="0.01" min="0" class="item-value" value="' + item.value + '"></td></tr>';
  }
  document.getElementById('itemTable').innerHTML = rows;

  var s = data.settings;
  document.getElementById('setPoints').value = s.pointsPerPeso;
  document.getElementById('setWifi').value = s.wifiMinutesPerPeso;
  document.getElementById('setCrush').value = s.binCrushLevel;
  document.getElementById('setFull').value = s.binFullLevel;
  document.getElementById('setUser').value = s.adminUser;
  document.getElementById('setPass').value = '';
}

function saveItems() {
  var data = loadData();
  var inputs = document.querySelectorAll('.item-value');
  for (var i = 0; i < inputs.length; i++) {
    var value = Number(inputs[i].value);
    if (isNaN(value) || value < 0) {
      showMessage('Please enter valid amounts.');
      return;
    }
    data.items[i].value = round2(value);
  }
  saveData(data);
  showMessage('Rewards saved');
}

function saveRates() {
  var data = loadData();
  var points = Number(document.getElementById('setPoints').value);
  var wifi = Number(document.getElementById('setWifi').value);
  var crush = Number(document.getElementById('setCrush').value);
  var full = Number(document.getElementById('setFull').value);

  if (points <= 0 || wifi <= 0) {
    showMessage('Rates must be more than 0.');
    return;
  }
  if (crush > full) {
    showMessage('Crusher level must be lower than the full level.');
    return;
  }

  data.settings.pointsPerPeso = points;
  data.settings.wifiMinutesPerPeso = wifi;
  data.settings.binCrushLevel = crush;
  data.settings.binFullLevel = full;
  saveData(data);
  showMessage('Rates saved');
}

function saveAccount() {
  var data = loadData();
  var user = document.getElementById('setUser').value.trim();
  var pass = document.getElementById('setPass').value;

  if (user === '') {
    showMessage('Username cannot be empty.');
    return;
  }
  if (pass !== '' && pass.length < 6) {
    showMessage('Password must be at least 6 characters.');
    return;
  }

  data.settings.adminUser = user;
  if (pass !== '') data.settings.adminPass = pass;
  saveData(data);
  showMessage('Account saved');
}

function resetAll() {
  if (confirm('Reset all data? This cannot be undone.')) {
    resetData();
    showMessage('Data reset');
    loadSection();
  }
}

// ---------- start ----------

function start() {
  if (sessionStorage.getItem('bocofi_admin') === 'yes') {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('adminPage').classList.remove('hidden');
    showSection(currentSection);
  } else {
    document.getElementById('adminPage').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
  }
}

// update the page when the kiosk or app changes something
window.addEventListener('storage', function () {
  var tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT') return;
  if (sessionStorage.getItem('bocofi_admin') === 'yes') {
    loadSection();
  }
});

start();
