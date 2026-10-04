var machineId = localStorage.getItem('bocofi_kiosk_machine') || 'BCF-001';

var currentScreen = '1.0';
var lastScreen = '1.0';
var userId = null;
var isGuest = false;
var accessChoice = null;
var items = [];
var total = 0;
var pendingItem = null;
var rewardType = null;
var cashoutCode = '';
var cashoutAmount = 0;
var lastVoucher = null;
var linkCode = null;
var alertSent = false;

var screenTimer = null;
var repeatTimer = null;
var idleTimer = null;
var stillTimer = null;

function getMachine(data) {
  return findMachine(data, machineId);
}

function showMessage(text) {
  var box = document.getElementById('message');
  box.textContent = text;
  box.style.display = 'block';
  setTimeout(function () {
    box.style.display = 'none';
  }, 2500);
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function setHtml(id, html) {
  document.getElementById(id).innerHTML = html;
}

function itemCountText() {
  if (items.length === 1) return '1 item';
  return items.length + ' items';
}

function sessionPoints(data) {
  return Math.round(total * data.settings.pointsPerPeso);
}

function sessionMinutes(data) {
  return Math.max(1, Math.round(total * data.settings.wifiMinutesPerPeso));
}

function hideAllScreens() {
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) {
    screens[i].classList.remove('active');
  }
}

function showScreen(id) {
  clearTimeout(screenTimer);
  clearInterval(repeatTimer);
  clearInterval(stillTimer);

  hideAllScreens();
  document.getElementById('screen-' + id).classList.add('active');
  currentScreen = id;

  setupScreen(id);
  updateHeader();
  resetIdleTimer();
}

function updateHeader() {
  var data = loadData();
  var user = findUser(data, userId);
  var label = document.getElementById('userLabel');

  if (user) {
    label.textContent = user.name;
  } else if (isGuest) {
    label.textContent = 'Guest';
  } else {
    label.textContent = '';
  }
}

