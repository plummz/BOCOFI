var currentPage = 'home';
var loginMode = 'login';

function showMessage(text) {
  var box = document.getElementById('message');
  box.textContent = text;
  box.style.display = 'block';
  setTimeout(function () {
    box.style.display = 'none';
  }, 2500);
}

function getCurrentUser(data) {
  return findUser(data, data.loggedInUser);
}

// ---------- login ----------

function switchTab(mode) {
  loginMode = mode;
  document.getElementById('loginError').textContent = '';

  if (mode === 'register') {
    document.getElementById('nameField').classList.remove('hidden');
    document.getElementById('registerTab').classList.add('active');
    document.getElementById('loginTab').classList.remove('active');
    document.getElementById('loginBtn').textContent = 'Create account';
  } else {
    document.getElementById('nameField').classList.add('hidden');
    document.getElementById('loginTab').classList.add('active');
    document.getElementById('registerTab').classList.remove('active');
    document.getElementById('loginBtn').textContent = 'Log in';
  }
}

function submitLogin(event) {
  event.preventDefault();

  var data = loadData();
  var name = document.getElementById('nameInput').value.trim();
  var email = document.getElementById('emailInput').value.trim().toLowerCase();
  var pin = document.getElementById('pinInput').value.trim();
  var error = document.getElementById('loginError');

  if (email === '' || email.indexOf('@') === -1) {
    error.textContent = 'Please enter a valid email.';
    return;
  }
  if (!isValidPin(pin)) {
    error.textContent = 'PIN must be 4 numbers.';
    return;
  }

  if (loginMode === 'register') {
    if (name === '') {
      error.textContent = 'Please enter your name.';
      return;
    }
    if (findUserByEmail(data, email)) {
      error.textContent = 'This email already has an account.';
      return;
    }
    var newUser = {
      id: newId('U'),
      name: name,
      email: email,
      pin: pin,
      points: 0,
      coins: 0,
      wifiMinutes: 0,
      itemsRecycled: 0,
      joined: Date.now(),
      wifiStart: null,
      wifiStartMinutes: 0
    };
    data.users.push(newUser);
    data.loggedInUser = newUser.id;
    saveData(data);
    showMessage('Account created. Welcome, ' + name.split(' ')[0] + '!');
  } else {
    var user = findUserByEmail(data, email);
    if (!user || user.pin !== pin) {
      error.textContent = 'Wrong email or PIN.';
      return;
    }
    data.loggedInUser = user.id;
    saveData(data);
    showMessage('Welcome back, ' + user.name.split(' ')[0] + '!');
  }

  document.getElementById('pinInput').value = '';
  error.textContent = '';
  start();
}

function logout() {
  var data = loadData();
  var user = getCurrentUser(data);
  if (user && user.wifiStart) {
    stopWifi(data, user);
  }
  data.loggedInUser = null;
  saveData(data);

  document.getElementById('nameInput').value = '';
  document.getElementById('emailInput').value = '';
  document.getElementById('pinInput').value = '';
  document.getElementById('pinInput').type = 'password';
  document.querySelector('#loginPage .show-btn').textContent = 'Show';
  start();
}

// ---------- pages ----------

function showPage(name) {
  currentPage = name;

  var pages = document.querySelectorAll('.page');
  for (var i = 0; i < pages.length; i++) {
    pages[i].classList.add('hidden');
  }
  document.getElementById('page-' + name).classList.remove('hidden');

  var navButtons = document.querySelectorAll('.bottom-nav button');
  for (var j = 0; j < navButtons.length; j++) {
    navButtons[j].classList.remove('active');
  }
  var nav = document.getElementById('nav-' + name);
  if (nav) nav.classList.add('active');

  loadPage();
  document.querySelector('.content').scrollTop = 0;
}

function loadPage() {
  var data = loadData();
  var user = getCurrentUser(data);
  if (!user) return;

  document.getElementById('headerName').textContent = user.name;

  if (currentPage === 'home') loadHome(data, user);
  if (currentPage === 'recycle') loadRecycle(data);
  if (currentPage === 'wallet') loadWallet(data, user);
  if (currentPage === 'wifi') loadWifi(data, user);
  if (currentPage === 'history') loadHistory(data, user);
  if (currentPage === 'machines') loadMachines(data);
  if (currentPage === 'profile') loadProfile(user);
}

