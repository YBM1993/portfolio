import { createState, restoreState, dayKey, recentDays, parsePacket, receivePacket, addSteps, PhoneStepDetector } from './core.js';

const $ = selector => document.querySelector(selector);
const format = value => new Intl.NumberFormat('ru-RU').format(value);
const STORAGE_KEY = 'stepx-web-v1';
let state;
let storageOK = true;
try { state = restoreState(localStorage.getItem(STORAGE_KEY)); }
catch { state = createState(); storageOK = false; }
let currentTab = 'today';
let running = false;
let busy = false;
let demoTimer;
let motionTimeout;
let lastMotion = 0;
let wakeLock;
let connected = false;
let device;
let characteristic;
let epoch = 0;
let lastSync;
let sensorError = '';
let feedback = '';
let toastTimer;
const detector = new PhoneStepDetector();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { storageOK = false; }
  $('#storage-warning').hidden = storageOK;
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function modeName() { return { demo: 'ДЕМО', phone: 'ТЕЛЕФОН', bracelet: 'БРАСЛЕТ' }[state.mode]; }
function countFor(key) { return state.sources[state.mode].days[key] || 0; }

function render() {
  const now = new Date();
  const steps = countFor(dayKey(now));
  const percent = Math.floor(steps / state.goal * 100);
  $('#date-label').textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  $('#page-title').innerHTML = currentTab === 'today' ? 'Ваш ритм<span>.</span>' : 'Ваша история<span>.</span>';
  $('#today-view').hidden = currentTab !== 'today';
  $('#history-view').hidden = currentTab !== 'history';
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === currentTab));
  $('#step-count').textContent = format(steps);
  $('#goal-label').textContent = format(state.goal);
  $('#percent-label').textContent = `${percent}%`;
  $('#ring-progress').style.strokeDashoffset = 100 - Math.min(100, percent);
  $('#goal-fill').style.width = `${Math.min(100, percent)}%`;
  $('#goal-status').textContent = steps >= state.goal ? 'Цель достигнута ✓' : 'В своём темпе';
  $('#motivator').textContent = steps >= state.goal ? 'Отличный день для движения!' : 'Каждый шаг имеет значение';
  $('#mode-badge').textContent = modeName();
  $('#history-source-label').textContent = `${modeName()} · ОТДЕЛЬНАЯ ИСТОРИЯ`;
  $('#mode-description').textContent = {
    demo: 'Пример данных · проверка интерфейса',
    phone: 'Датчик телефона · экспериментальный подсчёт',
    bracelet: 'Реальные данные браслета XIAO'
  }[state.mode];
  $('#add-steps').hidden = state.mode !== 'demo';
  $('#bracelet-guide').hidden = state.mode !== 'bracelet';
  $('#primary-action').disabled = busy;
  $('#connection-dot').classList.toggle('on', !sensorError && (connected || running));
  $('#source-icon use').setAttribute('href', { demo: '#i-walk', phone: '#i-phone', bracelet: '#i-bt' }[state.mode]);
  let action;
  if (state.mode === 'demo') {
    $('#source-title').textContent = 'Попробуйте StepX';
    $('#connection-status').textContent = running ? 'Виртуальная прогулка идёт' : 'Браслет не требуется';
    $('#source-help').textContent = 'Запустите виртуальную прогулку и посмотрите, как меняется ваш прогресс.';
    $('#sync-label').textContent = 'Тестовые шаги хранятся отдельно от настоящих.';
    action = running ? 'Приостановить прогулку' : 'Начать прогулку';
  } else if (state.mode === 'phone') {
    $('#source-title').textContent = 'Датчик вашего телефона';
    $('#connection-status').textContent = feedback || (running ? 'Считаем · держите страницу открытой' : 'Нужно разрешение на движение');
    $('#source-help').textContent = 'После запуска подержите телефон спокойно 2 секунды, затем пройдите 20–30 шагов. Экран должен оставаться включённым.';
    $('#sync-label').textContent = 'Это тестовый алгоритм, не системный шагомер Apple. Возможны пропуски и ложные шаги.';
    action = busy ? 'Запрашиваем разрешение…' : running ? 'Остановить подсчёт' : 'Включить датчик телефона';
  } else {
    const supported = !!navigator.bluetooth?.requestDevice && window.isSecureContext;
    $('#source-title').textContent = device?.name || 'Браслет XIAO Sense';
    $('#connection-status').textContent = sensorError || feedback || (connected ? 'Подключён · получаем шаги' : supported ? 'Готов к подключению' : 'В этом браузере Bluetooth недоступен');
    $('#source-help').textContent = supported
      ? 'Включите плату с прошивкой StepX. Выберите XIAO StepX в списке Bluetooth-устройств.'
      : 'В обычном Safari подключение к браслету не работает. Для iPhone нужен BLE-браузер, например Bluefy. Для теста без платы выберите «Датчик телефона».';
    $('#sync-label').textContent = lastSync
      ? `Обновлено ${lastSync.toLocaleTimeString('ru-RU')} · шаги без связи относятся к дню синхронизации.`
      : 'Браслет считает без телефона. При выключении платы несинхронизированные шаги теряются.';
    action = busy ? 'Подключаемся…' : connected ? 'Отключить браслет' : supported ? 'Подключить браслет' : 'Выбрать другой режим';
  }
  $('#primary-action').innerHTML = `<span>${action}</span><svg aria-hidden="true"><use href="#i-arrow"/></svg>`;
  $('#tip-title').textContent = state.mode === 'phone' ? 'Проверим на практике.' : 'Найдите свой темп.';
  $('#tip-copy').textContent = state.mode === 'phone'
    ? 'Сравните результат с шагами, отсчитанными вручную. Первые три шага появляются после подтверждения серии.'
    : 'Начните с небольшой прогулки. Сегодня важен следующий шаг, а не рекорд.';
  $('#week-note').textContent = state.mode === 'demo' ? 'Демонстрационные данные' : state.mode === 'phone' ? 'Датчик телефона' : 'Синхронизации с браслетом';
  $('#storage-warning').hidden = storageOK;
  document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('selected', button.dataset.mode === state.mode));
  renderChart(now);
  renderHistory(now);
}