function setupScreen(id) {
  var data = loadData();
  var m = getMachine(data);
  var user = findUser(data, userId);

  if (id === '1.0') {
    if (m.status === 'online') {
      setText('status-1.0', 'Online');
      setText('extra-1.0', '');
      document.getElementById('startBtn').disabled = false;
    } else {
      setText('status-1.0', 'Under ' + m.status);
      setText('extra-1.0', 'This machine is not available right now. Please use another machine.');
      document.getElementById('startBtn').disabled = true;
    }
  }

  if (id === '2.0') {
    accessChoice = null;
    document.getElementById('optionLogin').classList.remove('selected');
    document.getElementById('optionGuest').classList.remove('selected');
    document.getElementById('accessBtn').disabled = true;
    setText('status-2.0', 'Select an option');
  }

  if (id === '2.1') {
    makeLinkCode();
    repeatTimer = setInterval(checkLink, 1000);
  }

  if (id === '2.2') {
    setHtml('extra-2.2', '<p class="info">Logged in as <b>' + user.name + '</b></p>' +
      '<p class="info">Current balance: <b>' + user.points + ' points</b></p>');
  }

  if (id === '3.0') {
    if (m.wifiSignal === 'strong') {
      setText('status-3.0', 'Wi-Fi Connected');
      setText('desc-3.0', 'The Wi-Fi connection is working. Tap Continue when you are ready.');
    } else if (m.wifiSignal === 'weak') {
      setText('status-3.0', 'Wi-Fi Weak');
      setText('desc-3.0', 'The Wi-Fi signal is weak but still working. Tap Continue when you are ready.');
    } else {
      setText('status-3.0', 'No Wi-Fi');
      setText('desc-3.0', 'The Wi-Fi connection is not working. Wi-Fi vouchers will not be available.');
    }
  }

  if (id === '3.1') {
    if (canGiveCoins(data, m)) {
      setText('status-3.1', 'Coins Available');
      setText('desc-3.1', 'There are enough coins in the machine. Tap Continue when you are ready.');
    } else {
      setText('status-3.1', 'Coins Low');
      setText('desc-3.1', 'The machine is low on coins. Coin rewards will not be available.');
    }
  }

  if (id === '3.2') {
    var coinsOk = canGiveCoins(data, m);
    var wifiOk = canGiveWifi(m);
    var html = '<p class="info">Coins: <b>' + (coinsOk ? 'Available' : 'Not available') + '</b></p>';
    html += '<p class="info">Wi-Fi voucher: <b>' + (wifiOk ? 'Available' : 'Not available') + '</b></p>';
    if (user) {
      html += '<p class="info">Save as points: <b>Available</b></p>';
    }
    setHtml('extra-3.2', html);

    if (!alertSent && (!coinsOk || !wifiOk)) {
      if (!coinsOk) addAlert(data, m.id, 'Coin hopper is low. Users can only get Wi-Fi or save points.', 'warning');
      if (!wifiOk) addAlert(data, m.id, 'Wi-Fi is not available. Users can only get coins or save points.', 'warning');
      saveData(data);
      alertSent = true;
    }
  }

  if (id === '3.3') {
    var noReward = !canGiveCoins(data, m) && !canGiveWifi(m) && !user;
    if (noReward || isBinFull(data, m)) {
      setText('status-3.3', 'No Rewards');
      setText('desc-3.3', 'No rewards are available right now. Please use another machine.');
      setText('noRewardBtn', 'Finish');
      addAlert(data, m.id, 'No rewards available. A user was turned away.', 'critical');
      saveData(data);
    } else {
      setText('status-3.3', 'Limited Rewards');
      setText('desc-3.3', 'One reward option is currently unavailable. You can choose another.');
      setText('noRewardBtn', 'Choose Another');
    }
  }

  if (id === '4.0') {
    var options = '';
    for (var i = 0; i < data.items.length; i++) {
      options += '<option value="' + data.items[i].id + '">' + data.items[i].name + ' (' + peso(data.items[i].value) + ')</option>';
    }
    options += '<option value="unknown">Unknown item (will be rejected)</option>';
    setHtml('itemSelect', options);

    if (items.length > 0) {
      setText('insertTotal', 'Total so far: ' + peso(total) + ' (' + itemCountText() + ')');
    } else {
      setText('insertTotal', '');
    }
  }

  if (id === '4.1') {
    screenTimer = setTimeout(finishScan, 1500);
  }

  if (id === '4.2') {
    var last = items[items.length - 1];
    setHtml('extra-4.2', '<p class="big">+' + peso(last.value) + '</p>' +
      '<p class="info">' + last.name + '</p>' +
      '<p class="total">Total: ' + peso(total) + ' (' + itemCountText() + ')</p>');
  }

  if (id === '4.4') {
    if (items.length > 0) {
      setHtml('extra-4.4', '<p class="total">Total: ' + peso(total) + ' (' + itemCountText() + ')</p>');
    } else {
      setHtml('extra-4.4', '<p class="info">No items accepted yet.</p>');
    }
  }

  if (id === '5.0') {
    setText('status-5.0', 'Bin at ' + Math.round(m.binLevel) + '%');
  }

  if (id === '5.1') {
    screenTimer = setTimeout(finishCrushing, 3000);
  }

  if (id === '5.2') {
    setHtml('extra-5.2', '<p class="info">Accepted items: <b>' + items.length + '</b></p>' +
      '<p class="big">' + peso(total) + '</p>');
  }

  if (id === '6.0') {
    setupRewardScreen(data, m, user);
  }

  if (id === '6.1') {
    var amount = rewardType === 'cashout' ? cashoutAmount : total;
    setHtml('extra-6.1', '<p class="big">' + peso(amount) + '</p>');
    screenTimer = setTimeout(finishCoins, 2500);
  }

  if (id === '6.2') {
    var paid = rewardType === 'cashout' ? cashoutAmount : total;
    setHtml('extra-6.2', '<p class="big">' + peso(paid) + '</p>');
  }

  if (id === '6.3') {
    screenTimer = setTimeout(finishVoucher, 2000);
  }

  if (id === '6.4') {
    var seconds = 30;
    showVoucher(seconds);
    repeatTimer = setInterval(function () {
      seconds--;
      showVoucher(seconds);
      if (seconds <= 0) {
        showScreen('7.0');
      }
    }, 1000);
  }

  if (id === '6.5') {
    setText('desc-6.5', 'Your reward will be saved as points in your BOCOFI app. ' + data.settings.pointsPerPeso + ' points = ₱1.00.');
    setHtml('extra-6.5', '<p class="big">+' + sessionPoints(data) + ' points</p>');
  }

  if (id === '6.6') {
    setHtml('extra-6.6', '<p class="big">+' + sessionPoints(data) + ' points</p>' +
      '<p class="info">New balance: <b>' + user.points + ' points</b></p>');
  }

  if (id === '7.0') {
    var text = '';
    if (rewardType === 'cashout') text = 'Cash-out of ' + peso(cashoutAmount) + ' complete.';
    if (rewardType === 'coins') text = 'You recycled ' + itemCountText() + ' and got ' + peso(total) + ' in coins.';
    if (rewardType === 'wifi') text = 'You recycled ' + itemCountText() + ' and got ' + lastVoucher.minutes + ' minutes of Wi-Fi.';
    if (rewardType === 'save') text = 'You recycled ' + itemCountText() + ' and saved ' + sessionPoints(data) + ' points.';
    setHtml('extra-7.0', '<p class="info">' + text + '</p>');
    screenTimer = setTimeout(function () {
      showScreen('7.1');
    }, 10000);
  }

  if (id === '7.1') {
    screenTimer = setTimeout(endSession, 3000);
  }
}

