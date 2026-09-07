/**
 * Kadim Tas Eslestirme — Basit Ses Yoneticisi.
 * Ses dosyalari kaldirildi, WebAudio ile sentezlenmis sesler kullanilir.
 */

const MUTE_KEY = "otuken_mahjong_mute";
const VOL_KEY = "otuken_mahjong_vol";
let _muted = false;
let _volume = 0.7;
try { _muted = localStorage.getItem(MUTE_KEY) === "1"; } catch {}
try { const v = parseFloat(localStorage.getItem(VOL_KEY) ?? ""); if (!isNaN(v) && v >= 0 && v <= 1) _volume = v; } catch {}

function playSfx(_name: string, _comboLevel?: number): void {
  // Ses dosyalari kaldirildi; WebAudio sentezleri Game.ts icindeki clack() ile yapiliyor.
}

export const SoundEngine = {
  isMuted: () => _muted,
  setMuted: (v: boolean) => { _muted = v; try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch {} },
  toggleMute: () => { _muted = !_muted; try { localStorage.setItem(MUTE_KEY, _muted ? "1" : "0"); } catch {} return _muted; },
  setVolume: (v: number) => { _volume = Math.max(0, Math.min(1, v)); try { localStorage.setItem(VOL_KEY, _volume.toString()); } catch {} },
  getVolume: () => _volume,
  play: playSfx,
};