function renderChart(now) {
  const days = recentDays(7, now);
  const maximum = Math.max(state.goal, ...days.map(day => countFor(day.key)), 1);
  $('#week-total').textContent = `${format(days.reduce((sum, day) => sum + countFor(day.key), 0))} шагов`;
  $('#week-chart').innerHTML = days.map(day => {
    const count = countFor(day.key);
    const today = day.key === dayKey(now);
    return `<div class="bar-column ${today ? 'today' : ''}" role="img" aria-label="${day.date.toLocaleDateString('ru-RU')}: ${count} шагов"><span class="bar-value">${format(count)}</span><div class="bar-track"><div class="bar-fill" style="height:${Math.max(0, count / maximum * 100)}%"></div></div><span class="bar-label">${today ? 'Сегодня' : day.date.toLocaleDateString('ru-RU', { weekday: 'short' })}</span></div>`;
  }).join('');
}

function renderHistory(now) {
  $('#history-list').innerHTML = recentDays(14, now).reverse().map(day => {
    const count = countFor(day.key);
    return `<div class="history-row"><div>${day.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}<small>${day.key === dayKey(now) ? 'Сегодня' : day.date.toLocaleDateString('ru-RU', { weekday: 'long' })}</small></div><div class="mini-track" aria-hidden="true"><span style="width:${Math.min(100, count / state.goal * 100)}%"></span></div><strong>${format(count)} шагов</strong></div>`;
  }).join('');
}

function updateSteps(count, mode = state.mode) { addSteps(state, mode, count); save(); render(); }

