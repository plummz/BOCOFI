// BOCO-FI Kiosk
// The screen numbers follow our Figma flow (1.0 Display Page up to 7.1 Resetting Machine)

var screenNames = {
  '1.0': 'Display Page', '1.1': 'Start',
  '2.0': 'Access Page', '2.1': 'QR Code', '2.2': 'Account Linking', '2.3': 'Guest Limits',
  '3.0': 'Check WiFi Status', '3.1': 'Check Coin Status', '3.2': 'Check Reward Status', '3.3': 'No Reward Status',
  '4.0': 'Insert Item', '4.1': 'Scan Item', '4.2': 'Item Accepted', '4.3': 'Decline Item', '4.4': 'Add Item?',
  '5.0': 'Bin Status', '5.1': 'Crusher Status', '5.2': 'Session Status',
  '6.0': 'Reward Choice', '6.1': 'Coin Dispense', '6.2': 'Coin Reward Release', '6.3': 'Generate WiFi Voucher',
  '6.4': 'WiFi Voucher Release', '6.5': 'Keep Reward As Balance', '6.6': 'Reward Balance Saved',
  '7.0': 'Thank You Page', '7.1': 'Resetting Machine'
};

// which machine this kiosk is
var machineId = localStorage.getItem('bocofi_kiosk_machine') || 'BCF-001';

// current session
var currentScreen = '1.0';
var userId = null;
var isGuest = false;
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

function showScreen(id) {
  clearTimeout(screenTimer);
  clearInterval(repeatTimer);

  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) {
    screens[i].classList.remove('active');
  }
  document.getElementById('screen-' + id).classList.add('active');
  currentScreen = id;

  // footer
  var phase = parseInt(id.charAt(0));
  document.getElementById('stepLabel').textContent = id + ' ' + screenNames[id];
  document.getElementById('progress').style.width = (phase / 7 * 100) + '%';

  setupScreen(id);
  updateHeader();
}