// ---------- 2.x log in ----------

function chooseAccess(choice) {
  accessChoice = choice;
  document.getElementById('optionLogin').classList.toggle('selected', choice === 'login');
  document.getElementById('optionGuest').classList.toggle('selected', choice === 'guest');
  document.getElementById('accessBtn').disabled = false;
  setText('status-2.0', choice === 'login' ? 'Log in selected' : 'Guest selected');
}

function continueAccess() {
  if (accessChoice === 'login') {
    showScreen('2.1');
  } else if (accessChoice === 'guest') {
    isGuest = true;
    userId = null;
    showScreen('2.3');
  }
}

function makeLinkCode() {
  var data = loadData();

  var fresh = [];
  for (var i = 0; i < data.links.length; i++) {
    if (Date.now() - data.links[i].created < 5 * 60 * 1000) {
      fresh.push(data.links[i]);
    }
  }
  data.links = fresh;

  linkCode = makeCode('', 4);
  data.links.push({ code: linkCode, machineId: machineId, userId: null, created: Date.now() });
  saveData(data);

  setText('linkCode', linkCode);
  setText('linkError', '');
  drawQR();
}

function checkLink() {
  var data = loadData();
  var link = findLink(data, linkCode);
  if (link && link.userId) {
    userId = link.userId;
    isGuest = false;
    showScreen('2.2');
  }
}

function scanCode() {
  var data = loadData();
  var link = findLink(data, linkCode);
  if (!link) {
    setText('linkError', 'Code expired. Go back and try again.');
    return;
  }
  link.userId = data.loggedInUser || data.users[0].id;
  saveData(data);
  checkLink();
}

function cancelLink() {
  removeLinkCode();
  showScreen('2.0');
}

function removeLinkCode() {
  if (!linkCode) return;
  var data = loadData();
  data.links = data.links.filter(function (l) {
    return l.code !== linkCode;
  });
  saveData(data);
  linkCode = null;
}

function unlinkUser() {
  removeLinkCode();
  userId = null;
  showScreen('2.0');
}

