import {UUIDS,STROKES,MAX_MS,parseFrame,encodeCommand,formatTime,validForm,newPending,finishRecord,acceptFrame,acceptStats,parseStats,settingsOK,distanceText,restoreState,csv} from './swim2-core.js?v=turn2';

const $ = id => document.getElementById(id);
const KEY = 'swimband-v1';
let state, storageOK = true, corruptStorage = false;
try { state = restoreState(localStorage.getItem(KEY)); } catch (error) {
  state = restoreState(null); storageOK = false; corruptStorage = true;
  $('storage-error').hidden = false;
  $('storage-error').textContent = 'Не удалось открыть историю. Сохранение недоступно: ' + error.message;
}
let device = null, server = null, tx = null, rx = null, epoch = 0;
let connected = false, connecting = false, busy = false, frame = null, packetAt = 0;
let demoAt = 0, demoElapsed = 0, frozenMs = 0, lastShown = -1, wake = null, toastTimeout;
let commandQueue = Promise.resolve(), confirmationTimer;
let sx=null,turnFrame=null,turnAt=0;
const supported = !!navigator.bluetooth && window.isSecureContext;
if (state.pending?.mode === 'demo') {
  state.pending = null;
  notice('Демозаплыв был прерван закрытием страницы. Начните новый.');
}
function notice(message) { $('notice').textContent = message || ''; $('notice').hidden = !message; }
function toast(message) {
  clearTimeout(toastTimeout); $('toast').textContent = message; $('toast').hidden = false;
  toastTimeout = setTimeout(() => { $('toast').hidden = true; },5000);
}
function save() {
  if(corruptStorage)return false;
  try {
    localStorage.setItem(KEY,JSON.stringify(state)); storageOK = true;
    $('storage-error').hidden = true; return true;
  } catch (error) {
    storageOK = false; $('storage-error').hidden = false;
    $('storage-error').textContent = 'История не сохранилась в браузере. Скачайте CSV, чтобы сохранить результаты. ' + error.message;
    return false;
  }
}
save();
$('swimmer-name').value = state.form.name;
$('stroke').value = state.form.stroke;
$('distance').value = String(state.form.distance);
$('pool-length').value=String(state.turnSettings.pool);$('mount').value=state.turnSettings.mount;
$('minimum-length').value=String(state.turnSettings.minSec);
function rows() { return state.records.filter(r => r.mode === state.mode); }
function currentMs() {
  if (state.mode === 'demo') return demoAt ? Math.min(MAX_MS,Math.floor(performance.now()-demoAt)) : demoElapsed;
  if (!frame) return frozenMs;
  if (frame.state === 'R' && connected && performance.now()-packetAt < 2500)
    return Math.min(MAX_MS,frame.ms+Math.max(0,Math.floor(performance.now()-packetAt)));
  return frame.ms;
}
function paintClock() {
  const ms = currentMs(), tick = Math.floor(ms/10);
  if (tick !== lastShown) {
    $('timer').textContent = formatTime(ms);
    $('clock-hand').style.transform = 'rotate(' + ((ms/1000)%60)*6 + 'deg)';
    lastShown = tick;
  }
  if (demoAt && ms >= MAX_MS) finishDemo();
  requestAnimationFrame(paintClock);
}
for(let i=0;i<60;i++) {
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1','100'); line.setAttribute('x2','100');
  line.setAttribute('y1',i%5 ? '15':'12'); line.setAttribute('y2',i%5 ? '19':'22');
  line.setAttribute('transform','rotate('+i*6+' 100 100)'); line.setAttribute('class',i%5?'clock-tick':'clock-tick major');
  $('clock-ticks').append(line);
}
function renderHistory() {
  const list=rows(); $('history-body').replaceChildren();
  $('history-empty').hidden = !!list.length; $('history-scroll').hidden = !list.length;
  $('export').disabled = !list.length;
  $('history-count').textContent = list.length + ' заплывов';
  $('history-distance').textContent = list.reduce((sum,r)=>sum+(r.actualDistance||0),0)+' м · оценка датчика';
  $('history-source').textContent = state.mode === 'band' ? 'Данные браслета':'Демонстрация';
  for(const r of list) {
    const tr=document.createElement('tr');
    const cells=[r.name,STROKES[r.stroke]+' · '+distanceText(r),formatTime(r.durationMs),
      new Date(r.finishedAt).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})];
    cells.forEach((value,index)=>{const td=document.createElement('td');td.textContent=value;
      if(index===2)td.className='time-cell';if(index===3)td.className='date-cell';tr.append(td);});
    $('history-body').append(tr);
  }
  $('last-time').textContent = list[0] ? formatTime(list[0].durationMs):'—';
  $('last-detail').textContent = list[0] ? list[0].name+' · '+STROKES[list[0].stroke]+' · '+distanceText(list[0]):'Ваш первый результат появится здесь';
}
function render() {
  const demo=state.mode==='demo', pending=!!state.pending;
  const active=demo ? !!demoAt : connected && frame?.state==='R';
  const matched=state.pending?.deviceId===device?.id && state.pending?.run===frame?.run;
  const recorded=frame && state.records.some(r=>r.id==='band:'+device?.id+':'+frame.run);
  const fresh=connected && frame && performance.now()-packetAt<4000;
  $('mode-band').setAttribute('aria-pressed',String(!demo)); $('mode-demo').setAttribute('aria-pressed',String(demo));
  $('mode-band').disabled=$('mode-demo').disabled=pending||busy||connecting||active;
  $('mode-note').textContent=demo?'Деморежим: время считает сайт, записи помечены отдельно':'Результаты с вашего устройства';
  ['swimmer-name','stroke','distance','pool-length','mount','minimum-length'].forEach(id=>{$(id).disabled=pending||busy||active;});
  $('finish-at-wall').disabled=demo||busy;
  $('calibrate').disabled=demo||!connected||connecting||busy||pending||frame?.state==='R';
  const sameStats=!!turnFrame&&frame?.run===turnFrame.run&&frame?.state===turnFrame.state;
  const freshStats=connected&&turnFrame&&performance.now()-turnAt<4000;
  const healthText={O:'IMU готов · повороты считает плата',C:'Калибровка: держите неподвижно около 3 секунд',E:'IMU не найден / ошибка чтения. Проверьте модель Sense',D:'Был пропуск данных IMU. Итог может быть неполным'};
  $('sensor-status').textContent=demo?'Демо: датчик и повороты не используются':!connected?'Датчик не подключён':healthText[turnFrame?.health]||'Ждём данные IMU';
  $('sensor-status').classList.toggle('fault',['E','D'].includes(turnFrame?.health));
  const visible=!demo&&sameStats;
  $('turn-count').textContent=visible?String(turnFrame.turns):'—';
  $('actual-distance').textContent=visible?'≈ '+((turnFrame.turns+(turnFrame.finalLength?1:0))*turnFrame.pool)+' м':'—';
  $('turn-help').textContent=demo?'В деморежиме нет настоящих данных поворотов. Дистанция не имитируется.':
    !connected?'Подключите ту же плату после плавания: счётчик работает без Bluetooth.':
    !freshStats?'Данные датчика устарели. Подключитесь повторно.':
    visible?'Бассейн '+turnFrame.pool+' м · '+(turnFrame.mount==='W'?'запястье':'пояс / спина')+
      (turnFrame.finalLength?' · последняя полная длина подтверждена':' · только длины до найденных поворотов. Последняя длина не добавлена.'):'Ожидаем согласованные данные заплыва';
  $('connect').disabled=demo||connecting||busy;
  $('connect').textContent=connecting?'Подключение…':connected?'Отключить браслет':supported?'Подключить браслет':'Как подключить на iPhone';
  $('connection-label').textContent=connected?'Подключён':connecting?'Поиск устройства…':'Не подключён';
  $('connection-dot').classList.toggle('online',connected);
  $('device-name').textContent=device?.name||'XIAO SwimBand';
  $('connection-help').textContent=demo?'Вы проверяете экран без платы. Для настоящего измерения переключитесь в режим «Браслет».':
    !supported?'Для Bluetooth на iPhone откройте этот сайт в Bluefy. В Safari можно проверить деморежим.':
    'Время считает плата. При потере связи секундомер продолжит работать, пока плата получает питание.';
  $('forget-pending').hidden=!pending||busy||connecting||(active&&matched)||demo;
  $('start').disabled=busy||connecting||pending||!validForm(state.form)||!storageOK||
    (!demo&&(!fresh||!freshStats||!sameStats||turnFrame.health!=='O'||!settingsOK(state.turnSettings)||!['I','F'].includes(frame?.state)));
  $('finish').disabled=busy||connecting||(!demo&&(!fresh||!validForm(state.form)||!storageOK||
    !(frame?.state==='R'||(frame?.state==='F'&&!recorded))||(pending&&!matched)))||(demo&&!demoAt);
  $('finish').textContent=!demo&&frame?.state==='F'&&!recorded?'Сохранить результат':state.pending?.phase==='stopping'?'Повторить финиш':'Финиш';
  const label=$('session-state');
  label.className='state'+(active?' running':(!demo&&frame?.state==='F'||demoElapsed&&!demoAt)?' finished':'');
  label.textContent=busy?'ОЖИДАНИЕ ПЛАТЫ':active?'ИДЁТ ЗАПЛЫВ':pending?'НУЖНО ПОДКЛЮЧЕНИЕ':
    (!demo&&frame?.state==='F'||demoElapsed&&!demoAt)?'ФИНИШ':'ГОТОВ К СТАРТУ';
  $('timer-caption').textContent=demo?(demoAt?'Демо · время считает сайт':'Демо без платы'):
    !connected?(pending?'Связь потеряна. Подключите ту же плату':'Подключите браслет, чтобы начать'):
    !frame?'Ожидаем состояние секундомера':frame.state==='R'?'Идёт заплыв · время считает плата':
    frame.state==='F'?'Финиш · время получено с платы':'Браслет готов к старту';
  $('action-help').textContent=pending&&!connected&&!demo?'Незавершённый заплыв сохранён. Подключите ту же плату для восстановления.':
    !validForm(state.form)?'Введите имя пловца и выберите дистанцию.':
    active?'Нажмите «Финиш», когда пловец закончит дистанцию.':
    pending?'Ожидаем подтверждение платы. Не выключайте питание.':
    demo?'Проверьте старт и финиш. Деморезультат сохранится отдельно.':
    connected?'Можно начинать новый заплыв. После финиша результат сохранится здесь.':'Подключите браслет, чтобы начать.';
}
function renderAll(){render();renderHistory();}
async function stayAwake(on) {
  if(on && navigator.wakeLock && !wake) {try{wake=await navigator.wakeLock.request('screen');wake.addEventListener('release',()=>{wake=null;});}catch{}}
  if(!on && wake){const lock=wake;wake=null;try{await lock.release();}catch{}}
}
function handleValue(value) {
  const text=new TextDecoder().decode(value).replace(/\0+$/,'');
  if(text.startsWith('E:')) { notice(text==='E:BUSY'?'На плате уже идёт заплыв. Сначала завершите его.':
    text==='E:RUN'?'На плате другой заплыв. Проверьте подключённое устройство.':'Плата отклонила команду: '+text);return; }
  const next=parseFrame(text);
  if(!next) {
    $('firmware-hint').hidden=false; $('device-status').textContent='Нужна прошивка SwimBand';
    frame=null;render();return;
  }
  $('firmware-hint').hidden=true;
  // Ignore a stale read that would regress a finished run or roll back a running timer.
  if(frame?.run===next.run && frame.state==='F' && next.state==='R') return;
  if(frame?.run===next.run && frame.state===next.state && next.ms<frame.ms) return;
  frame=next;packetAt=performance.now();frozenMs=next.ms;
  const before=JSON.stringify(state.pending);
  const outcome=acceptFrame(state,device.id,next);
  if(outcome.saved) {
    save();notice('Результат сохранён: '+formatTime(next.ms)+'.');toast('Заплыв сохранён');stayAwake(false);renderHistory();
  } else if(outcome.interrupted) {save();notice('Плата перезапустилась. Незавершённый заплыв прерван, результат не сохранён.');stayAwake(false);}
  else if(outcome.foreign) notice('На плате другой заплыв. Для восстановления подключите плату, с которой запускали секундомер.');
  else if(before!==JSON.stringify(state.pending)) save();
  $('device-status').textContent=next.state==='R'?'Секундомер работает на плате':next.state==='F'?'Получен итоговый результат':'Плата готова';
  if(next.state==='R')stayAwake(true);
  render();
}
function handleTurnValue(value) {
  const next=parseStats(new TextDecoder().decode(value));
  if(!next){$('firmware-hint').hidden=false;return;}
  if(turnFrame?.run===next.run&&turnFrame.state==='F'&&next.state!=='F')return;
  if(turnFrame?.run===next.run&&next.turns<turnFrame.turns)return;
  turnFrame=next;turnAt=performance.now();
  const before=JSON.stringify(state.pending);
  const outcome=acceptStats(state,device.id,next);
  if(outcome.saved){save();renderHistory();notice('Время и данные датчика сохранены. '+(next.health==='O'?'Проверьте число поворотов.':'Был сбой IMU: дистанция может быть неполной.'));toast('Заплыв сохранён');stayAwake(false);}
  else if(before!==JSON.stringify(state.pending))save();
  if(outcome.mismatch)notice('Длина бассейна на плате отличается от запущенного заплыва. Проверьте устройство.');
  render();
}
function notifyTurns(event){handleTurnValue(event.target.value);}
function notify(event){handleValue(event.target.value);}
function detached() {
  frozenMs=currentMs();connected=false;connecting=false;busy=false;
  if(rx)rx.removeEventListener('characteristicvaluechanged',notify);
  if(sx)sx.removeEventListener('characteristicvaluechanged',notifyTurns);
  rx=null;tx=null;sx=null;server=null;commandQueue=Promise.resolve();
  clearTimeout(confirmationTimer);stayAwake(false);
  $('device-status').textContent='Связь с платой отключена';render();
}
function disconnected(event) {
  if(event.target!==device)return;
  epoch++;detached();
  if(state.pending)notice('Bluetooth отключился. Время продолжает считать плата. Подключите её снова, сохранив питание.');
}
function queueGatt(operation) {
  const task=commandQueue.catch(()=>{}).then(operation);
  commandQueue=task.catch(()=>{});return task;
}
async function readSnapshot(token=epoch) {
  const characteristic=rx;
  if(!characteristic)return;
  const statCharacteristic=sx;
  if(statCharacteristic) {
    const statsValue=await queueGatt(()=>statCharacteristic.readValue());
    if(token===epoch&&connected)handleTurnValue(statsValue);
  }
  const value=await queueGatt(()=>characteristic.readValue());
  if(token===epoch && connected)handleValue(value);
}
async function connect() {
  if(!supported){$('how-to').scrollIntoView({behavior:'smooth'});notice('На iPhone откройте адрес сайта в Bluefy, затем нажмите подключение.');return;}
  if(connected) {device?.gatt.disconnect();return;}
  connecting=true;busy=false;frame=null;turnFrame=null;notice('');render();
  const token=++epoch;
  let selected,timeout;
  try {
    selected=await navigator.bluetooth.requestDevice({filters:[{services:[UUIDS.service]}]});
    if(token!==epoch)return;
    if(state.pending?.mode==='band' && state.pending.deviceId!==selected.id)
      throw new Error('Нужна та же плата, с которой запущен незавершённый заплыв.');
    device?.removeEventListener('gattserverdisconnected',disconnected);
    device=selected;device.addEventListener('gattserverdisconnected',disconnected);
    const timeoutPromise=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Плата не ответила. Подключитесь ещё раз.')),20000);});
    await Promise.race([(async()=>{
      const result=await device.gatt.connect();
      if(token!==epoch){result.disconnect();throw new Error('Подключение отменено');}
      server=result;
      const service=await result.getPrimaryService(UUIDS.service);
      const telemetry=await service.getCharacteristic(UUIDS.telemetry);
      const control=await service.getCharacteristic(UUIDS.command);
      const turnCharacteristic=await service.getCharacteristic(UUIDS.stats);
      if(token!==epoch){result.disconnect();throw new Error('Подключение отменено');}
      rx=telemetry;tx=control;sx=turnCharacteristic;
      sx.addEventListener('characteristicvaluechanged',notifyTurns);
      await sx.startNotifications();
      telemetry.addEventListener('characteristicvaluechanged',notify);
      await telemetry.startNotifications();
      if(token!==epoch)throw new Error('Подключение отменено');
      connected=true;
      await readSnapshot(token);
    })(),timeoutPromise]);
    if(token!==epoch)return;
    $('device-status').textContent=frame?'Подключено · протокол SwimBand':'Подключено, но нужна новая прошивка';
  } catch(error) {
    if(token!==epoch)return;
    epoch++;selected?.gatt?.disconnect();detached();
    const cancelled=error.name==='NotFoundError'&&!selected;
    if(selected&&error.name==='NotFoundError')$('firmware-hint').hidden=false;
    if(!cancelled)notice('Не удалось подключиться: '+error.message);
  } finally {clearTimeout(timeout);if(token===epoch){connecting=false;render();}}
}
async function send(action) {
  const token=epoch, characteristic=tx, run=state.pending?.run;
  busy=true;render();notice('');
  try {
    if(!characteristic||!connected||!run)throw new Error('Подключите плату повторно.');
    const data=new TextEncoder().encode(encodeCommand(action,run,state.pending));
    await queueGatt(()=>typeof characteristic.writeValueWithResponse==='function'?
      characteristic.writeValueWithResponse(data):characteristic.writeValue(data));
    if(token!==epoch)return;
    await readSnapshot(token);
    clearTimeout(confirmationTimer);
    confirmationTimer=setTimeout(()=>{
      if(state.pending?.run===run && (state.pending.phase==='starting'||state.pending.phase==='stopping'))
        notice('Подтверждение ещё не получено. Подключитесь снова; финиш можно повторить без изменения времени.');
    },5000);
  } catch(error) {notice('Команда не подтверждена. Подключитесь снова для проверки: '+error.message);}
  finally {if(token===epoch){busy=false;render();}}
}
function randomRun() {
  const values=new Uint32Array(1);do{crypto.getRandomValues(values);}while(!values[0]);
  return values[0].toString(16).toUpperCase().padStart(8,'0');
}
async function start() {
  if($('start').disabled)return;
  state.pending=newPending(state.form,state.mode==='demo'?'demo':device.id,state.mode,randomRun());
  Object.assign(state.pending,state.turnSettings,{finalLength:false});
  $('finish-at-wall').checked=false;
  if(!save()){state.pending=null;render();return;}
  if(state.mode==='demo'){state.pending.phase='running';demoAt=performance.now();demoElapsed=0;save();stayAwake(true);render();}
  else {await send('G');}
}
function finishDemo() {
  const elapsed=Math.min(MAX_MS,Math.floor(performance.now()-demoAt));demoAt=0;demoElapsed=elapsed;
  if(finishRecord(state,state.pending,elapsed)){save();renderAll();toast('Деморезультат сохранён');stayAwake(false);}
}
async function finish() {
  if($('finish').disabled)return;
  if(state.mode==='demo'){finishDemo();return;}
  if(!state.pending){
    state.pending=newPending(state.form,device.id,'band',frame.run);
    Object.assign(state.pending,state.turnSettings);
    if(turnFrame?.run===frame.run)Object.assign(state.pending,{pool:turnFrame.pool,mount:turnFrame.mount,turnStats:{...turnFrame}});
  }
  state.pending.finalLength=$('finish-at-wall').checked;
  state.pending.phase='stopping';
  if(!save()){render();return;}
  if(frame.state==='F') {handleValue(new TextEncoder().encode('WF:'+frame.run+':'+frame.ms.toString(16).toUpperCase().padStart(8,'0')));return;}
  await send('F');
}
$('swim-form').addEventListener('submit',event=>event.preventDefault());
['swimmer-name','stroke','distance'].forEach(id=>$(id).addEventListener('input',()=>{
  state.form={name:$('swimmer-name').value,stroke:$('stroke').value,distance:Number($('distance').value)};save();render();
}));
$('start').addEventListener('click',()=>{start().catch(error=>notice(error.message));});
$('finish').addEventListener('click',()=>{finish().catch(error=>notice(error.message));});
$('connect').addEventListener('click',connect);
for(const mode of ['band','demo'])$('mode-'+mode).addEventListener('click',()=>{
  if($('mode-'+mode).disabled)return;
  if(connected)device.gatt.disconnect();
  state.mode=mode;demoElapsed=0;frame=null;turnFrame=null;frozenMs=0;notice('');save();renderAll();
});
$('forget-pending').addEventListener('click',()=>{
  if(!confirm('Снять ожидание незавершённого заплыва на сайте? Несохранённые данные этого заплыва будут забыты. Секундомер на плате продолжит работать.'))return;
  state.pending=null;save();notice('Ожидание снято. Подключите плату, чтобы проверить её состояние.');render();
});
['pool-length','mount','minimum-length'].forEach(id=>$(id).addEventListener('input',()=>{
  if(id==='pool-length')$('minimum-length').value=$('pool-length').value==='50'?'16':'8';
  state.turnSettings={pool:Number($('pool-length').value),mount:$('mount').value,minSec:Number($('minimum-length').value)};
  save();render();
}));
$('calibrate').addEventListener('click',async()=>{
  if($('calibrate').disabled)return;
  const token=epoch,characteristic=tx;busy=true;render();notice('Положите плату неподвижно. Калибровка занимает около 3 секунд. Последний результат остаётся в истории сайта.');
  try {
    const data=new TextEncoder().encode('C');
    await queueGatt(()=>typeof characteristic.writeValueWithResponse==='function'?characteristic.writeValueWithResponse(data):characteristic.writeValue(data));
    if(token===epoch)await readSnapshot(token);
  }catch(error){notice('Калибровка не подтверждена: '+error.message);}
  finally{if(token===epoch){busy=false;render();}}
});
$('export').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([csv(rows())],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='SwimBand-'+state.mode+'-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible') {
    if(connected)readSnapshot().catch(()=>{});
    if(demoAt||connected&&frame?.state==='R')stayAwake(true);
  }
});
window.addEventListener('pagehide',()=>{save();stayAwake(false);});
setInterval(()=>{if(connected&&performance.now()-packetAt>4000)$('device-status').textContent='Нет свежих данных. Проверьте связь с платой.';render();},1000);
renderAll();requestAnimationFrame(paintClock);