function stopPhone() {
  window.removeEventListener('devicemotion', onMotion);
  clearTimeout(motionTimeout);
  detector.reset();
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

function stopEverything() {
  epoch++;
  clearInterval(demoTimer);
  stopPhone();
  if (characteristic) characteristic.removeEventListener('characteristicvaluechanged', onBLEValue);
  characteristic = null;
  if (device?.gatt?.connected) device.gatt.disconnect();
  device = null;
  connected = false;
  running = false;
  busy = false;
  feedback = ''; sensorError = ''; lastSync = null;
}

function chooseMode(mode) {
  stopEverything();
  state.mode = mode;
  save(); render();
  $('#source-dialog').close();
}

function onMotion(event) {
  if (state.mode !== 'phone' || !running) return;
  const acceleration = event.accelerationIncludingGravity;
  if (!acceleration || ![acceleration.x, acceleration.y, acceleration.z].every(value => typeof value === 'number' && Number.isFinite(value))) return;
  const now = performance.now();
  if (lastMotion && now - lastMotion < 10) return;
  lastMotion = now;
  clearTimeout(motionTimeout);
  motionTimeout = setTimeout(() => {
    if (!running || state.mode !== 'phone') return;
    stopPhone(); running = false; feedback = 'Данные датчика перестали приходить. Запустите снова.'; render();
  }, 8000);
  const count = detector.update(Math.hypot(acceleration.x, acceleration.y, acceleration.z) / 9.80665, now);
  if (feedback) { feedback = ''; render(); }
  if (count) updateSteps(count, 'phone');
}

async function startPhone() {
  if (!window.isSecureContext) { feedback = 'Для датчика откройте HTTPS-ссылку сайта.'; render(); return; }
  if (typeof DeviceMotionEvent === 'undefined') { feedback = 'Устройство не предоставляет датчик движения.'; render(); return; }
  const token = ++epoch;
  busy = true; feedback = ''; render();
  try {
    // Permission must be requested directly from this button's user gesture.
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== 'granted') throw new Error('Разрешение на движение не получено. Проверьте настройки Safari для этого сайта.');
    }
    if (token !== epoch) return;
    detector.reset(); lastMotion = 0; running = true;
    feedback = 'Подержите телефон спокойно 2 секунды';
    window.addEventListener('devicemotion', onMotion, { passive: true });
    motionTimeout = setTimeout(() => {
      if (token !== epoch || lastMotion) return;
      stopPhone(); running = false; feedback = 'Нет данных датчика. Откройте сайт в Safari на настоящем iPhone.'; render();
    }, 8000);
    if (navigator.wakeLock?.request) {
      navigator.wakeLock.request('screen').then(lock => {
        if (token === epoch && running && !document.hidden) wakeLock = lock;
        else lock.release().catch(() => {});
      }).catch(() => {});
    }
  } catch (error) {
    if (token === epoch) feedback = error.message || 'Не удалось включить датчик.';
  } finally {
    if (token === epoch) { busy = false; render(); }
  }
}

function onBLEValue(event) {
  if (state.mode !== 'bracelet' || !device || event.target !== characteristic) return;
  const text = new TextDecoder().decode(event.target.value);
  if (text === 'E:IMU' || text === 'E:READ') {
    sensorError = text === 'E:IMU' ? 'Датчик IMU не найден. Проверьте версию Sense.' : 'Ошибка чтения датчика. Ожидаем восстановления.';
    render(); return;
  }
  const packet = parsePacket(text);
  if (!packet) {
    sensorError = 'Нужна прошивка StepX из комплекта. Строки AX/AY/AZ шаги не содержат.';
    render(); return;
  }
  sensorError = ''; feedback = '';
  lastSync = new Date();
  receivePacket(state, device.id, packet, lastSync);
  save(); render();
}