function drawQR() {
  var canvas = document.getElementById('qrCanvas');
  var ctx = canvas.getContext('2d');
  var size = 29;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'black';

  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var corner = (x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9);
      if (!corner && Math.random() > 0.55) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  drawCorner(ctx, 0, 0);
  drawCorner(ctx, size - 7, 0);
  drawCorner(ctx, 0, size - 7);
}

function drawCorner(ctx, x, y) {
  ctx.fillStyle = 'black';
  ctx.fillRect(x, y, 7, 7);
  ctx.fillStyle = 'white';
  ctx.fillRect(x + 1, y + 1, 5, 5);
  ctx.fillStyle = 'black';
  ctx.fillRect(x + 2, y + 2, 3, 3);
}

// ---------- 3.x machine check ----------

function goBackFromCheck() {
  if (isGuest) {
    showScreen('2.3');
  } else {
    showScreen('2.2');
  }
}

function checkRewards() {
  var data = loadData();
  var m = getMachine(data);
  var coinsOk = canGiveCoins(data, m);
  var wifiOk = canGiveWifi(m);

  if (m.status !== 'online' || isBinFull(data, m) || !coinsOk || !wifiOk) {
    showScreen('3.3');
  } else {
    showScreen('4.0');
  }
}

function afterNoReward() {
  var data = loadData();
  var m = getMachine(data);
  var noReward = !canGiveCoins(data, m) && !canGiveWifi(m) && !userId;

  if (noReward || isBinFull(data, m) || m.status !== 'online') {
    showScreen('7.1');
  } else {
    showScreen('4.0');
  }
}

// ---------- 4.x inserting items ----------

function backFromInsert() {
  if (items.length > 0) {
    showScreen('4.4');
  } else {
    showScreen('3.2');
  }
}

function openIntake() {
  var data = loadData();
  var m = getMachine(data);
  var itemId = document.getElementById('itemSelect').value;

  if (isBinFull(data, m)) {
    showMessage('The bin is full. Cannot accept more items.');
    return;
  }

  pendingItem = null;
  for (var i = 0; i < data.items.length; i++) {
    if (data.items[i].id === itemId) {
      pendingItem = data.items[i];
    }
  }
  showScreen('4.1');
}

function finishScan() {
  if (pendingItem === null) {
    showScreen('4.3');
    return;
  }

  items.push({ name: pendingItem.name, value: pendingItem.value });
  total = round2(total + pendingItem.value);

  var data = loadData();
  var m = getMachine(data);
  m.binLevel = Math.min(100, round2(m.binLevel + 1.5));
  saveData(data);

  showScreen('4.2');
}

function finishSession() {
  if (items.length === 0) {
    showScreen('7.1');
    return;
  }

  var data = loadData();
  var m = getMachine(data);
  if (m.binLevel >= data.settings.binCrushLevel) {
    showScreen('5.0');
  } else {
    showScreen('5.2');
  }
}

// ---------- 5.x bin ----------

function finishCrushing() {
  var data = loadData();
  var m = getMachine(data);
  addAlert(data, m.id, 'Bin reached ' + Math.round(m.binLevel) + '%. Crusher ran, please schedule a collection.', 'warning');
  m.binLevel = Math.round(m.binLevel * 0.55);
  saveData(data);
  showScreen('5.2');
}

// ---------- 6.x rewards ----------

function setupRewardScreen(data, m, user) {
  var hasItems = items.length > 0;

  rewardType = null;
  document.getElementById('coinsBtn').disabled = !(hasItems && canGiveCoins(data, m));
  document.getElementById('wifiBtn').disabled = !(hasItems && canGiveWifi(m));
  document.getElementById('saveBtn').disabled = !(hasItems && user);
  document.getElementById('coinsBtn').classList.remove('selected');
  document.getElementById('wifiBtn').classList.remove('selected');
  document.getElementById('saveBtn').classList.remove('selected');
  document.getElementById('rewardBtn').disabled = true;

  setText('coinsInfo', canGiveCoins(data, m) ? peso(total) : 'Not available');
  setText('wifiInfo', canGiveWifi(m) ? sessionMinutes(data) + ' minutes' : 'Not available');
  setText('saveInfo', user ? '+' + sessionPoints(data) + ' points' : 'Log in to save');
  setText('status-6.0', 'Select reward');

  document.getElementById('cashoutInput').value = '';
  setText('cashoutError', '');
}