function transactionRow(t, data) {
  var m = findMachine(data, t.machineId);
  var place = m ? m.name : 'App';
  var detail = '';

  if (t.type === 'save') detail = '+' + t.points + ' pts';
  else if (t.type === 'coins' || t.type === 'cashout-paid') detail = peso(t.amount);
  else if (t.type === 'wifi') detail = t.minutes + ' min (' + t.code + ')';
  else if (t.type === 'convert-coins') detail = t.points + ' pts to ' + peso(t.amount);
  else if (t.type === 'convert-wifi') detail = t.points + ' pts to ' + t.minutes + ' min';
  else if (t.type === 'cashout' || t.type === 'cashout-cancel') detail = peso(t.amount) + ' (' + t.code + ')';
  else if (t.type === 'voucher-add') detail = '+' + t.minutes + ' min';
  else if (t.type === 'wifi-use') detail = formatMinutes(t.minutes) + ' used';
  else if (t.type === 'adjust') detail = t.points + ' pts';

  return '<div class="row">' +
    '<div><b>' + typeName(t.type) + '</b><br><span class="small gray">' + place + ', ' + formatDate(t.date) + '</span></div>' +
    '<div class="right">' + detail + '</div>' +
    '</div>';
}

function getUserTransactions(data, user) {
  var list = data.transactions.filter(function (t) {
    return t.userId === user.id;
  });
  return sortByDate(list);
}

// ---------- home ----------

function loadHome(data, user) {
  var s = data.settings;
  document.getElementById('homeName').textContent = user.name.split(' ')[0];
  document.getElementById('homePoints').textContent = user.points + ' pts';
  document.getElementById('homePointsValue').textContent = 'Worth ' + peso(user.points / s.pointsPerPeso);
  document.getElementById('homeCoins').textContent = peso(user.coins);
  document.getElementById('homeWifi').textContent = formatMinutes(wifiLeft(user));
  document.getElementById('homeItems').textContent = user.itemsRecycled;

  var list = getUserTransactions(data, user).slice(0, 3);
  var html = '';
  for (var i = 0; i < list.length; i++) {
    html += transactionRow(list[i], data);
  }
  if (html === '') html = '<p class="gray small">No activity yet. Go to a machine and start recycling!</p>';
  document.getElementById('homeActivity').innerHTML = html;
}

// ---------- recycle ----------

function loadRecycle(data) {
  var html = '';
  for (var i = 0; i < data.items.length; i++) {
    var item = data.items[i];
    var pts = Math.round(item.value * data.settings.pointsPerPeso);
    html += '<tr><td>' + item.name + '</td><td>' + peso(item.value) + '</td><td>' + pts + ' pts</td></tr>';
  }
  document.getElementById('rateTable').innerHTML = html;
  document.getElementById('linkError').textContent = '';
}

function linkMachine() {
  var data = loadData();
  var user = getCurrentUser(data);
  var code = document.getElementById('linkInput').value.trim().toUpperCase();
  var error = document.getElementById('linkError');
  var link = findLink(data, code);

  if (code.length !== 4) {
    error.textContent = 'Please enter the 4-letter code from the kiosk.';
    return;
  }
  if (!link) {
    error.textContent = 'Code not found. Check the kiosk screen and try again.';
    return;
  }
  if (link.userId) {
    error.textContent = 'This code was already used.';
    return;
  }

  link.userId = user.id;
  saveData(data);

  var m = findMachine(data, link.machineId);
  document.getElementById('linkInput').value = '';
  showMessage('Linked to ' + m.name + '. You can now insert your items.');
  showPage('home');
}

// ---------- wallet ----------

