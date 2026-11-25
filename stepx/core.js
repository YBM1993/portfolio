export const UUIDS = Object.freeze({
  service: '12345678-1234-5678-1234-56789abcdef0',
  telemetry: '12345678-1234-5678-1234-56789abcdef1',
  command: '12345678-1234-5678-1234-56789abcdef2'
});
export const STROKES = Object.freeze({free:'Вольный стиль',back:'На спине',breast:'Брасс',fly:'Баттерфляй'});
export const DISTANCES = [25,50,100,200,400];
export const MAX_MS = 86400000;
const HEX = /^[0-9A-F]{8}$/;
export function parseFrame(text) {
  const m = /^W([IRF]):([0-9A-Fa-f]{8}):([0-9A-Fa-f]{8})$/.exec(text);
  if (!m || text.length !== 20) return null;
  const frame = {state:m[1], run:m[2].toUpperCase(), ms:parseInt(m[3],16)};
  if (frame.ms > MAX_MS || (frame.state === 'I' && (frame.run !== '00000000' || frame.ms !== 0))) return null;
  if (frame.state !== 'I' && frame.run === '00000000') return null;
  return frame;
}
export function encodeCommand(action, run) {
  if (!['G','F'].includes(action) || !HEX.test(run) || run === '00000000') throw new Error('Некорректная команда');
  return action + ':' + run;
}
export function formatTime(ms) {
  const value = Math.max(0, Math.floor(Number(ms) || 0));
  const cs = Math.floor(value / 10) % 100, sec = Math.floor(value / 1000) % 60, min = Math.floor(value / 60000);
  return String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0') + '.' + String(cs).padStart(2,'0');
}
export function cleanForm(form) {
  return {name:String(form?.name || '').trim().replace(/\s+/g,' '),stroke:form?.stroke,distance:Number(form?.distance)};
}
export function validForm(form) {
  const f = cleanForm(form);
  return f.name.length >= 1 && f.name.length <= 60 && Object.hasOwn(STROKES,f.stroke) && DISTANCES.includes(f.distance);
}
export function initialState() {
  return {version:1, mode:'band', form:{name:'',stroke:'free',distance:50}, records:[], pending:null};
}
export function newPending(form, deviceId, mode, run, now = new Date()) {
  if (!validForm(form) || !HEX.test(run) || run === '00000000' || !['band','demo'].includes(mode) || !deviceId) throw new Error('Заполните имя, стиль и дистанцию');
  return {...cleanForm(form), deviceId, mode, run, phase:'starting', startedAt:now.toISOString()};
}
export function finishRecord(state, pending, ms, now = new Date()) {
  if (!pending || !validForm(pending) || !Number.isInteger(ms) || ms < 0 || ms > MAX_MS) return false;
  const id = pending.mode + ':' + pending.deviceId + ':' + pending.run;
  const exists = state.records.some(r => r.id === id);
  if (!exists) {
    state.records.unshift({id,mode:pending.mode,deviceId:pending.deviceId,run:pending.run,
      ...cleanForm(pending),durationMs:ms,finishedAt:now.toISOString()});
  }
  if (state.pending?.run === pending.run && state.pending?.deviceId === pending.deviceId) state.pending = null;
  return !exists;
}
export function acceptFrame(state, deviceId, frame, now = new Date()) {
  const p = state.pending;
  const matchingDevice = p?.mode === 'band' && p.deviceId === deviceId;
  if (!matchingDevice) return {saved:false};
  if (frame.state === 'I') {
    const grace = p.phase === 'starting' && now.getTime() - Date.parse(p.startedAt) < 5000;
    if (grace) return {saved:false};
    state.pending = null;
    return {saved:false,interrupted:true};
  }
  if (p.run !== frame.run) return {saved:false,foreign:true};
  if (frame.state === 'R') {
    if (p.phase !== 'stopping') p.phase = 'running';
    return {saved:false};
  }
  return {saved:finishRecord(state,p,frame.ms,now)};
}
export function restoreState(text) {
  const state = initialState();
  if (!text) return state;
  const saved = JSON.parse(text);
  if (saved?.version !== 1 || !Array.isArray(saved.records)) throw new Error('Неверный формат истории');
  if (['band','demo'].includes(saved.mode)) state.mode = saved.mode;
  if (saved.form && Object.hasOwn(STROKES,saved.form.stroke) && DISTANCES.includes(Number(saved.form.distance))) {
    state.form = cleanForm(saved.form); state.form.name = state.form.name.slice(0,60);
  }
  const ids = new Set();
  for (const r of saved.records) {
    if (!validForm(r) || !['band','demo'].includes(r.mode) || !HEX.test(r.run || '') || !r.deviceId ||
        !Number.isInteger(r.durationMs) || r.durationMs < 0 || r.durationMs > MAX_MS || !Number.isFinite(Date.parse(r.finishedAt))) continue;
    const id = r.mode + ':' + r.deviceId + ':' + r.run;
    if (ids.has(id)) continue;
    ids.add(id); state.records.push({...cleanForm(r),id,mode:r.mode,deviceId:String(r.deviceId),
      run:r.run,durationMs:r.durationMs,finishedAt:r.finishedAt});
  }
  const p = saved.pending;
  if (p && validForm(p) && ['band','demo'].includes(p.mode) && HEX.test(p.run || '') && p.run !== '00000000' &&
      p.deviceId && ['starting','running','stopping'].includes(p.phase) && Number.isFinite(Date.parse(p.startedAt))) {
    state.pending = {...cleanForm(p),mode:p.mode,deviceId:String(p.deviceId),run:p.run,phase:p.phase,startedAt:p.startedAt};
    state.mode = p.mode;
  }
  return state;
}
export function csv(records) {
  const cell = value => {
    let s = String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g,'""') + '"';
  };
  const rows = [['Дата сохранения','Пловец','Стиль','Дистанция м','Время','Источник'],
    ...records.map(r => [r.finishedAt,r.name,STROKES[r.stroke],r.distance,formatTime(r.durationMs),r.mode === 'band'?'Браслет':'Демо'])];
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
