export const MODES = ['demo', 'phone', 'bracelet'];

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function recentDays(count = 7, date = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() - count + 1 + index, 12);
    return { date: day, key: dayKey(day) };
  });
}

export function createState(now = new Date()) {
  const demoDays = {};
  const examples = [4350, 6200, 5100, 8300, 4760, 7120, 2840];
  recentDays(7, now).forEach((day, index) => { demoDays[day.key] = examples[index]; });
  return {
    version: 1, goal: 8000, mode: 'bracelet',
    sources: { demo: { days: demoDays }, phone: { days: {} }, bracelet: { days: {}, snapshots: {} } }
  };
}

export function restoreState(text, now = new Date()) {
  const fresh = createState(now);
  if (!text) return fresh;
  const saved = JSON.parse(text);
  if (saved?.version !== 1) throw new Error('Unsupported saved state');
  if (Number.isInteger(saved.goal) && saved.goal >= 1000 && saved.goal <= 50000) fresh.goal = saved.goal;
  if (MODES.includes(saved.mode)) fresh.mode = saved.mode;
  for (const mode of MODES) {
    const days = saved.sources?.[mode]?.days;
    if (!days || typeof days !== 'object' || Array.isArray(days)) throw new Error('Invalid history');
    fresh.sources[mode].days = {};
    for (const [day, count] of Object.entries(days)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isSafeInteger(count) && count >= 0) {
        fresh.sources[mode].days[day] = count;
      }
    }
  }
  const snapshots = saved.sources?.bracelet?.snapshots;
  if (snapshots && typeof snapshots === 'object' && !Array.isArray(snapshots)) {
    for (const [id, packet] of Object.entries(snapshots)) {
      if (id !== '__proto__' && validUInt32(packet?.session) && validUInt32(packet?.total)) {
        fresh.sources.bracelet.snapshots[id] = { session: packet.session, total: packet.total };
      }
    }
  }
  return fresh;
}

function validUInt32(value) { return Number.isInteger(value) && value >= 0 && value <= 0xffffffff; }

export function parsePacket(text) {
  const match = /^S:([0-9a-fA-F]{8}):([0-9a-fA-F]{8})$/.exec(text);
  return match && text.length === 19 ? { session: parseInt(match[1], 16), total: parseInt(match[2], 16) } : null;
}

export function addSteps(state, mode, count, date = new Date()) {
  if (!MODES.includes(mode) || !Number.isSafeInteger(count) || count <= 0) return;
  const days = state.sources[mode].days;
  const key = dayKey(date);
  const total = (days[key] || 0) + count;
  if (Number.isSafeInteger(total)) days[key] = total;
}

export function receivePacket(state, deviceID, packet, date = new Date()) {
  if (!validUInt32(packet?.session) || !validUInt32(packet?.total) || deviceID === '__proto__') return 0;
  const source = state.sources.bracelet;
  const previous = Object.hasOwn(source.snapshots, deviceID) ? source.snapshots[deviceID] : null;
  if (previous?.session === packet.session && previous.total > packet.total) return 0;
  const delta = previous?.session === packet.session ? packet.total - previous.total : packet.total;
  source.snapshots[deviceID] = { ...packet };
  addSteps(state, 'bracelet', delta, date);
  return delta;
}

// Experimental foreground phone detector. Timing uses the monotonic event clock.
export class PhoneStepDetector {
  reset() { this.initialized = false; this.streak = 0; this.armed = true; }
  constructor() { this.reset(); }
  update(magnitude, now) {
    if (!Number.isFinite(magnitude) || magnitude < 0.2 || magnitude > 6) { this.reset(); return 0; }
    if (!this.initialized || now - this.lastSample > 200 || now < this.lastSample) {
      this.smooth = this.baseline = magnitude;
      this.started = now; this.streak = 0; this.armed = true; this.initialized = true;
      this.lastSample = now;
    }
    const dt = Math.max(1, Math.min(now - this.lastSample, 100));
    this.lastSample = now;
    this.smooth += (1 - Math.pow(0.65, dt / 20)) * (magnitude - this.smooth);
    this.baseline += (1 - Math.pow(0.98, dt / 20)) * (this.smooth - this.baseline);
    const movement = this.smooth - this.baseline;
    if (now - this.started < 2000) return 0;
    if (movement < 0.025) this.armed = true;
    if (!this.armed || movement < 0.12) return 0;
    this.armed = false;
    const elapsed = now - this.lastPeak;
    if (this.streak > 0 && elapsed < 280) return 0;
    this.streak = !this.streak || elapsed > 1500 ? 1 : Math.min(4, this.streak + 1);
    this.lastPeak = now;
    return this.streak === 3 ? 3 : this.streak >= 4 ? 1 : 0;
  }
}