function loadWallet(data, user) {
  var s = data.settings;
  document.getElementById('walletPoints').textContent = user.points + ' pts';
  document.getElementById('walletCoins').textContent = peso(user.coins);
  document.getElementById('walletWifi').textContent = formatMinutes(wifiLeft(user));
  document.getElementById('convertInfo').textContent = s.pointsPerPeso + ' pts = ₱1.00 or ' + s.wifiMinutesPerPeso + ' minutes of Wi-Fi';
  document.getElementById('convertPoints').value = '';
  document.getElementById('convertError').textContent = '';
  document.getElementById('cashoutError').textContent = '';
  updateConvertPreview();

  var amounts = [1, 5, 10, 20];
  var options = '';
  for (var i = 0; i < amounts.length; i++) {
    if (amounts[i] <= user.coins) {
      options += '<option value="' + amounts[i] + '">' + peso(amounts[i]) + '</option>';
    }
  }
  if (options === '') options = '<option value="0">Not enough coin balance</option>';
  document.getElementById('cashoutAmount').innerHTML = options;

  var codes = data.cashouts.filter(function (c) {
    return c.userId === user.id;
  });
  var html = '';
  for (var j = codes.length - 1; j >= 0; j--) {
    var c = codes[j];
    var status = cashoutStatus(c);
    html += '<div class="row">' +
      '<div><span class="code">' + c.code + '</span><br><span class="small gray">' + peso(c.amount) + '</span></div>';
    if (status === 'pending') {
      html += '<button class="btn btn-white btn-small" onclick="cancelCashout(\'' + c.code + '\')">Cancel</button>';
    } else {
      html += '<span class="tag">' + status + '</span>';
    }
    html += '</div>';
  }
  document.getElementById('cashoutList').innerHTML = html;
}

function updateConvertPreview() {
  var data = loadData();
  var s = data.settings;
  var type = document.getElementById('convertType').value;
  var pts = Number(document.getElementById('convertPoints').value) || 0;
  var preview = document.getElementById('convertPreview');

  if (pts <= 0) {
    preview.textContent = '';
  } else if (type === 'coins') {
    preview.textContent = 'You will get ' + peso(pts / s.pointsPerPeso);
  } else {
    preview.textContent = 'You will get ' + formatMinutes(pts / s.pointsPerPeso * s.wifiMinutesPerPeso);
  }
}

function convertPoints() {
  var data = loadData();
  var user = getCurrentUser(data);
  var s = data.settings;
  var type = document.getElementById('convertType').value;
  var pts = Math.floor(Number(document.getElementById('convertPoints').value));
  var error = document.getElementById('convertError');

  if (!pts || pts <= 0) {
    error.textContent = 'Enter how many points to convert.';
    return;
  }
  if (pts > user.points) {
    error.textContent = 'You only have ' + user.points + ' points.';
    return;
  }

  var pesos = round2(pts / s.pointsPerPeso);
  user.points -= pts;

  if (type === 'coins') {
    user.coins = round2(user.coins + pesos);
    addTransaction(data, { machineId: null, userId: user.id, type: 'convert-coins', items: 0, amount: pesos, points: pts });
    showMessage(peso(pesos) + ' added to your coin balance');
  } else {
    var minutes = Math.floor(pesos * s.wifiMinutesPerPeso);
    addWifiMinutes(user, minutes);
    addTransaction(data, { machineId: null, userId: user.id, type: 'convert-wifi', items: 0, amount: pesos, points: pts, minutes: minutes });
    showMessage(minutes + ' minutes of Wi-Fi added');
  }

  saveData(data);
  loadPage();
}

function makeCashout() {
  var data = loadData();
  var user = getCurrentUser(data);
  var amount = Number(document.getElementById('cashoutAmount').value);
  var error = document.getElementById('cashoutError');

  if (!amount || amount > user.coins) {
    error.textContent = 'Not enough coin balance.';
    return;
  }

  var code = makeCode('CO-', 4);
  user.coins = round2(user.coins - amount);
  data.cashouts.push({
    code: code,
    userId: user.id,
    amount: amount,
    status: 'pending',
    created: Date.now(),
    expires: Date.now() + data.settings.cashoutHours * 60 * 60 * 1000
  });
  addTransaction(data, { machineId: null, userId: user.id, type: 'cashout', items: 0, amount: amount, code: code });
  saveData(data);

  showMessage('Your code is ' + code + '. Enter it on the kiosk.');
  loadPage();
}