async function connectBracelet() {
  const token = ++epoch;
  busy = true; feedback = ''; sensorError = ''; render();
  let timeout;
  let selected;
  try {
    // Do not put a timer on the system chooser: the user may take time to select.
    selected = await navigator.bluetooth.requestDevice({ filters: [{ services: ['12345678-1234-5678-1234-56789abcdef0'] }] });
    if (token !== epoch) return;
    device = selected;
    selected.addEventListener('gattserverdisconnected', () => {
      if (device !== selected || token !== epoch) return;
      if (characteristic) characteristic.removeEventListener('characteristicvaluechanged', onBLEValue);
      characteristic = null; connected = false;
      feedback = 'Связь потеряна. Подключитесь снова для синхронизации.'; render();
    }, { once: true });
    const setup = async () => {
      const server = await selected.gatt.connect();
      if (token !== epoch) { selected.gatt.disconnect(); return; }
      const service = await server.getPrimaryService('12345678-1234-5678-1234-56789abcdef0');
      if (token !== epoch) return;
      const telemetry = await service.getCharacteristic('12345678-1234-5678-1234-56789abcdef1');
      if (token !== epoch) return;
      characteristic = telemetry;
      characteristic.addEventListener('characteristicvaluechanged', onBLEValue);
      await characteristic.startNotifications();
      if (token !== epoch) return;
      connected = true;
      await characteristic.readValue(); // Also dispatches characteristicvaluechanged.
    };
    await Promise.race([setup(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Браслет не ответил. Проверьте питание и прошивку.')), 20000); })]);
  } catch (error) {
    if (token !== epoch) return;
    feedback = error.name === 'NotFoundError' ? 'Выбор устройства отменён или браслет не найден.' : error.message || 'Подключение не удалось.';
    if (characteristic) characteristic.removeEventListener('characteristicvaluechanged', onBLEValue);
    characteristic = null;
    if (selected?.gatt?.connected) selected.gatt.disconnect();
    connected = false;
    // Invalidate a connection attempt which might still settle after a timeout.
    epoch++;
    busy = false;
  } finally {
    clearTimeout(timeout);
    if (token === epoch) busy = false;
    render();
  }
}

$('#primary-action').addEventListener('click', () => {
  if (busy) return;
  if (state.mode === 'demo') {
    running = !running;
    clearInterval(demoTimer);
    if (running) demoTimer = setInterval(() => { if (!document.hidden && state.mode === 'demo') updateSteps(2, 'demo'); }, 1000);
    render();
  } else if (state.mode === 'phone') {
    if (running) { epoch++; stopPhone(); running = false; feedback = 'Подсчёт приостановлен'; render(); }
    else startPhone();
  } else if (connected) { stopEverything(); feedback = 'Браслет отключён'; render(); }
  else if (!navigator.bluetooth?.requestDevice || !window.isSecureContext) $('#source-dialog').showModal();
  else connectBracelet();
});
$('#add-steps').addEventListener('click', () => { if (state.mode === 'demo') updateSteps(100, 'demo'); });
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  currentTab = button.dataset.tab; render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}));
document.querySelector('.brand').addEventListener('click', () => { currentTab = 'today'; render(); });
$('#settings-open').addEventListener('click', () => { $('#goal-input').value = state.goal; $('#settings-dialog').showModal(); });
$('#source-open').addEventListener('click', () => $('#source-dialog').showModal());
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('[data-goal]').forEach(button => button.addEventListener('click', () => { $('#goal-input').value = button.dataset.goal; }));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => chooseMode(button.dataset.mode)));
$('#goal-form').addEventListener('submit', event => {
  event.preventDefault();
  const value = Number($('#goal-input').value);
  if (!Number.isInteger(value) || value < 1000 || value > 50000) return;
  state.goal = value; save(); render(); $('#settings-dialog').close(); toast('Дневная цель сохранена');
});
$('#export-data').addEventListener('click', () => {
  const rows = Object.entries(state.sources[state.mode].days).sort(([a], [b]) => b.localeCompare(a));
  const csv = '\uFEFFдата;шаги;источник\r\n' + rows.map(([date, count]) => `${date};${count};${state.mode}`).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = `stepx-${state.mode}-${dayKey()}.csv`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Экспортирована история выбранного режима');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (running || (busy && state.mode === 'phone'))) {
    epoch++; clearInterval(demoTimer); stopPhone(); running = false; busy = false;
    feedback = 'Страница была скрыта. Запустите подсчёт снова.';
  }
  render();
});
window.addEventListener('pagehide', () => { clearInterval(demoTimer); stopPhone(); save(); });
setInterval(render, 30000); // Refresh date/day boundaries while the tab stays open.
save(); render();