function chooseReward(type) {
  rewardType = type;
  document.getElementById('coinsBtn').classList.toggle('selected', type === 'coins');
  document.getElementById('wifiBtn').classList.toggle('selected', type === 'wifi');
  document.getElementById('saveBtn').classList.toggle('selected', type === 'save');
  document.getElementById('rewardBtn').disabled = false;

  var names = { coins: 'Coins selected', wifi: 'Wi-Fi selected', save: 'Save selected' };
  setText('status-6.0', names[type]);
}

function continueReward() {
  if (rewardType === 'coins') showScreen('6.1');
  if (rewardType === 'wifi') showScreen('6.3');
  if (rewardType === 'save') showScreen('6.5');
}

function redeemCashout() {
  var data = loadData();
  var m = getMachine(data);
  var code = document.getElementById('cashoutInput').value.trim().toUpperCase();
  var c = findCashout(data, code);

  if (code === '') {
    setText('cashoutError', 'Please enter your code.');
  } else if (!c) {
    setText('cashoutError', 'Code not found.');
  } else if (cashoutStatus(c) !== 'pending') {
    setText('cashoutError', 'This code is already ' + cashoutStatus(c) + '.');
  } else if (!canGiveCoins(data, m)) {
    setText('cashoutError', 'This machine has no coins right now.');
  } else {
    rewardType = 'cashout';
    cashoutCode = code;
    cashoutAmount = c.amount;
    showScreen('6.1');
  }
}

function finishCoins() {
  var data = loadData();
  var m = getMachine(data);

  if (rewardType === 'cashout') {
    var c = findCashout(data, cashoutCode);
    c.status = 'paid';
    c.paidAt = Date.now();
    c.machineId = m.id;
    m.coinLevel = Math.max(0, round2(m.coinLevel - cashoutAmount * 2));
    m.totalPaid = round2(m.totalPaid + cashoutAmount);
    addTransaction(data, { machineId: m.id, userId: c.userId, type: 'cashout-paid', items: 0, amount: cashoutAmount, code: cashoutCode });
  } else {
    m.coinLevel = Math.max(0, round2(m.coinLevel - total * 2));
    m.totalPaid = round2(m.totalPaid + total);
    m.totalItems += items.length;
    addTransaction(data, { machineId: m.id, userId: userId, type: 'coins', items: items.length, amount: total });
    var user = findUser(data, userId);
    if (user) user.itemsRecycled += items.length;
  }

  saveData(data);
  showScreen('6.2');
}

function finishVoucher() {
  var data = loadData();
  var m = getMachine(data);
  var minutes = sessionMinutes(data);

  lastVoucher = {
    code: makeCode('WF-', 4),
    password: makeCode('', 6),
    minutes: minutes,
    userId: userId,
    machineId: m.id,
    created: Date.now(),
    expires: Date.now() + data.settings.voucherHours * 60 * 60 * 1000,
    used: false
  };
  data.vouchers.push(lastVoucher);
  addTransaction(data, { machineId: m.id, userId: userId, type: 'wifi', items: items.length, amount: total, minutes: minutes, code: lastVoucher.code });

  m.totalItems += items.length;
  var user = findUser(data, userId);
  if (user) user.itemsRecycled += items.length;

  saveData(data);
  showScreen('6.4');
}