function cancelCashout(code) {
  var data = loadData();
  var user = getCurrentUser(data);
  var c = findCashout(data, code);

  if (c && c.status === 'pending') {
    c.status = 'cancelled';
    user.coins = round2(user.coins + c.amount);
    addTransaction(data, { machineId: null, userId: user.id, type: 'cashout-cancel', items: 0, amount: c.amount, code: code });
    saveData(data);
    showMessage('Cash-out cancelled. Balance returned.');
  }
  loadPage();
}

// ---------- wifi ----------

function wifiLeft(user) {
  if (!user.wifiStart) return user.wifiMinutes;
  var used = (Date.now() - user.wifiStart) / 60000;
  return Math.max(0, user.wifiStartMinutes - used);
}

function addWifiMinutes(user, minutes) {
  user.wifiMinutes += minutes;
  if (user.wifiStart) {
    user.wifiStartMinutes += minutes;
  }
}

function formatClock(minutes) {
  var totalSeconds = Math.floor(minutes * 60);
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  var text = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  if (h > 0) text = h + ':' + text;
  return text;
}

function loadWifi(data, user) {
  var left = wifiLeft(user);
  var button = document.getElementById('wifiButton');

  if (user.wifiStart) {
    document.getElementById('wifiTimeBig').textContent = formatClock(left);
    document.getElementById('wifiStatusText').innerHTML = '<span class="tag green">Connected</span> BOCO-FI Free Wi-Fi';
    button.textContent = 'Disconnect';
    button.disabled = false;
  } else {
    document.getElementById('wifiTimeBig').textContent = formatMinutes(left);
    document.getElementById('wifiStatusText').innerHTML = '<span class="tag">Not connected</span>';
    button.textContent = 'Connect';
    button.disabled = left <= 0;
  }

  var vouchers = data.vouchers.filter(function (v) {
    return v.userId === user.id;
  });
  var html = '';
  for (var i = vouchers.length - 1; i >= 0; i--) {
    var v = vouchers[i];
    var status = voucherStatus(v);
    html += '<div class="card row">' +
      '<div><span class="code">' + v.code + '</span><br><span class="small gray">' + v.minutes + ' minutes</span></div>';
    if (status === 'active') {
      html += '<button class="btn btn-blue btn-small" onclick="useVoucher(\'' + v.code + '\')">Add to my time</button>';
    } else {
      html += '<span class="tag">' + status + '</span>';
    }
    html += '</div>';
  }
  if (html === '') html = '<p class="gray small">No vouchers yet. Choose WI-FI on the kiosk after recycling.</p>';
  document.getElementById('voucherList').innerHTML = html;
}

function toggleWifi() {
  var data = loadData();
  var user = getCurrentUser(data);

  if (user.wifiStart) {
    stopWifi(data, user);
    showMessage('Disconnected');
  } else {
    if (user.wifiMinutes <= 0) {
      showMessage('No Wi-Fi time left. Convert some points first.');
      return;
    }
    user.wifiStart = Date.now();
    user.wifiStartMinutes = user.wifiMinutes;
    showMessage('Connected to BOCO-FI Free Wi-Fi');
  }

  saveData(data);
  loadPage();
}

function stopWifi(data, user) {
  var left = wifiLeft(user);
  var used = user.wifiStartMinutes - left;
  user.wifiMinutes = round2(left);
  user.wifiStart = null;
  if (used >= 1) {
    addTransaction(data, { machineId: null, userId: user.id, type: 'wifi-use', items: 0, amount: 0, minutes: round2(used) });
  }
}

function useVoucher(code) {
  var data = loadData();
  var user = getCurrentUser(data);
  var v = findVoucher(data, code);

  if (!v || voucherStatus(v) !== 'active') {
    showMessage('This voucher can no longer be used.');
    return;
  }

  v.used = true;
  addWifiMinutes(user, v.minutes);
  addTransaction(data, { machineId: v.machineId, userId: user.id, type: 'voucher-add', items: 0, amount: 0, minutes: v.minutes, code: v.code });
  saveData(data);

  showMessage(v.minutes + ' minutes added to your Wi-Fi time');
  loadPage();
}