function updateHeader() {
  var data = loadData();
  var label = document.getElementById('userLabel');
  var user = findUser(data, userId);

  if (user) {
    label.textContent = user.name;
  } else if (isGuest) {
    label.textContent = 'Guest';
  } else {
    label.textContent = 'Not logged in';
  }

  var m = getMachine(data);
  document.getElementById('machineLabel').textContent = m.id + ' ' + m.name;
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

// runs every time a screen is shown
function setupScreen(id) {
  var data = loadData();
  var m = getMachine(data);
  var user = findUser(data, userId);

  if (id === '1.0') {
    var startBtn = document.getElementById('startBtn');
    if (m.status !== 'online') {
      startBtn.disabled = true;
      document.getElementById('startError').textContent = 'This machine is under ' + m.status + '. Please use another machine.';
    } else {
      startBtn.disabled = false;
      document.getElementById('startError').textContent = '';
    }
  }

  if (id === '1.1') {
    document.getElementById('readyText').textContent = 'Connected to ' + m.name + '. Press start to begin.';
  }

  if (id === '2.1') {
    makeLinkCode();
    repeatTimer = setInterval(checkLink, 1000);
  }

  if (id === '2.2') {
    document.getElementById('welcomeName').textContent = user.name.split(' ')[0];
    document.getElementById('welcomePoints').textContent = user.points;
  }

  if (id === '2.3') {
    var hasReward = canGiveCoins(data, m) || canGiveWifi(m);
    document.getElementById('guestRewards').textContent = hasReward ? 'Available' : 'Not available';
  }

  if (id === '3.0') {
    var signal = { strong: 'Strong', weak: 'Weak', none: 'No signal' };
    document.getElementById('wifiStatus').textContent = signal[m.wifiSignal];
  }

  if (id === '3.1') {
    document.getElementById('coinBar').style.width = m.coinLevel + '%';
    if (canGiveCoins(data, m)) {
      document.getElementById('coinText').textContent = m.coinLevel + '% - enough coins';
    } else {
      document.getElementById('coinText').textContent = m.coinLevel + '% - coins are running out';
    }
  }

  if (id === '3.2') {
    var coinsOk = canGiveCoins(data, m);
    var wifiOk = canGiveWifi(m);
    var html = '';
    html += '<p>Coins: ' + (coinsOk ? '<b class="green-text">Available</b>' : '<b class="red-text">Not available</b>') + '</p>';
    html += '<p>Wi-Fi voucher: ' + (wifiOk ? '<b class="green-text">Available</b>' : '<b class="red-text">Not available</b>') + '</p>';
    if (user) {
      html += '<p>Save to account: <b class="green-text">Available</b></p>';
    }
    document.getElementById('rewardList').innerHTML = html;

    // tell the owner if something is not working
    if (!alertSent && (!coinsOk || !wifiOk)) {
      if (!coinsOk) addAlert(data, m.id, 'Coin hopper is low. Users can only get Wi-Fi or save points.', 'warning');
      if (!wifiOk) addAlert(data, m.id, 'Wi-Fi is not available. Users can only get coins or save points.', 'warning');
      saveData(data);
      alertSent = true;
    }
  }

  if (id === '3.3') {
    var reason = 'Coins and Wi-Fi vouchers are not available right now.';
    if (isBinFull(data, m)) reason = 'The bin is full.';
    document.getElementById('noRewardText').textContent = reason + ' Please try another machine.';
    addAlert(data, m.id, 'No rewards available. A user was turned away.', 'critical');
    saveData(data);
  }

  if (id === '4.0') {
    var buttons = '';
    for (var i = 0; i < data.items.length; i++) {
      var item = data.items[i];
      buttons += '<button class="btn btn-white btn-small" onclick="insertItem(\'' + item.id + '\')">' + item.name + ' (' + peso(item.value) + ')</button> ';
    }
    document.getElementById('itemButtons').innerHTML = buttons;

    if (items.length > 0) {
      document.getElementById('insertTotal').textContent = 'Total: ' + peso(total) + ' (' + itemCountText() + ')';
      document.getElementById('claimBtn').classList.remove('hidden');
      document.getElementById('cancelBtn').classList.add('hidden');
    } else {
      document.getElementById('insertTotal').textContent = '';
      document.getElementById('claimBtn').classList.add('hidden');
      document.getElementById('cancelBtn').classList.remove('hidden');
    }
  }

  if (id === '4.1') {
    // fake scanning time
    screenTimer = setTimeout(finishScan, 1500);
  }

  if (id === '4.2') {
    var last = items[items.length - 1];
    document.getElementById('acceptedName').textContent = last.name;
    document.getElementById('acceptedValue').textContent = '+' + peso(last.value);
    document.getElementById('acceptedTotal').textContent = 'Total: ' + peso(total) + ' (' + itemCountText() + ')';
  }

  if (id === '4.4') {
    if (items.length > 0) {
      document.getElementById('tryAgainText').textContent = 'You have ' + itemCountText() + ' worth ' + peso(total) + '.';
    } else {
      document.getElementById('tryAgainText').textContent = 'No items accepted yet.';
    }
  }

  if (id === '5.0') {
    document.getElementById('binBar').style.width = m.binLevel + '%';
    document.getElementById('binText').textContent = 'Bin is at ' + Math.round(m.binLevel) + '%. The crusher will make more space.';
  }

  if (id === '5.1') {
    screenTimer = setTimeout(finishCrushing, 3000);
  }

  if (id === '5.2') {
    document.getElementById('sessionTotal').textContent = 'Total: ' + peso(total) + ' (' + itemCountText() + ')';
  }

  if (id === '6.0') {
    setupRewardScreen(data, m, user);
  }

  if (id === '6.1') {
    var amount = rewardType === 'cashout' ? cashoutAmount : total;
    document.getElementById('dispenseAmount').textContent = peso(amount);
    screenTimer = setTimeout(finishCoins, 2500);
  }

  if (id === '6.2') {
    var paid = rewardType === 'cashout' ? cashoutAmount : total;
    document.getElementById('coinsAmount').textContent = peso(paid);
  }

  if (id === '6.3') {
    screenTimer = setTimeout(finishVoucher, 2000);
  }

  if (id === '6.4') {
    document.getElementById('voucherCode').textContent = lastVoucher.code;
    document.getElementById('voucherMinutes').textContent = lastVoucher.minutes;
    var seconds = 30;
    document.getElementById('voucherTimer').textContent = seconds;
    repeatTimer = setInterval(function () {
      seconds--;
      document.getElementById('voucherTimer').textContent = seconds;
      if (seconds <= 0) {
        showScreen('7.0');
      }
    }, 1000);
  }

  if (id === '6.5') {
    document.getElementById('savingPoints').textContent = '+' + sessionPoints(data) + ' pts';
    screenTimer = setTimeout(finishSave, 2000);
  }

  if (id === '6.6') {
    document.getElementById('savedPoints').textContent = '+' + sessionPoints(data) + ' pts';
    document.getElementById('newBalance').textContent = user.points + ' pts';
  }

  if (id === '7.0') {
    var text = '';
    if (rewardType === 'cashout') text = 'Your cash-out of ' + peso(cashoutAmount) + ' is complete.';
    if (rewardType === 'coins') text = 'You recycled ' + itemCountText() + ' and got ' + peso(total) + ' in coins.';
    if (rewardType === 'wifi') text = 'You recycled ' + itemCountText() + ' and got ' + lastVoucher.minutes + ' minutes of Wi-Fi.';
    if (rewardType === 'save') text = 'You recycled ' + itemCountText() + ' and saved ' + sessionPoints(data) + ' points.';
    document.getElementById('thanksText').textContent = text;
    screenTimer = setTimeout(endSession, 8000);
  }

  if (id === '7.1') {
    screenTimer = setTimeout(endSession, 3000);
  }
}

// ---------- 2.x log in ----------

function makeLinkCode() {
  var data = loadData();

  // remove old codes (older than 5 minutes)
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

  document.getElementById('linkCode').textContent = linkCode;
  document.getElementById('linkError').textContent = '';
  drawQR();
}

// checks if the app already used the code
function checkLink() {
  var data = loadData();
  var link = findLink(data, linkCode);
  if (link && link.userId) {
    userId = link.userId;
    isGuest = false;
    showScreen('2.2');
  }
}

// SCAN CODE button: acts like the phone scanned the QR
// it links the user logged in on the app (or the first user if no one is logged in)
function scanCode() {
  var data = loadData();
  var link = findLink(data, linkCode);
  if (!link) {
    document.getElementById('linkError').textContent = 'Code expired. Go back and try again.';
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

function startGuest() {
  isGuest = true;
  userId = null;
  showScreen('3.0');
}

// not a real QR code yet, just random squares for the design
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

function checkRewards() {
  var data = loadData();
  var m = getMachine(data);
  var noReward = !canGiveCoins(data, m) && !canGiveWifi(m) && !userId;

  if (m.status !== 'online' || isBinFull(data, m) || noReward) {
    showScreen('3.3');
  } else {
    showScreen('3.2');
  }
}

// ---------- 4.x inserting items ----------

function insertItem(itemId) {
  var data = loadData();
  var m = getMachine(data);

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

  // each item fills the bin a little
  var data = loadData();
  var m = getMachine(data);
  m.binLevel = Math.min(100, round2(m.binLevel + 1.5));
  saveData(data);

  showScreen('4.2');
}

function afterAccepted() {
  var data = loadData();
  var m = getMachine(data);
  if (m.binLevel >= data.settings.binCrushLevel) {
    showScreen('5.0');
  } else {
    showScreen('5.2');
  }
}

function noMoreItems() {
  if (items.length > 0) {
    showScreen('6.0');
  } else {
    showScreen('7.1');
  }
}

// ---------- 5.x bin ----------

function finishCrushing() {
  var data = loadData();
  var m = getMachine(data);
  addAlert(data, m.id, 'Bin reached ' + Math.round(m.binLevel) + '%. Crusher ran, please schedule a collection.', 'warning');
  m.binLevel = Math.round(m.binLevel * 0.55);
  saveData(data);
  showMessage('Crushing done');
  showScreen('5.2');
}

// ---------- 6.x rewards ----------

function setupRewardScreen(data, m, user) {
  var hasItems = items.length > 0;
  var coinsBtn = document.getElementById('coinsBtn');
  var wifiBtn = document.getElementById('wifiBtn');
  var saveBtn = document.getElementById('saveBtn');

  document.getElementById('rewardTotal').textContent = 'Total: ' + peso(total) + ' (' + itemCountText() + ')';

  coinsBtn.disabled = !(hasItems && canGiveCoins(data, m));
  wifiBtn.disabled = !(hasItems && canGiveWifi(m));
  saveBtn.disabled = !(hasItems && user);

  document.getElementById('coinsInfo').textContent = canGiveCoins(data, m) ? peso(total) : 'Not available';
  document.getElementById('wifiInfo').textContent = canGiveWifi(m) ? sessionMinutes(data) + ' minutes' : 'Not available';
  document.getElementById('saveInfo').textContent = user ? '+' + sessionPoints(data) + ' pts' : 'Log in to save';

  document.getElementById('cashoutInput').value = '';
  document.getElementById('cashoutError').textContent = '';
}

function chooseReward(type) {
  rewardType = type;
  if (type === 'coins') showScreen('6.1');
  if (type === 'wifi') showScreen('6.3');
  if (type === 'save') showScreen('6.5');
}

function redeemCashout() {
  var data = loadData();
  var m = getMachine(data);
  var code = document.getElementById('cashoutInput').value.trim().toUpperCase();
  var error = document.getElementById('cashoutError');
  var c = findCashout(data, code);

  if (code === '') {
    error.textContent = 'Please enter your code.';
  } else if (!c) {
    error.textContent = 'Code not found.';
  } else if (cashoutStatus(c) !== 'pending') {
    error.textContent = 'This code is already ' + cashoutStatus(c) + '.';
  } else if (!canGiveCoins(data, m)) {
    error.textContent = 'This machine has no coins right now.';
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

function finishSave() {
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

// go back to the start if nobody touches the screen for 90 seconds
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(function () {
    if (currentScreen !== '1.0') {
      endSession();
      showMessage('Session timed out');
    }
  }, 90000);
}
document.addEventListener('click', resetIdleTimer);

// ---------- side menu (for testing) ----------

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
  document.getElementById('binValue').textContent = Math.round(m.binLevel);
  document.getElementById('coinRange').value = m.coinLevel;
  document.getElementById('coinValue').textContent = Math.round(m.coinLevel);
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

  document.getElementById('binValue').textContent = m.binLevel;
  document.getElementById('coinValue').textContent = m.coinLevel;
}

// if the admin changes the machine in another tab, update the start screen
window.addEventListener('storage', function () {
  if (currentScreen === '1.0') {
    setupScreen('1.0');
  }
});

// start
if (!findMachine(loadData(), machineId)) {
  machineId = 'BCF-001';
}
showScreen('1.0');
resetIdleTimer();
