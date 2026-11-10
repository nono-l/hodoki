let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function beep(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playFx(kind: "ui" | "hit" | "miss" | "half" | "tea" | "clear" | "tick") {
  if (kind === "ui") beep(520, 0.05, "sine", 0.03);
  if (kind === "tick") beep(340, 0.03, "sine", 0.02);
  if (kind === "hit") {
    beep(180, 0.18, "triangle", 0.06, -80);
    beep(90, 0.28, "sine", 0.05);
  }
  if (kind === "half") beep(220, 0.12, "triangle", 0.04, -30);
  if (kind === "miss") beep(240, 0.12, "square", 0.02, -40);
  if (kind === "tea") beep(660, 0.14, "sine", 0.03, 80);
  if (kind === "clear") {
    beep(392, 0.2, "sine", 0.04);
    setTimeout(() => beep(523, 0.28, "sine", 0.04), 160);
  }
}
