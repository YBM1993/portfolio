import * as base from './core.js?v=swim1';
export const {STROKES,MAX_MS,parseFrame,formatTime,validForm,newPending} = base;
export const UUIDS={...base.UUIDS,stats:'12345678-1234-5678-1234-56789abcdef3'};
export const settingsOK=s=>s&&[25,50].includes(s.pool)&&['W','B'].includes(s.mount)&&Number.isInteger(s.minSec)&&s.minSec>=4&&s.minSec<=60;
export function parseStats(text) {
  const m=/^L([IRF])([OCED]):([0-9A-F]{8}):([0-9A-F]{4}):([0-9A-F]{2})$/i.exec(text);
  if(!m||text.length!==20)return null;
  const flags=parseInt(m[5],16), s={state:m[1].toUpperCase(),health:m[2].toUpperCase(),run:m[3].toUpperCase(),
    turns:parseInt(m[4],16),pool:flags&63,mount:flags&128?'W':'B',finalLength:!!(flags&64)};
  if(![25,50].includes(s.pool)||s.state==='I'&&(s.run!=='00000000'||s.turns!==0||s.finalLength)||
    s.state!=='I'&&s.run==='00000000'||s.state!=='F'&&s.finalLength)return null;
  return s;
}
export function startCommand(p) {
  if(!settingsOK(p))throw new Error('Проверьте длину бассейна и настройки датчика');
  return base.encodeCommand('G',p.run)+':'+p.pool.toString(16).toUpperCase().padStart(2,'0')+':'+p.mount+':'+p.minSec.toString(16).toUpperCase().padStart(2,'0');
}
export function encodeCommand(action,run,p) {
  return action==='G'?startCommand(p):base.encodeCommand(action,run)+':'+(p.finalLength?'01':'00');
}
export function finishRecord(state,p,ms,now=new Date()) {
  if(p?.mode==='band'&&(!p.turnStats||p.turnStats.state!=='F'||p.turnStats.run!==p.run))return false;
  const saved=base.finishRecord(state,p,ms,now);
  if(saved) {
    const r=state.records[0];r.sensorDataVersion=2;
    if(p.mode==='band') {
      const t=p.turnStats;r.turns=t.turns;r.pool=t.pool;r.mount=t.mount;r.sensorHealth=t.health;
      r.finalLengthConfirmed=t.finalLength;r.actualDistance=(t.turns+(t.finalLength?1:0))*t.pool;
    }
  }
  return saved;
}
function settle(state,p,now) {
  if(p && Number.isInteger(p.finalMs)&&p.finalMs>=0&&p.finalMs<=base.MAX_MS&&p.turnStats?.state==='F')return finishRecord(state,p,p.finalMs,now);
  return false;
}
export function acceptFrame(state,deviceId,frame,now=new Date()) {
  const p=state.pending;
  if(frame.state!=='F')return base.acceptFrame(state,deviceId,frame,now);
  if(p?.mode!=='band'||p.deviceId!==deviceId)return {saved:false};
  if(p.run!==frame.run)return {saved:false,foreign:true};
  p.finalMs=frame.ms;
  return {saved:settle(state,p,now)};
}
export function acceptStats(state,deviceId,stats,now=new Date()) {
  const p=state.pending;
  if(p?.mode!=='band'||p.deviceId!==deviceId||p.run!==stats.run)return {saved:false};
  if(p.turnStats?.state==='F'&&stats.state!=='F')return {saved:false};
  if(p.turnStats&&stats.turns<p.turnStats.turns)return {saved:false};
  if(p.pool&&p.pool!==stats.pool)return {saved:false,mismatch:true};
  p.turnStats={...stats};
  return {saved:settle(state,p,now)};
}
export function restoreState(text) {
  const s=base.restoreState(text),raw=text?JSON.parse(text):{};
  s.turnSettings=settingsOK(raw.turnSettings)?raw.turnSettings:{pool:25,mount:'W',minSec:8};
  const map=new Map((raw.records||[]).map(r=>[r.id,r]));
  for(const r of s.records) {
    const x=map.get(r.id);
    if(x?.sensorDataVersion!==2)continue;
    r.sensorDataVersion=2;
    if(r.mode==='band'&&Number.isInteger(x.turns)&&x.turns>=0&&x.turns<=65535&&[25,50].includes(x.pool)&&
      ['W','B'].includes(x.mount)&&['O','D','E','C'].includes(x.sensorHealth)) {
      Object.assign(r,{turns:x.turns,pool:x.pool,mount:x.mount,sensorHealth:x.sensorHealth,finalLengthConfirmed:x.finalLengthConfirmed===true});
      r.actualDistance=(r.turns+(r.finalLengthConfirmed?1:0))*r.pool;
    }
  }
  if(s.pending&&raw.pending?.run===s.pending.run) {
    const p=raw.pending;
    if(settingsOK(p))Object.assign(s.pending,{pool:p.pool,mount:p.mount,minSec:p.minSec});
    if(typeof p.finalLength==='boolean')s.pending.finalLength=p.finalLength;
    if(Number.isInteger(p.finalMs)&&p.finalMs>=0&&p.finalMs<=base.MAX_MS)s.pending.finalMs=p.finalMs;
    if(p.turnStats) {
      const t=p.turnStats;
      const flags=t.pool|(t.mount==='W'?128:0)|(t.finalLength?64:0);
      const parsed=parseStats('L'+t.state+t.health+':'+t.run+':'+Number(t.turns).toString(16).toUpperCase().padStart(4,'0')+':'+flags.toString(16).toUpperCase().padStart(2,'0'));
      if(parsed&&parsed.run===s.pending.run)s.pending.turnStats=parsed;
    }
  }
  return s;
}
export function distanceText(r) {
  if(Number.isInteger(r.actualDistance))return '≈ '+r.actualDistance+' м · '+r.turns+' поворотов'+(r.sensorHealth!=='O'?' · сбой датчика':'')+(r.finalLengthConfirmed?' · финиш подтверждён':' · без последней длины');
  return 'План '+r.distance+' м · '+(r.mode==='demo'?'демо':'ручной ввод');
}
export function csv(records) {
  const cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\uFEFF'+[['Сохранено','Пловец','Стиль','План м','Оценка дистанции м','Повороты','Бассейн м','Последняя длина подтверждена','Датчик','Время','Источник'],
    ...records.map(r=>[r.finishedAt,r.name,STROKES[r.stroke],r.distance,r.actualDistance,r.turns,r.pool,
      r.finalLengthConfirmed?'Да':'Нет',r.sensorHealth||'Нет данных',formatTime(r.durationMs),r.mode==='band'?'Браслет':'Демо'])]
    .map(row=>row.map(cell).join(';')).join('\r\n');
}
