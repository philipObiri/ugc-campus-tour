// Tiny synthesised sound effects (no audio files needed).
let ctx: AudioContext | null = null;
let muted = false;

export function initAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function ready() {
  return ctx && !muted ? ctx : null;
}

export function whoosh(strength = 1) {
  const a = ready();
  if (!a) return;
  const dur = 1.1;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(300, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(2400, a.currentTime + dur * 0.6);
  f.frequency.exponentialRampToValueAtTime(500, a.currentTime + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.22 * strength, a.currentTime + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export function chime(pitch = 1) {
  const a = ready();
  if (!a) return;
  [523.25, 659.25, 783.99].forEach((hz, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.value = hz * pitch;
    const t = a.currentTime + i * 0.07;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 1.5);
  });
}

export function pop() {
  const a = ready();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(880, a.currentTime);
  o.frequency.exponentialRampToValueAtTime(220, a.currentTime + 0.15);
  g.gain.setValueAtTime(0.12, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.18);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + 0.2);
}

/** Two-tone car horn. */
export function honk(pitch = 1) {
  const a = ready();
  if (!a) return;
  for (const [hz, start] of [[392, 0], [392, 0.22]] as const) {
    const t = a.currentTime + start;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    g.gain.setValueAtTime(0.09, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    for (const mult of [1, 1.26]) {
      const o = a.createOscillator();
      o.type = "square";
      o.frequency.value = hz * pitch * mult;
      const f = a.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1800;
      o.connect(f).connect(g);
      o.start(t);
      o.stop(t + 0.2);
    }
    g.connect(a.destination);
  }
}
