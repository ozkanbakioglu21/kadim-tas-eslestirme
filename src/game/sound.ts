/**
 * Kadim Tas Eslestirme — WebAudio Ses Yoneticisi.
 * Tum sesler WebAudio API ile sentezlenir, harici dosya gerektirmez.
 */

const MUTE_KEY = "otuken_mahjong_mute";
const VOL_KEY = "otuken_mahjong_vol";
let _muted = false;
let _volume = 0.7;
try { _muted = localStorage.getItem(MUTE_KEY) === "1"; } catch {}
try { const v = parseFloat(localStorage.getItem(VOL_KEY) ?? ""); if (!isNaN(v) && v >= 0 && v <= 1) _volume = v; } catch {}

let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (_muted) return null;
  if (!_ctx) { try { _ctx = new AudioContext(); } catch { return null; } }
  if (_ctx.state === "suspended") { try { _ctx.resume(); } catch {} }
  return _ctx;
}

function osc(type: OscillatorType, freq: number, dur: number, vol = 0.3): void {
  const c = ctx(); if (!c) return;
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(vol * _volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  g.connect(c.destination);
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.connect(g);
  o.start(t);
  o.stop(t + dur);
}

function noise(dur: number, vol = 0.15): void {
  const c = ctx(); if (!c) return;
  const t = c.currentTime;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(vol * _volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(g);
  g.connect(c.destination);
  src.start(t);
  src.stop(t + dur);
}

function playSfx(name: string, comboLevel?: number): void {
  if (_muted) return;
  const combo = comboLevel ?? 0;
  switch (name) {
    case "tileclick":
      // Kisa tiklama sesi
      osc("sine", 800 + Math.random() * 400, 0.06, 0.2);
      break;
    case "match":
      // Yumuşak eslesme — tatmin edici clack
      osc("triangle", 600, 0.08, 0.25);
      osc("sine", 900, 0.06, 0.15);
      noise(0.04, 0.1);
      break;
    case "combo":
      // Kombo: daha parlak, yukselen ton
      osc("sine", 700 + combo * 80, 0.12, 0.3);
      osc("triangle", 1000 + combo * 100, 0.1, 0.2);
      break;
    case "win":
      // Zafer fanfar: uc notali yuksek
      osc("sine", 523, 0.2, 0.3);
      setTimeout(() => osc("sine", 659, 0.2, 0.3), 120);
      setTimeout(() => osc("sine", 784, 0.35, 0.35), 240);
      break;
    case "lose":
      // Kayip: alcalan iki not
      osc("sine", 400, 0.25, 0.25);
      setTimeout(() => osc("sine", 300, 0.4, 0.25), 180);
      break;
    case "shuffle":
      // Karistirma: hafif kayma
      osc("sine", 500, 0.05, 0.15);
      setTimeout(() => osc("sine", 600, 0.05, 0.15), 40);
      setTimeout(() => osc("sine", 700, 0.05, 0.15), 80);
      break;
    case "hint":
      // Ipucu: hafif cilingir
      osc("triangle", 1200, 0.08, 0.2);
      osc("sine", 1500, 0.06, 0.15);
      break;
    default:
      osc("sine", 440, 0.05, 0.15);
  }
}

export const SoundEngine = {
  isMuted: () => _muted,
  setMuted: (v: boolean) => { _muted = v; try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch {} },
  toggleMute: () => { _muted = !_muted; try { localStorage.setItem(MUTE_KEY, _muted ? "1" : "0"); } catch {} return _muted; },
  setVolume: (v: number) => { _volume = Math.max(0, Math.min(1, v)); try { localStorage.setItem(VOL_KEY, _volume.toString()); } catch {} },
  getVolume: () => _volume,
  play: playSfx,
};