setInterval(function () {
  var data = loadData();
  var user = getCurrentUser(data);
  if (!user || !user.wifiStart) return;

  var left = wifiLeft(user);
  if (left <= 0) {
    stopWifi(data, user);
    saveData(data);
    showMessage('Your Wi-Fi time is used up');
    loadPage();
    return;
  }

  var labels = document.querySelectorAll('.wifi-time');
  for (var i = 0; i < labels.length; i++) {
    labels[i].textContent = formatClock(left);
  }
}, 1000);

// ---------- history ----------

function loadHistory(data, user) {
  var list = getUserTransactions(data, user);
  var html = '';
  for (var i = 0; i < list.length; i++) {
    html += transactionRow(list[i], data);
  }
  if (html === '') html = '<p class="gray small">No transactions yet.</p>';
  document.getElementById('historyList').innerHTML = html;
}

// ---------- machines ----------

function loadMachines(data) {
  var html = '';
  for (var i = 0; i < data.machines.length; i++) {
    var m = data.machines[i];
    var tag = '<span class="tag green">Online</span>';
    if (m.status !== 'online') tag = '<span class="tag yellow">' + m.status + '</span>';
    else if (isBinFull(data, m)) tag = '<span class="tag red">Bin full</span>';

    html += '<div class="card">' +
      '<h4>' + m.name + ' ' + tag + '</h4>' +
      '<p class="small gray">' + m.location + '</p>' +
      '<p class="small">Coins: ' + (canGiveCoins(data, m) ? 'Yes' : 'No') +
      ' | Wi-Fi: ' + (canGiveWifi(m) ? 'Yes' : 'No') +
      ' | Bin: ' + Math.round(m.binLevel) + '%</p>' +
      '<div class="bar"><div style="width:' + m.binLevel + '%"></div></div>' +
      '<a class="btn btn-white btn-small" target="_blank" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(m.location + ', Iloilo City') + '">Directions</a>' +
      '</div>';
  }
  document.getElementById('machineList').innerHTML = html;
}

// ---------- profile ----------

function loadProfile(user) {
  document.getElementById('profileName').value = user.name;
  document.getElementById('profileEmail').value = user.email;
  document.getElementById('profilePin').value = '';
  document.getElementById('profileError').textContent = '';
  document.getElementById('profileJoined').textContent = new Date(user.joined).toLocaleDateString();
}

function saveProfile() {
  var data = loadData();
  var user = getCurrentUser(data);
  var name = document.getElementById('profileName').value.trim();
  var email = document.getElementById('profileEmail').value.trim().toLowerCase();
  var pin = document.getElementById('profilePin').value.trim();
  var error = document.getElementById('profileError');

  if (name === '') {
    error.textContent = 'Name cannot be empty.';
    return;
  }
  var other = findUserByEmail(data, email);
  if (other && other.id !== user.id) {
    error.textContent = 'This email is already used.';
    return;
  }
  if (pin !== '' && !isValidPin(pin)) {
    error.textContent = 'PIN must be 4 numbers.';
    return;
  }

  user.name = name;
  user.email = email;
  if (pin !== '') user.pin = pin;
  saveData(data);
  showMessage('Profile saved');
  loadPage();
}

function resetAll() {
  if (confirm('This will delete all test data (users, machines, history). Continue?')) {
    resetData();
    start();
    showMessage('Test data reset');
  }
}

// ---------- start ----------

function start() {
  var data = loadData();
  var user = getCurrentUser(data);

  if (user) {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('mainPage').classList.remove('hidden');
    showPage('home');
  } else {
    document.getElementById('mainPage').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
    switchTab('login');
  }
}

window.addEventListener('storage', function () {
  var tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT') return;

  var data = loadData();
  var loggedIn = !document.getElementById('mainPage').classList.contains('hidden');
  if (getCurrentUser(data)) {
    if (loggedIn) loadPage();
    else start();
  } else if (loggedIn) {
    start();
  }
});

start();