function showVoucher(seconds) {
  setHtml('extra-6.4', '<p class="info">Wi-Fi name: <b>BOCOFI Free WiFi</b></p>' +
    '<p class="info">Code: <b class="code">' + lastVoucher.code + '</b></p>' +
    '<p class="info">Password: <b class="code">' + lastVoucher.password + '</b></p>' +
    '<p class="info">Good for ' + lastVoucher.minutes + (lastVoucher.minutes === 1 ? ' minute' : ' minutes') + '. This screen closes in ' + seconds + ' seconds.</p>');
}

function savePoints() {
  var data = loadData();
  var m = getMachine(data);
  var user = findUser(data, userId);
  var points = sessionPoints(data);

  user.points += points;
  user.itemsRecycled += items.length;
  m.totalItems += items.length;
  addTransaction(data, { machineId: m.id, userId: user.id, type: 'save', items: items.length, amount: total, points: points });

  saveData(data);
  showScreen('6.6');
}

// ---------- 7.x end ----------

function endSession() {
  removeLinkCode();
  userId = null;
  isGuest = false;
  accessChoice = null;
  items = [];
  total = 0;
  pendingItem = null;
  rewardType = null;
  cashoutCode = '';
  cashoutAmount = 0;
  lastVoucher = null;
  alertSent = false;
  showScreen('1.0');
}

// ---------- 1.2 are you still there ----------

function resetIdleTimer() {
  clearTimeout(idleTimer);
  if (currentScreen === '1.0' || currentScreen === '1.2' || currentScreen === '7.1') return;

  idleTimer = setTimeout(askStillThere, 60000);
}

function askStillThere() {
  lastScreen = currentScreen;
  hideAllScreens();
  document.getElementById('screen-1.2').classList.add('active');
  currentScreen = '1.2';

  var seconds = 15;
  setText('stillSeconds', seconds);
  stillTimer = setInterval(function () {
    seconds--;
    setText('stillSeconds', seconds);
    if (seconds <= 0) {
      clearInterval(stillTimer);
      showScreen('7.1');
    }
  }, 1000);
}

function stillHere() {
  clearInterval(stillTimer);
  hideAllScreens();
  document.getElementById('screen-' + lastScreen).classList.add('active');
  currentScreen = lastScreen;
  resetIdleTimer();
}

document.addEventListener('click', function () {
  if (currentScreen !== '1.2') resetIdleTimer();
});

// ---------- side menu ----------

function openMenu() {
  var data = loadData();
  var m = getMachine(data);
  var select = document.getElementById('machineSelect');

  select.innerHTML = '';
  for (var i = 0; i < data.machines.length; i++) {
    var option = document.createElement('option');
    option.value = data.machines[i].id;
    option.textContent = data.machines[i].id + ' ' + data.machines[i].name;
    if (data.machines[i].id === machineId) option.selected = true;
    select.appendChild(option);
  }

  document.getElementById('binRange').value = m.binLevel;
  setText('binValue', Math.round(m.binLevel));
  document.getElementById('coinRange').value = m.coinLevel;
  setText('coinValue', Math.round(m.coinLevel));
  document.getElementById('wifiSelect').value = m.wifiSignal;

  document.getElementById('menu').classList.remove('hidden');
}

function closeMenu() {
  document.getElementById('menu').classList.add('hidden');
}

function changeMachine() {
  machineId = document.getElementById('machineSelect').value;
  localStorage.setItem('bocofi_kiosk_machine', machineId);
  endSession();
  openMenu();
}

function updateSensors() {
  var data = loadData();
  var m = getMachine(data);
  m.binLevel = Number(document.getElementById('binRange').value);
  m.coinLevel = Number(document.getElementById('coinRange').value);
  m.wifiSignal = document.getElementById('wifiSelect').value;
  saveData(data);

  setText('binValue', m.binLevel);
  setText('coinValue', m.coinLevel);
}

window.addEventListener('storage', function () {
  if (currentScreen === '1.0') {
    setupScreen('1.0');
  }
});

if (!findMachine(loadData(), machineId)) {
  machineId = 'BCF-001';
}
showScreen('1.0');
