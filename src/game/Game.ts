// Ötüken Mahjong Solitaire
// Kurallar: standart 144 taslik mahjong setinden ayni desene sahip iki AÇIK taşı seçip eşleştir, kaldır.
// Tüm taşlar kalkınca oyunu kazanırsın.

import { SoundEngine } from "./sound";

const CANVAS_W = 720;
const CANVAS_H = 1280;

// Bir hex rengini belirli oranda açık (+) ya da koyu (-) yapar.
function shade(hex: string, percent: number): string {
  const f = parseInt(hex.slice(1), 16);
  const R = (f >> 16) & 255;
  const G = (f >> 8) & 255;
  const B = f & 255;
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const r = Math.round((t - R) * p) + R;
  const g = Math.round((t - G) * p) + G;
  const b = Math.round((t - B) * p) + B;
  return "#" + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export interface Tile {
  id: number;
  symbol: string; // standart mahjong tas turu (b1-b9, c1-c9, w1-w9, E/S/W/N, DR/DG/DW, f1-f4, s1-s4)
  x: number; // hücre sütunu
  y: number; // hücre satırı
  layer: number;
  removed: boolean;
  sx: number; // ekran x merkez
  sy: number; // ekran y merkez
}

export type GameMode = "classic" | "zen" | "race" | "puzzle" | "endless";

export interface HudState {
  remaining: number;
  total: number;
  moves: number;
  seconds: number;
  selected: number;
  won: boolean;
  stuck: boolean;
  level: number;
  levelName: string;
  score: number;
  combo: number;
  stars: number;
  fates: string[];
  shuffles: number;
  cleanWin: boolean;
  mode: GameMode;
  raceTimeLeft: number;
}

// Göktürk rünleri (Orhun alfabesi) — arka plan motifleri için.
const RUNES = [
  "𐰀", "𐰆", "𐰉", "𐰒", "𐰤", "𐰞", "𐰱", "𐰾",
  "𐰋", "𐰑", "𐰚", "𐰃", "𐰅", "𐰇", "𐰈", "𐰢",
  "𐰁", "𐰂", "𐰗", "𐰜",
];
// Standart mahjong seti (144 tas):
//   Sayilar (108): bambu b1-b9, daire c1-c9, karakter w1-w9 (her turunden 4 adet)
//   Onur (28):     ruzgarlar E/S/W/N, ejderhalar DR/DG/DW (her birinden 4 adet)
//   Bonus (8):     cicekler f1-f4, mevsimler s1-s4 (cicekler aralarinda,
//                  mevsimler aralarinda eslesir)
const NUM_CH = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const WIND_CH: Record<string, string> = { E: "東", S: "南", W: "西", N: "北" };
const DRAGON_CH: Record<string, string> = { DR: "中", DG: "發", DW: "白" };
const FLOWER_CH = ["梅", "蘭", "菊", "竹"];
const SEASON_CH = ["春", "夏", "秋", "冬"];
const CJK_FONT = "'Segoe UI','Microsoft YaHei','Noto Sans CJK SC','Noto Sans SC',serif";

// Meditasyon motto'lari — her yeni duvar, rastgele bir felsefi nefes.
const MOTTOS = [
  "Her duvar, çözülmek için dizilir.",
  "Taşa değil, akışa bağlan.",
  "Bırakmak, tutmaktan güçlüdür.",
  "Dağınık parçadan eksiksiz bütün.",
  "Doğru anı bekle, aceleyi bırak.",
  "Denge, en derin stratejidir.",
  "Sessizlikte oku, akışta bırak.",
  "Her hamle bir penceredir.",
];

function tileColor(kind: string): string {
  if (kind[0] === "b") return "#2e8b57";
  if (kind[0] === "c") return "#1b5faa";
  if (kind[0] === "w") return "#c0392b";
  if (kind === "DR") return "#c0392b";
  if (kind === "DG") return "#2e8b57";
  if (kind === "DW") return "#3b6ea5";
  if (kind[0] === "f") return "#c2185b";
  if (kind[0] === "s") return "#b8860b";
  return "#203a63";
}

function faceLabel(kind: string): string {
  if (kind[0] === "b" || kind[0] === "c") return kind.slice(1);
  if (kind[0] === "w") return NUM_CH[Number(kind.slice(1)) - 1];
  if (kind in DRAGON_CH) return DRAGON_CH[kind];
  if (kind[0] === "f") return FLOWER_CH[Number(kind.slice(1)) - 1];
  if (kind[0] === "s") return SEASON_CH[Number(kind.slice(1)) - 1];
  return WIND_CH[kind];
}

function matchKey(kind: string): string {
  if (kind[0] === "f") return "flower";
  if (kind[0] === "s") return "season";
  return kind;
}

function buildPoolPairs(): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const su of ["b", "c", "w"])
    for (let n = 1; n <= 9; n++) {
      const k = su + n;
      pairs.push([k, k]);
      pairs.push([k, k]);
    }
  for (const k of ["E", "S", "W", "N", "DR", "DG", "DW"]) {
    pairs.push([k, k]);
    pairs.push([k, k]);
  }
  pairs.push(["f1", "f2"], ["f3", "f4"]);
  pairs.push(["s1", "s2"], ["s3", "s4"]);
  return pairs;
}

// Daire/bambu taslarinda 1-9 desen yerlesimleri (kutuya gore oranli koordinatlar).
const DOT_POS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[0, -0.55], [0, 0.55]],
  3: [[-0.62, -0.62], [0, 0], [0.62, 0.62]],
  4: [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]],
  5: [[-0.6, -0.6], [0.6, -0.6], [0, 0], [-0.6, 0.6], [0.6, 0.6]],
  6: [[-0.55, -0.6], [0.55, -0.6], [-0.55, 0], [0.55, 0], [-0.55, 0.6], [0.55, 0.6]],
  7: [[-0.62, -0.62], [0, -0.62], [0.62, -0.62], [-0.55, 0], [0.55, 0], [-0.55, 0.6], [0.55, 0.6]],
  8: [[-0.6, -0.6], [0, -0.6], [0.6, -0.6], [-0.6, 0], [0.6, 0], [-0.6, 0.6], [0, 0.6], [0.6, 0.6]],
  9: [[-0.6, -0.6], [0, -0.6], [0.6, -0.6], [-0.6, 0], [0, 0], [0.6, 0], [-0.6, 0.6], [0, 0.6], [0.6, 0.6]],
};

// Seviye dizimleri. Taşlar standart 144 taslik mahjong setinden dogrulanir;
// sembol atamasi kaldirma simulasyonu ile cozulebilirlik garantisi verir.
const LEVELS: Array<{ name: string; cells: Array<[number, number]>; bg: [string, string] }> =
  [
    { name: "Sıra", cells: rowShape(2, 4), bg: ["#0e2433", "#16384a"] },
    { name: "Dama", cells: checkerShape(4, 4), bg: ["#0c2833", "#17404e"] },
    { name: "Çapraz", cells: crossShape(4, 4), bg: ["#17243b", "#24365b"] },
    { name: "U Şekli", cells: uShape(4, 5), bg: ["#273323", "#3a4a2f"] },
    { name: "Çerçeve", cells: frameShape(4, 4), bg: ["#14233d", "#20314f"] },
    { name: "Sütun", cells: rowShape(3, 4), bg: ["#33233c", "#4a2f56"] },
    { name: "Kare", cells: rowShape(4, 4), bg: ["#0d2e33", "#1a4650"] },
    { name: "Piramit", cells: pyramidShape(8), bg: ["#3a2a16", "#544026"] },
    { name: "Geniş Alan", cells: rowShape(5, 4), bg: ["#271f3f", "#3a2a53"] },
    { name: "Halka", cells: ringShape(5, 5), bg: ["#1f3a33", "#2c5448"] },
    { name: "Geniş Alan 2", cells: rowShape(7, 4), bg: ["#3a2030", "#542d45"] },
    { name: "Büyük Kare", cells: rowShape(8, 4), bg: ["#2a1f3f", "#3d2a5c"] },
    { name: "Klasik 144", cells: turtleShape(), bg: ["#10241c", "#1c4530"] },
  ];

function rowShape(cols: number, rows: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([c, r]);
  return out;
}
function frameShape(cols: number, rows: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) out.push([c, r]);
  return out;
}
function checkerShape(cols: number, rows: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) if ((r + c) % 2 === 0) out.push([c, r]);
  return out;
}
function crossShape(cols: number, rows: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (c === r || c + r === cols - 1) out.push([c, r]);
  return out;
}
function uShape(cols: number, rows: number): Array<[number, number]> {
  // Üst kenar açık, alt kenar ve yanlar dolu (U harfi).
  const out: Array<[number, number]> = [];
  for (let r = 1; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (r === rows - 1 || c === 0 || c === cols - 1) out.push([c, r]);
  return out;
}
function pyramidShape(maxCols: number): Array<[number, number]> {
  // Basamaklı ters piramit: her satırda 2,4,6,8... merkezli hücre.
  const out: Array<[number, number]> = [];
  let cols = 2;
  let row = 0;
  while (cols <= maxCols) {
    const start = (maxCols - cols) / 2;
    for (let c = 0; c < cols; c++) out.push([start + c, row]);
    cols += 2;
    row++;
  }
  return out;
}
function ringShape(cols: number, rows: number): Array<[number, number]> {
  // Kalın halka: dış çerçeve + iç çerçeve.
  const outer = frameShape(cols, rows);
  const inner = frameShape(cols - 2, rows - 2).map(
    ([c, r]): [number, number] => [c + 1, r + 1],
  );
  return [...outer, ...inner];
}

// Deterministik (seeded) rastgele sayı üretici: aynı seviye her zaman
// aynı dizim üretir, böylece "yeniden oyna" seviyeyi değiştirmez.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seviye ilerledikçe rastgele yeni bir dizim üretir: birkaç bitişik blok
// (adacık) rastgele yerleştirilir. Her bloğun hücre sayısı çifttir (2x2, 2x3,
// 3x2, 3x3), toplam çift sayıya yuvarlanır, böylece her dizim çözülebilir ve
// rün havuzunu (16 rün = 32 hücre) aşmaz. Deterministik (seeded): aynı seviye
// her zaman aynı dizimi üretir.
function randomShape(levelIndex: number, seedOffset = 0): Array<[number, number]> {
  const rng = mulberry32(levelIndex * 104729 + 13 + seedOffset);
  const cols = 8;
  const rows = 6;
  const MAX_CELLS = 40;
  const grid = new Set<string>();
  // Karmaşık taş dizimleri: dikdörtgen, L, T, artı, basamak ve kule şekilleri.
  const shapes = [
    { w: 3, h: 3, cells: rect(3, 3) },
    { w: 2, h: 3, cells: rect(2, 3) },
    { w: 4, h: 2, cells: rect(4, 2) },
    { w: 3, h: 3, cells: lShape() },
    { w: 3, h: 3, cells: tShape() },
    { w: 3, h: 3, cells: plusShape() },
    { w: 3, h: 3, cells: stair() },
    { w: 3, h: 4, cells: tower() },
  ];
  const blocks = 6 + (levelIndex % 7);
  for (let i = 0; i < blocks && grid.size < MAX_CELLS; i++) {
    const sh = shapes[Math.floor(rng() * shapes.length)];
    const cx = Math.floor(rng() * (cols - sh.w + 1));
    const cy = Math.floor(rng() * (rows - sh.h + 1));
    for (const pt of sh.cells) {
      grid.add((cx + pt[0]) + "," + (cy + pt[1]));
      if (grid.size >= MAX_CELLS) break;
    }
  }
  const cells = [...grid].map((s) => {
    const p = s.split(",").map(Number);
    return [p[0], p[1]] as [number, number];
  });
  // Çift hücre garantisi (çözülebilirlik).
  if (cells.length % 2 !== 0) cells.pop();
  return cells;
}

function rect(w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([x, y]);
  return out;
}
function lShape(): [number, number][] {
  return [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]];
}
function tShape(): [number, number][] {
  return [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]];
}
function plusShape(): [number, number][] {
  return [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
}
function stair(): [number, number][] {
  return [[0, 2], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]];
}
function tower(): [number, number][] {
  return [[1, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [1, 3]];
}

function turtleShape(): Array<[number, number]> {
  // Klasik kaplumbaganin taban katmani (87 tas). Ust katmanlar
  // (36 + 16 + 4 + 1) buildLayout icinde eklenir; toplam 144 tas.
  const out: Array<[number, number]> = [];
  const rowSpan = (r: number, c0: number, c1: number) => {
    for (let c = c0; c <= c1; c++) out.push([c, r]);
  };
  rowSpan(0, 2, 11);
  rowSpan(1, 1, 13);
  rowSpan(2, 1, 13);
  rowSpan(3, 0, 14);
  rowSpan(4, 1, 13);
  rowSpan(5, 1, 13);
  rowSpan(6, 2, 11);
  return out;
}

const RANDOM_BG: Array<[string, string]> = [
  ["#101f3a", "#1c3052"],
  ["#112a3a", "#1e4556"],
  ["#231a42", "#31285c"],
  ["#0d2a24", "#173e34"],
  ["#3a2a10", "#52401c"],
  ["#2a1430", "#3e2048"],
  ["#1f3a30", "#2c5447"],
  ["#402a1c", "#5a3b29"],
  ["#14203f", "#203057"],
  ["#33221f", "#4a3130"],
];

// Gun/ gece renk paletleri: [ust, alt] gradient (kis teması)
const DAY_NIGHT: Array<{ top: string; mid: string; bot: string; amb: string }> = [
  { top: "#0a1525", mid: "#0d1e30", bot: "#060e18", amb: "#0a1525" }, // 0.00 - gece (koyu lacivert)
  { top: "#0e1828", mid: "#142538", bot: "#081220", amb: "#0e1828" }, // 0.15 - gece sonu
  { top: "#1a1520", mid: "#2a2030", bot: "#120e18", amb: "#1a1520" }, // 0.25 - sabah (puslu)
  { top: "#1e2528", mid: "#2a3538", bot: "#141e20", amb: "#1e2528" }, // 0.35 - sabah (soguk)
  { top: "#151e28", mid: "#1e2a35", bot: "#0e1520", amb: "#151e28" }, // 0.50 - gun (karli)
  { top: "#1e2528", mid: "#2a3538", bot: "#141e20", amb: "#1e2528" }, // 0.65 - ogle
  { top: "#1a1520", mid: "#2a2030", bot: "#120e18", amb: "#1a1520" }, // 0.75 - aksam
  { top: "#12101e", mid: "#1a1530", bot: "#0a0814", amb: "#12101e" }, // 0.85 - aksam sonu
  { top: "#0a1525", mid: "#0d1e30", bot: "#060e18", amb: "#0a1525" }, // 1.00 - gece
];

function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [ar, ag, ab] = parse(a);
  const [br, bg2, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg2 - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return "#" + [r, g, bv].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function getDayNightColors(phase: number): { top: string; mid: string; bot: string; amb: string } {
  const idx = phase * (DAY_NIGHT.length - 1);
  const i = Math.floor(idx);
  const frac = idx - i;
  if (i >= DAY_NIGHT.length - 1) return DAY_NIGHT[DAY_NIGHT.length - 1];
  const a = DAY_NIGHT[i];
  const b = DAY_NIGHT[i + 1];
  return {
    top: lerpHex(a.top, b.top, frac),
    mid: lerpHex(a.mid, b.mid, frac),
    bot: lerpHex(a.bot, b.bot, frac),
    amb: lerpHex(a.amb, b.amb, frac),
  };
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private running = false;
  private last = 0;

  private tiles: Tile[] = [];
  private selectedId: number | null = null;
  private moves = 0;
  private seconds = 0;
  private won = false;
  private lost = false;
  private currentLevel: { name: string; cells: Array<[number, number]>; bg: [string, string] } | null = null;
  private history: Array<{ a: number; b: number }> = [];
  private levelIndex = 0;
  private tray: Array<{ id: number; symbol: string }> = []; // hazneye düşen eşlenen taşlar (max 4)
  private motifsCache: HTMLCanvasElement | null = null;
  private shards: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    max: number;
    color: string;
    r: number;
  }> = [];
  private bursts: Array<{ x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; r: number }> = [];
  private floats: Array<{ x: number; y: number; life: number; max: number; text: string; color: string }> = [];
  private pops: Array<{ x: number; y: number; life: number; max: number; symbol: string; open: boolean }> = [];
  private time = 0;
  private score = 0;
  private combo = 0;
  private comboTimer = 0;
  private fates: string[] = [];
  private shuffleCount = 0;
  private maxShuffles = 3;
  private hintIds: number[] = [];
  private audio: AudioContext | null = null;
  private tw = 72;
  private th = 100;
  private gap = 10;
  private flash = 0;
  private wonAt = 0;
  private dealAt = -1;
  private dealDelay = new Map<number, number>();
  private confetti: Array<{ x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string; life: number; max: number }> = [];
  private stars: Array<{ x: number; y: number; r: number; ph: number; sp: number }> = [];
  private embers: Array<{ x: number; y: number; vy: number; ph: number; r: number }> = [];
  private lifts: Map<number, number> = new Map();
  private hoverId: number | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private motto = "";
  private faceCache = new Map<string, HTMLCanvasElement>();
  private matchFx: { x1: number; y1: number; x2: number; y2: number; timer: number; max: number } | null = null;
  private shakeAmount = 0;
  private shakeX = 0;
  private shakeY = 0;
  private dustParticles: Array<{ x: number; y: number; vx: number; vy: number; r: number; alpha: number; ph: number }> = [];
  private floatingTexts: Array<{ x: number; y: number; life: number; max: number; text: string; color: string; size: number }> = [];
  private clickPops: Array<{ x: number; y: number; life: number; max: number; r: number }> = [];
  private rain: Array<{ x: number; y: number; speed: number; len: number; alpha: number }> = [];
  private ripples: Array<{ x: number; y: number; life: number; max: number; r: number }> = [];
  private victoryTiles: Array<{ x: number; y: number; vx: number; vy: number; rot: number; vr: number; alpha: number; symbol: string }> = [];
  private victoryRays: Array<{ angle: number; len: number; alpha: number }> = [];
  private victoryStarted = false;
  private dayPhase = 0.3;
  private DAY_CYCLE = 90;
  private nightAlpha = 0;
  private dawnDusk = 0;
  private snowflakes: Array<{ x: number; y: number; speed: number; size: number; wobble: number; alpha: number }> = [];
  private snowAccum: Map<number, number> = new Map(); // tas id -> kar kalinligi
  private meltDrops: Array<{ x: number; y: number; vx: number; vy: number; life: number; max: number; r: number }> = [];
  private winterMode = false;
  private rainMode = false;
  private lastMatchTime = 0;
  private timeBonusMult = 1;
  private streak = 0;
  private streakMult = 1;
  private jokerActive = false;
  private jokerUsed = false;
  private freezeActive = false;
  private freezeTimer = 0;
  private freezeCooldown = 0;
  private countdownTiles: Map<number, number> = new Map();
  private countdownMax = 10;
  private windParticles: Array<{ x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; color: string }> = [];
  private flameTrail: Array<{ x: number; y: number; life: number; max: number; r: number }> = [];
  private starRain: Array<{ x: number; y: number; vy: number; vx: number; rot: number; vr: number; size: number; alpha: number; color: string }> = [];
  private gateOpen = 0;
  private gatePhase = 0;
  private mistParticles: Array<{ x: number; y: number; r: number; alpha: number; vx: number }> = [];
  private achievements: Set<string> = new Set();
  private showAchievement = "";
  private achievementTimer = 0;
  private gameMode: GameMode = "classic";
  private raceTimeLeft = 60;
  private raceDuration = 60;

  onHud?: (h: HudState) => void;
  setMode(mode: GameMode): void { this.gameMode = mode; this.newGame(); }
  getMode(): GameMode { return this.gameMode; }

  /** Ses motoruna erişim (mute butonu icin). */
  getSound() { return SoundEngine; }
  toggleMute(): boolean { return SoundEngine.toggleMute(); }
  isMuted(): boolean { return SoundEngine.isMuted(); }
  // ---- Basari Sistemi ----
  private ACHV_NAMES: Record<string, string> = { clean_win: "Temiz Zafer", combo5: "Kombo Ustasi", combo10: "Efsane Kombo", speed_demon: "Hizli Seytan", high_score: "Yuksek Skor", first_loss: "Ilk Yenilgi" };
  private unlockAchievement(id: string): void { if (this.achievements.has(id)) return; this.achievements.add(id); this.showAchievement = this.ACHV_NAMES[id] ?? id; this.achievementTimer = 3; }
  private loadAchievements(): void { try { const raw = localStorage.getItem("otuken_achievements"); if (raw) this.achievements = new Set(JSON.parse(raw)); } catch {} }
  private saveAchievements(): void { try { localStorage.setItem("otuken_achievements", JSON.stringify([...this.achievements])); } catch {} }
  // ---- Tema Kilitleri ----
  private THEME_UNLOCK_LEVELS = [3, 6, 9, 12];
  private checkThemeUnlock(): void { localStorage.setItem("otuken_themes", JSON.stringify(this.getUnlockedThemes())); }
  private getUnlockedThemes(): number[] { try { const raw = localStorage.getItem("otuken_themes"); return raw ? JSON.parse(raw) : [0]; } catch { return [0]; } }
  public getThemeCount(): number { return 1 + this.THEME_UNLOCK_LEVELS.filter((l) => this.levelIndex >= l).length; }
  public isThemeUnlocked(idx: number): boolean { return this.getUnlockedThemes().includes(idx); }
  // ---- Donma Modu ----
  public activateFreeze(): boolean { if (this.freezeActive || this.freezeCooldown > 0 || this.won || this.lost) return false; this.freezeActive = true; this.freezeTimer = 5; this.freezeCooldown = 20; this.sfx("match"); return true; }
  public getFreezeTimer(): number { return this.freezeTimer; }
  public getFreezeCooldown(): number { return this.freezeCooldown; }
  // ---- Joker ----
  public activateJoker(): boolean { if (this.jokerUsed || this.won || this.lost) return false; this.jokerActive = true; this.jokerUsed = true; this.sfx("match"); return true; }
  public isJokerActive(): boolean { return this.jokerActive; }

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    this.ctx = canvas.getContext("2d")!;
    for (let i = 0; i < 46; i++) {
      this.stars.push({
        x: 20 + Math.random() * (CANVAS_W - 40),
        y: 95 + Math.random() * 330,
        r: 0.6 + Math.random() * 1.4,
        ph: Math.random() * 6.28,
        sp: 0.8 + Math.random() * 2.2,
      });
    }
    for (let i = 0; i < 9; i++) {
      this.embers.push({
        x: 30 + (Math.random() - 0.5) * 36,
        y: 1201 - Math.random() * 70,
        vy: 14 + Math.random() * 18,
        ph: Math.random() * 6.28,
        r: 1 + Math.random() * 1.6,
      });
    }
    for (let i = 0; i < 60; i++) {
      this.rain.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        speed: 600 + Math.random() * 400,
        len: 18 + Math.random() * 24,
        alpha: 0.12 + Math.random() * 0.18,
      });
    }
    for (let i = 0; i < 80; i++) {
      this.snowflakes.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        speed: 40 + Math.random() * 80,
        size: 1.5 + Math.random() * 3,
        wobble: Math.random() * Math.PI * 2,
        alpha: 0.4 + Math.random() * 0.5,
      });
    }
    this.loadAchievements();
    this.newGame();
  }

  start(): void {
    this.running = true;
    this.last = performance.now();
    this.bind();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.unbind();
  }

  private bind(): void {
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointerleave", this.onLeave);
  }
  private unbind(): void {
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
  }
  private onMove = (e: PointerEvent): void => {
    if (this.won || this.lost) {
      this.hoverId = null;
      this.canvas.style.cursor = "default";
      return;
    }
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * this.canvas.width;
    const y = ((e.clientY - r.top) / r.height) * this.canvas.height;
    let hit: number | null = null;
    let best = -1;
    for (const t of this.tiles) {
      if (t.removed || !this.isOpen(t) || !this.sideFree(t)) continue;
      if (
        x >= t.sx - this.tw / 2 &&
        x <= t.sx + this.tw / 2 &&
        y >= t.sy - this.th / 2 &&
        y <= t.sy + this.th / 2
      ) {
        if (t.layer > best) {
          best = t.layer;
          hit = t.id;
        }
      }
    }
    this.hoverId = hit;
    this.canvas.style.cursor = hit ? "pointer" : "default";
  };
  private onLeave = (): void => {
    this.hoverId = null;
  };
  private onDown = (e: PointerEvent): void => {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * this.canvas.width;
    const y = ((e.clientY - r.top) / r.height) * this.canvas.height;
    this.click(x, y);
  };

  // ---- Yerleşim ----
  private level(): { name: string; cells: Array<[number, number]>; bg: [string, string] } {
    if (!this.currentLevel) {
      // Her oyunda farkli bir rastgele dizilim + rastgele gecmis/bg.
      const cells = randomShape(this.levelIndex, Math.floor(Math.random() * 100000) + 1);
      const special = this.specialArt();
      const mixedBg = ["#2f3b1c", "#4a5b2a"] as [string, string];
      const bg = special === "mixed" ? mixedBg : RANDOM_BG[this.levelIndex % RANDOM_BG.length];
      const name =
        this.levelIndex < LEVELS.length
          ? LEVELS[this.levelIndex].name
          : special === "mixed"
            ? "Vahşi Bozkır"
            : `Rastgele #${this.levelIndex + 1}`;
      this.currentLevel = { name, cells, bg };
    }
    return this.currentLevel;
  }


  private buildLayout(): void {
    const def = this.level();
    const cells = def.cells;
    const isTurtle = def.name === "Klasik 144";

    let cols = 0;
    let rows = 0;
    for (const [c, r] of cells) {
      if (c > cols) cols = c;
      if (r > rows) rows = r;
    }
    this.layoutCols = cols + 1;
    this.layoutRows = rows + 1;

    // Dinamik tas boyutu: tahta tuvale sigmayacak kadar genis/yuksekse kucult.
    const maxW = CANVAS_W - 40;
    const maxH = CANVAS_H - 330;
    let tw = 72;
    const ar = 100 / 72;
    const gp = (w: number) => Math.max(3, Math.round(w * 0.14));
    while (tw > 24 && (cols * (tw + gp(tw)) > maxW || rows * (tw * ar + gp(tw)) > maxH)) tw -= 2;
    this.tw = tw;
    this.th = Math.round(tw * ar);
    this.gap = gp(tw);

    // Katmanlar: kaplumbagada acik katman disari; digerlerinde kademeli kule.
    let layers: Array<Array<[number, number]>>;
    if (isTurtle) {
      const has = (c: number, r: number) => cells.some(([cc, rr]) => cc === c && rr === r);
      const rect = (c0: number, c1: number, r0: number, r1: number) => {
        const out: Array<[number, number]> = [];
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++) if (has(c, r)) out.push([c, r]);
        return out;
      };
      layers = [cells.slice(), rect(4, 9, 1, 6), rect(5, 8, 2, 5), rect(6, 7, 3, 4), [[6, 3]]];
    } else {
      // Kademeli platform derinligi: kenar 1 kat, orta 2 kat, merkez kule 2-4 kat.
      const coreDepth = this.levelIndex >= 49 ? 4 : this.levelIndex >= 9 ? 3 : 2;
      const cMn = Math.max(0, Math.floor((cols + 1) / 3));
      const cMx = Math.min(cols, cols - 1 - Math.floor((cols + 1) / 3));
      const rMn = Math.max(0, Math.floor((rows + 1) / 3));
      const rMx = Math.min(rows, rows - 1 - Math.floor((rows + 1) / 3));
      const isCore = (c: number, r: number) => c >= cMn && c <= cMx && r >= rMn && r <= rMx;
      const isRing = (c: number, r: number) => c === 0 || r === 0 || c === cols || r === rows;
      const midCount = cells.filter(([c, r]) => !isRing(c, r)).length;
      const depthOf = (c: number, r: number) => {
        if (isCore(c, r)) return coreDepth;
        if (isRing(c, r) && midCount >= 4) return 1;
        return 2;
      };
      const even = <T,>(a: T[]): T[] => (a.length % 2 === 0 ? a : a.slice(0, -1));
      layers = [];
      for (let L = 0; L < coreDepth; L++) {
        layers.push(even(cells.filter(([c, r]) => depthOf(c, r) >= L + 1)));
      }
    }

    // Tum yerlesim hucreleri (katmanli).
    const slots: Array<{ c: number; r: number; L: number }> = [];
    for (let L = 0; L < layers.length; L++)
      for (const [c, r] of layers[L]) slots.push({ c, r, L });
    if (slots.length % 2 === 1) slots.pop();

    // Sembol atamasi: kaldirma simulasyonu ile cozulebilirlik garantisi.
    const pairsNeeded = Math.floor(slots.length / 2);
    let assigned: string[] | null = null;
    for (let attempt = 0; attempt < 60 && !assigned; attempt++) {
      const pool = buildPoolPairs();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      assigned = this.assignSolvable(slots, pool.slice(0, pairsNeeded));
    }
    if (!assigned) {
      // Son care: sirayla ikiz cift (eslesme garantili, cozum sirasi garanti degil).
      assigned = [];
      const pool = buildPoolPairs();
      for (let i = 0; i < pairsNeeded; i++) assigned.push(pool[i][0], pool[i][1]);
    }
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      this.tiles.push(this.makeTile(assigned[i], sl.c, sl.r, sl.L));
    }
    // Taslarin tahtaya sirayla konma animasyonu (alt katmanlardan baslar).
    this.dealDelay = new Map<number, number>();
    this.tiles.forEach((t, i) => this.dealDelay.set(t.id, i * 0.012));
    this.dealAt = this.time;
    this.dealRattle();
    this.countdownTiles.clear();
    for (const t of this.tiles) {
      if (Math.random() < 0.2) this.countdownTiles.set(t.id, this.countdownMax);
    }
  }

  /** Kaldirma sirasini simule eder: her adimda acik bir cift secip havada
   *  kaldirir. Basarili olursa donen dizinin her adimi oynanabilir oldugu
   *  icin seviye garantili cozulebilir olur. */
  private assignSolvable(
    slots: Array<{ c: number; r: number; L: number }>,
    pool: Array<[string, string]>,
  ): string[] | null {
    const n = slots.length;
    const alive = new Array<boolean>(n).fill(true);
    const out: string[] = new Array<string>(n);
    const above: number[][] = new Array(n);
    const lft: number[][] = new Array(n);
    const rgt: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      above[i] = [];
      lft[i] = [];
      rgt[i] = [];
    }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const a = slots[i];
        const b = slots[j];
        if (a.c === b.c && a.r === b.r && b.L > a.L) above[i].push(j);
        if (a.r === b.r && b.L >= a.L) {
          if (b.c === a.c - 1) lft[i].push(j);
          else if (b.c === a.c + 1) rgt[i].push(j);
        }
      }
    const isFree = (i: number): boolean => {
      for (const j of above[i]) if (alive[j]) return false;
      const L = lft[i].some((j) => alive[j]);
      const R = rgt[i].some((j) => alive[j]);
      return !L || !R;
    };
    for (let p = 0; p < pool.length; p++) {
      const free: number[] = [];
      for (let i = 0; i < n; i++) if (alive[i] && isFree(i)) free.push(i);
      if (free.length < 2) return null;
      const a = free[Math.floor(Math.random() * free.length)];
      let b = a;
      while (b === a) b = free[Math.floor(Math.random() * free.length)];
      alive[a] = false;
      alive[b] = false;
      out[a] = pool[p][0];
      out[b] = pool[p][1];
    }
    return out;
  }
  private layoutCols = 4;
  private layoutRows = 4;

  /** Sağ panelin sol kenarına göre, tahtanın ortalanacağı x merkezi. */
  private boardOriginX(): number {
    return CANVAS_W / 2;
  }

  private makeTile(symbol: string, col: number, row: number, layer: number): Tile {
    // Üst katman aynı hücrenin üzerine hafifçe kayarak biner (mahjong hissi).
    const tw = this.tw;
    const th = this.th;
    const gap = this.gap;
    const ox = layer * tw * 0.17;
    const oy = layer * -th * 0.14;
    const boardW = this.layoutCols * (tw + gap);
    const boardH = this.layoutRows * (th + gap);
    const sx0 = this.boardOriginX() - boardW / 2;
    const sy0 = (CANVAS_H - boardH) / 2 + 30;
    const sx = sx0 + col * (tw + gap) + ox;
    const sy = sy0 + row * (th + gap) + oy;
    return {
      id: col * 1000 + row * 10 + layer,
      symbol,
      x: col,
      y: row,
      layer,
      removed: false,
      sx,
      sy,
    };
  }

  newGame(): void {
    this.tiles = [];
    this.selectedId = null;
    this.moves = 0;
    this.lifts.clear();
    this.hoverId = null;
    this.seconds = 0;
    this.won = false;
    this.lost = false;
    this.currentLevel = null;
    this.history = [];
    this.tray = [];
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.shards = [];
    // Ambient dust: arka plan ucusan tanecikler
    this.dustParticles = [];
    for (let i = 0; i < 30; i++) {
      this.dustParticles.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        vx: (Math.random() - 0.5) * 8,
        vy: -4 - Math.random() * 10,
        r: 0.8 + Math.random() * 1.5,
        alpha: 0.08 + Math.random() * 0.12,
        ph: Math.random() * Math.PI * 2,
      });
    }
    this.shuffleCount = 0;
    this.hintIds = [];
    this.confetti = [];
    this.victoryTiles = [];
    this.victoryRays = [];
    this.victoryStarted = false;
    this.snowAccum.clear();
    this.meltDrops = [];
    const weatherRoll = Math.random();
    this.winterMode = weatherRoll < 0.5;
    this.rainMode = !this.winterMode;
    this.lastMatchTime = 0;
    this.timeBonusMult = 1;
    this.streak = 0;
    this.streakMult = 1;
    this.jokerActive = false;
    this.jokerUsed = false;
    this.freezeActive = false;
    this.freezeTimer = 0;
    this.freezeCooldown = 0;
    this.countdownTiles.clear();
    this.windParticles = [];
    this.flameTrail = [];
    this.starRain = [];
    this.gateOpen = 0;
    this.gatePhase = 0;
    this.mistParticles = [];
    this.showAchievement = "";
    this.achievementTimer = 0;
    this.raceTimeLeft = this.raceDuration;
    this.flash = 0;
    this.wonAt = 0;
    this.fates = this.rollFates();
    this.motto = MOTTOS[Math.floor(Math.random() * MOTTOS.length)];
    this.buildLayout();
    this.emitHud();
  }

  /** Bir sonraki seviyeye geçer; elle tanımlılar bittikten sonra rastgele
   *  seviyeler başlar ve 1000+ farklı dizime kadar ilerlenebilir. */
  nextLevel(): void {
    this.levelIndex++;
    this.newGame();
  }

  goToLevel(i: number): void {
    this.levelIndex = ((i % LEVELS.length) + LEVELS.length) % LEVELS.length;
    this.newGame();
  }

  getLevelIndex(): number {
    return this.levelIndex;
  }

  getLevelCount(): number {
    return LEVELS.length;
  }

  undo(): void {
    // Hazneden son tasi geri yerine koy
    if (this.tray.length > 0) {
      const last = this.tray.pop()!;
      const tile = this.tiles.find((t) => t.id === last.id);
      if (tile) tile.removed = false;
      this.selectedId = null;
      this.sfx("undo");
      this.emitHud();
      return;
    }
    // Hazne bossa, son eslesmeyi geri al
    const last = this.history.pop();
    if (!last) return;
    const a = this.tiles.find((t) => t.id === last.a);
    const b = this.tiles.find((t) => t.id === last.b);
    if (a) a.removed = false;
    if (b) b.removed = false;
    this.selectedId = null;
    this.moves = Math.max(0, this.moves - 1);
    this.sfx("undo");
    this.emitHud();
  }

  // ---- Mantık ----
  private topAt(col: number, row: number): Tile | null {
    let top: Tile | null = null;
    for (const t of this.tiles) {
      if (t.removed) continue;
      if (t.x === col && t.y === row) {
        if (!top || t.layer > top.layer) top = t;
      }
    }
    return top;
  }

  /** Taş açık mı? Üstünde taş yok (aynı x,y üstte). */
  private isOpen(t: Tile): boolean {
    if (t.removed) return false;
    const top = this.topAt(t.x, t.y);
    return top === t;
  }

  /** Yanı (sol ve sağ yatay komşusu) en az biri boş mu, ya da
   *  yandaki taş alt dizide (daha alt katmanda) mı? Yüksekte kalan taş,
   *  yanındaki taş aynı veya daha üst katmandaysa bloklanır; alt katmandaysa alınabilir. */
  private sideFree(t: Tile): boolean {
    const blocking = (x: number) =>
      this.tiles.some(
        (o) => !o.removed && o.x === x && o.y === t.y && o.layer >= t.layer,
      );
    return !blocking(t.x - 1) || !blocking(t.x + 1);
  }

  private retryHit(x: number, y: number): boolean {
    const bcx = CANVAS_W / 2, bcy = CANVAS_H - 380;
    return x >= bcx - 105 && x <= bcx + 105 && y >= bcy - 29 && y <= bcy + 29;
  }

  private click(x: number, y: number): void {
    if (this.won) return;
    if (this.lost) {
      if (this.retryHit(x, y)) this.newGame();
      return;
    }
    // En üstteki tıklanan açık taş.
    let target: Tile | null = null;
    for (const t of this.tiles) {
      if (!this.isOpen(t) || !this.sideFree(t)) continue;
      const halfW = this.tw / 2;
      const halfH = this.th / 2;
      if (
        x >= t.sx - halfW &&
        x <= t.sx + halfW &&
        y >= t.sy - halfH &&
        y <= t.sy + halfH
      ) {
        if (!target || t.layer > target.layer) target = t;
      }
    }
    if (!target) return;
    if (this.freezeActive) return;
    // Puzzle modu: sadece gecerli hamlelere izin ver
    if (this.gameMode === "puzzle") {
      let hasValidMove = false;
      for (const trayItem of this.tray) {
        if (matchKey(trayItem.symbol) === matchKey(target.symbol)) { hasValidMove = true; break; }
      }
      if (!hasValidMove && this.tray.length < this.maxTray() - 1) hasValidMove = true;
      if (!hasValidMove) return;
    }
    if (this.jokerActive && this.isOpen(target) && this.sideFree(target)) {
      this.jokerActive = false;
      target.removed = true;
      this.floats.push({ x: target.sx, y: target.sy, life: 1.2, max: 1.2, text: "JOKER!", color: "#ff44aa" });
      this.sfx("match");
      return;
    }

    // Eslesme kontrolu: haznede ayni desenden var mi?
    let matchBoardTile: Tile | null = null;
    {
      const lastIdx = this.tray.length;
      for (let i = 0; i < lastIdx; i++) {
        if (matchKey(this.tray[i].symbol) === matchKey(target.symbol)) {
          const mtt = this.tiles.find((tt) => tt.id === this.tray[i].id && !tt.removed && this.isOpen(tt));
          if (mtt) matchBoardTile = mtt;
          break;
        }
      }
    }

    // Taşı tahtadan alıp hazneye tek tek ekle.
    target.removed = true;
    // Kış teması: erime su damlacıkları
    if (this.winterMode) {
      const dropCount = 6 + Math.floor(Math.random() * 4);
      for (let i = 0; i < dropCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 100;
        this.meltDrops.push({
          x: target.sx + (Math.random() - 0.5) * this.tw * 0.6,
          y: target.sy + (Math.random() - 0.5) * this.th * 0.3,
          vx: Math.cos(ang) * spd * 0.4,
          vy: -Math.abs(Math.sin(ang) * spd) - 30,
          life: 0.8 + Math.random() * 0.5,
          max: 1.3,
          r: 1.5 + Math.random() * 2,
        });
      }
      // Kar birikimini temizle
      this.snowAccum.delete(target.id);
    }
    this.tray.push({ id: target.id, symbol: target.symbol });

    // Haznede aynı desenden 2 varsa -> kır (eşleşme).
    const lastIdx = this.tray.length - 1;
    let pairIdx = -1;
    for (let i = 0; i < lastIdx; i++) {
      if (matchKey(this.tray[i].symbol) === matchKey(target.symbol)) {
        pairIdx = i;
        break;
      }
    }
    const now = this.time;
    if (this.lastMatchTime > 0 && now - this.lastMatchTime < 3) {
      this.timeBonusMult = Math.min(4, this.timeBonusMult + 0.5);
    } else {
      this.timeBonusMult = 1;
    }
    this.lastMatchTime = now;
    this.streak++;
    this.streakMult = this.streak >= 8 ? 5 : this.streak >= 5 ? 3 : this.streak >= 2 ? 2 : 1;
    for (const t of this.tiles) {
      if (!t.removed && this.countdownTiles.has(t.id)) {
        const rem = (this.countdownTiles.get(t.id) ?? 1) - 1;
        if (rem <= 0) {
          this.countdownTiles.delete(t.id);
          t.removed = true;
          this.floats.push({ x: t.sx, y: t.sy, life: 1, max: 1, text: "Zamani doldu!", color: "#ff6644" });
        } else {
          this.countdownTiles.set(t.id, rem);
        }
      }
    }
    if (pairIdx !== -1) {
      // Eslesme VFX: iki tas arasinda altin huzme
      if (matchBoardTile) {
        this.matchFx = { x1: matchBoardTile.sx, y1: matchBoardTile.sy, x2: target.sx, y2: target.sy, timer: 0.35, max: 0.35 };
        // Screen shake
        this.shakeAmount = 6;
        // Floating score text
        const mx = (matchBoardTile.sx + target.sx) / 2;
        const my = (matchBoardTile.sy + target.sy) / 2;
        const pts = Math.round(100 * (1 + (this.combo) * 0.15) * (this.combo + 1) * this.scoreMult());
        this.floatingTexts.push({ x: mx, y: my - 15, life: 0.7, max: 0.7, text: "+" + pts, color: "#ffd75e", size: 28 });
        if (this.combo >= 2) {
          this.floatingTexts.push({ x: mx, y: my - 40, life: 0.9, max: 0.9, text: this.combo >= 4 ? "MÜKEMMEL!" : this.combo >= 3 ? "HARİKA!" : "KOMBO!", color: "#ff8844", size: 22 });
        }
        // Match parcaciklari (12-15 adet)
        for (let i = 0; i < 14; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 80 + Math.random() * 200;
          this.shards.push({
            x: mx,
            y: my,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 100,
            life: 0.5 + Math.random() * 0.5,
            max: 1,
            color: i % 3 === 0 ? "#4fb3a0" : "#ffd75e",
            r: 2 + Math.random() * 4,
          });
        }
        // Click pop aura
        this.clickPops.push({ x: mx, y: my, life: 0.4, max: 0.4, r: 30 });
      }
      this.breakPair(pairIdx, lastIdx);
    } else if (this.tray.length >= this.maxTray()) {
      if (this.gameMode === "zen") {
        this.tray.shift();
      } else {
        this.lost = true;
        this.sfx("lose");
        this.unlockAchievement("first_loss");
      }
    } else {
      this.sfx("tileclick");
      this.streak = 0;
      this.streakMult = 1;
    }

    // Kazanma (endless modda atla - breakPair'da yenilenir).
    if (this.gameMode !== "endless" && this.tiles.every((t) => t.removed)) {
      this.won = true;
      this.wonAt = this.time;
      this.sfx("win");
      this.recordProgress();
      const cc = ["#ffd75e", "#e74c3c", "#2e8b57", "#3498db", "#e67e22", "#f8f1e0"];
      for (let i = 0; i < 140; i++) {
        this.confetti.push({
          x: Math.random() * CANVAS_W,
          y: -20 - Math.random() * 420,
          vx: (Math.random() - 0.5) * 90,
          vy: 90 + Math.random() * 160,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 8,
          w: 5 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          color: cc[Math.floor(Math.random() * cc.length)],
          life: 6 + Math.random() * 3,
          max: 9,
        });
      }
      // Zafer sinematik: taslar yukari ucsun
      this.victoryStarted = true;
      this.victoryTiles = [];
      this.victoryRays = [];
      const syms = ["b1","c1","w1","E","S","DR","f1","s1"];
      for (let i = 0; i < 24; i++) {
        const sx = CANVAS_W * 0.2 + Math.random() * CANVAS_W * 0.6;
        const sy = CANVAS_H * 0.3 + Math.random() * CANVAS_H * 0.4;
        this.victoryTiles.push({
          x: sx, y: sy,
          vx: (Math.random() - 0.5) * 80,
          vy: -120 - Math.random() * 180,
          rot: (Math.random() - 0.5) * 0.5,
          vr: (Math.random() - 0.5) * 4,
          alpha: 1,
          symbol: syms[Math.floor(Math.random() * syms.length)],
        });
      }
      for (let i = 0; i < 12; i++) {
        this.victoryRays.push({
          angle: (i / 12) * Math.PI * 2,
          len: 200 + Math.random() * 300,
          alpha: 0,
        });
      }
      if (this.shuffleCount === 0) {
        this.score += 500;
        this.floats.push({ x: CANVAS_W / 2, y: CANVAS_H / 2 - 40, life: 1.4, max: 1.4, text: "Temiz Zafer! +500", color: "#ffd75e" });
        this.unlockAchievement("clean_win");
      }
      this.gatePhase = 1;
      this.gateOpen = 0;
      if (this.combo >= 5) this.unlockAchievement("combo5");
      if (this.combo >= 10) this.unlockAchievement("combo10");
      if (this.moves <= 20) this.unlockAchievement("speed_demon");
      if (this.score >= 2000) this.unlockAchievement("high_score");
      this.saveAchievements();
      this.checkThemeUnlock();
    }
    this.emitHud();
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };
  private update(dt: number): void {
    this.time += dt;
    if (!this.won && !this.lost) {
      this.seconds += dt;
      if (this.gameMode === "race" && this.moves > 0) {
        this.raceTimeLeft -= dt;
        if (this.raceTimeLeft <= 0) {
          this.raceTimeLeft = 0;
          this.lost = true;
          this.sfx("lose");
        }
      }
    }
    // Gun/gece donusu
    this.dayPhase = (this.time % this.DAY_CYCLE) / this.DAY_CYCLE;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    // Kırılma parçalarını güncelle.
    for (const s of this.shards) {
      s.life -= dt;
      s.vy += 900 * dt; // yerçekimi
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y > CANVAS_H - 30) {
        s.y = CANVAS_H - 30;
        s.vy *= -0.4;
        s.vx *= 0.7;
      }
    }
    this.shards = this.shards.filter((s) => s.life > 0);
    for (const b of this.bursts) { b.life -= dt; b.vy += 600 * dt; b.x += b.vx * dt; b.y += b.vy * dt; }
    this.bursts = this.bursts.filter((b) => b.life > 0);
    for (const f of this.floats) { f.life -= dt; f.y -= 40 * dt; }
    this.floats = this.floats.filter((f) => f.life > 0);
    for (const pp of this.pops) pp.life -= dt;
    this.pops = this.pops.filter((pp) => pp.life > 0);
    // Tas kaldi yayi (hover + secim)
    for (const t of this.tiles) {
      if (t.removed) {
        this.lifts.delete(t.id);
        continue;
      }
      const target = t.id === this.selectedId ? -7 : t.id === this.hoverId ? -3.5 : 0;
      const cur = this.lifts.get(t.id) ?? 0;
      if (cur === target) continue;
      const nx = cur + (target - cur) * Math.min(1, dt * 15);
      this.lifts.set(t.id, Math.abs(nx - target) < 0.03 ? target : nx);
    }
    // Ekran parlama sonumu
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.8);
    // Screen shake sönümü
    if (this.shakeAmount > 0) {
      this.shakeX = (Math.random() - 0.5) * this.shakeAmount * 2;
      this.shakeY = (Math.random() - 0.5) * this.shakeAmount * 2;
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 40);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    // Floating text guncelleme
    for (const ft of this.floatingTexts) { ft.life -= dt; ft.y -= 55 * dt; }
    this.floatingTexts = this.floatingTexts.filter((f) => f.life > 0);
    // Click pop aura guncelleme
    for (const cp of this.clickPops) { cp.life -= dt; }
    this.clickPops = this.clickPops.filter((cp) => cp.life > 0);
    // Ambient dust guncelleme
    for (const d of this.dustParticles) {
      d.x += d.vx * dt + Math.sin(this.time * 0.4 + d.ph) * 6 * dt;
      d.y += d.vy * dt;
      if (d.y < -10) { d.y = CANVAS_H + 10; d.x = Math.random() * CANVAS_W; }
      if (d.x < -10) d.x = CANVAS_W + 10;
      if (d.x > CANVAS_W + 10) d.x = -10;
    }
    // Ocak kizarlari yukari suruklenir
    for (const e of this.embers) {
      e.y -= e.vy * dt;
      e.x += Math.sin(this.time * 3 + e.ph) * 14 * dt;
      if (e.y < 1117) {
        e.y = 1201 + Math.random() * 8;
        e.x = 30 + (Math.random() - 0.5) * 36;
        e.vy = 14 + Math.random() * 18;
        e.ph = Math.random() * 6.28;
      }
    }
    // Konfeti parcalari
    for (const p of this.confetti) {
      p.life -= dt;
      p.vy += 40 * dt;
      p.x += p.vx * dt + Math.sin(this.time * 3 + p.rot * 5) * 30 * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.confetti = this.confetti.filter((p) => p.life > 0 && p.y < CANVAS_H + 40);
    // Yagmur damlalari guncelleme (sadece yagmur modunda)
    if (this.rainMode) {
      for (const r of this.rain) {
        r.y += r.speed * dt;
        r.x += 30 * dt; // hafif yatay ruzgar
        if (r.y > CANVAS_H + 10) {
          if (r.y < CANVAS_H + 60 && Math.random() < 0.3) {
            this.ripples.push({ x: r.x, y: CANVAS_H - 20 + Math.random() * 30, life: 1.2, max: 1.2, r: 0 });
          }
          r.y = -r.len;
          r.x = Math.random() * CANVAS_W;
        }
      }
      for (const rp of this.ripples) {
        rp.life -= dt;
        rp.r += 35 * dt;
      }
      this.ripples = this.ripples.filter((rp) => rp.life > 0);
    }
    // Kar taneleri guncelleme (sadece kis modunda)
    if (this.winterMode) {
      for (const sf of this.snowflakes) {
        sf.y += sf.speed * dt;
        sf.x += Math.sin(this.time * 0.8 + sf.wobble) * 20 * dt;
        if (sf.y > CANVAS_H + 10) {
          sf.y = -10;
          sf.x = Math.random() * CANVAS_W;
        }
      }
    }
    // Erime su damlalari guncelleme
    for (const md of this.meltDrops) {
      md.vy += 400 * dt; // yerçekimi
      md.x += md.vx * dt;
      md.y += md.vy * dt;
      md.life -= dt;
    }
    this.meltDrops = this.meltDrops.filter((md) => md.life > 0 && md.y < CANVAS_H + 20);
    // Zafer sinematik guncelleme
    if (this.victoryStarted) {
      for (const vt of this.victoryTiles) {
        vt.vy -= 120 * dt; // yukari cekilm
        vt.vy *= 0.98;
        vt.x += vt.vx * dt;
        vt.y += vt.vy * dt;
        vt.rot += vt.vr * dt;
        vt.alpha = Math.max(0, vt.alpha - dt * 0.4);
      }
      this.victoryTiles = this.victoryTiles.filter((vt) => vt.alpha > 0);
      for (const ray of this.victoryRays) {
        ray.alpha = Math.min(0.6, ray.alpha + dt * 0.8);
      }
    }
    if (this.freezeActive) { this.freezeTimer -= dt; if (this.freezeTimer <= 0) this.freezeActive = false; }
    if (this.freezeCooldown > 0) this.freezeCooldown -= dt;
    for (const wp of this.windParticles) { wp.life -= dt; wp.x += wp.vx * dt; wp.y += wp.vy * dt; wp.vy += 100 * dt; }
    this.windParticles = this.windParticles.filter((wp) => wp.life > 0);
    if (this.selectedId !== null) {
      const sel = this.tiles.find((t) => t.id === this.selectedId);
      if (sel && !sel.removed) this.flameTrail.push({ x: sel.sx + (Math.random() - 0.5) * 8, y: sel.sy + (Math.random() - 0.5) * 8, life: 0.5, max: 0.5, r: 3 + Math.random() * 4 });
    }
    for (const ft of this.flameTrail) ft.life -= dt;
    this.flameTrail = this.flameTrail.filter((ft) => ft.life > 0);
    for (const sr of this.starRain) { sr.y += sr.vy * dt; sr.x += sr.vx * dt; sr.rot += sr.vr * dt; sr.alpha -= dt * 0.3; }
    this.starRain = this.starRain.filter((sr) => sr.alpha > 0 && sr.y < CANVAS_H + 20);
    if (this.gatePhase > 0 && this.gatePhase < 2) { this.gateOpen = Math.min(1, this.gateOpen + dt * 0.8); if (this.gateOpen >= 1) this.gatePhase = 2; }
    if (this.dealAt >= 0) { for (const t of this.tiles) { if (Math.random() < 0.02) this.mistParticles.push({ x: t.sx + (Math.random() - 0.5) * 30, y: t.sy, r: 15 + Math.random() * 20, alpha: 0.4, vx: (Math.random() - 0.5) * 20 }); } }
    for (const mp of this.mistParticles) { mp.alpha -= dt * 0.5; mp.x += mp.vx * dt; mp.y -= 15 * dt; }
    this.mistParticles = this.mistParticles.filter((mp) => mp.alpha > 0);
    if (this.showAchievement) { this.achievementTimer -= dt; if (this.achievementTimer <= 0) this.showAchievement = ""; }
    // Eslesme huzme animasyonu
    if (this.matchFx) {
      this.matchFx.timer -= dt;
      if (this.matchFx.timer <= 0) this.matchFx = null;
    }
  }

  /** Haznedeki 4 taşı parçalara ayırıp patlatır ve hazneyi boşaltır. */
    /** Haznedeki pairIdx ve lastIdx slotlarindaki iki tasi kirar. */
  private breakPair(a: number, b: number): void {
    this.sfx("match");
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    const eA = this.tray[a];
    const eB = this.tray[b];
    if (eA && eB) {
      const btA = this.tiles.find((tt) => tt.id === eA.id);
      const btB = this.tiles.find((tt) => tt.id === eB.id);
      for (const bt of [btA, btB]) {
        if (!bt) continue;
        for (let k = 0; k < 18; k++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 90 + Math.random() * 260;
          this.bursts.push({ x: bt.sx, y: bt.sy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 60, life: 0.7, max: 1, color: tileColor(bt.symbol), r: 3 + Math.random() * 6 });
        }
        // Altin/turkuaz isik parcaciklari (yukari suzulen, 400ms)
        const pColors = ["#ffd75e", "#ffe9a8", "#4fb3a0", "#a8e6d8", "#ffd75e"];
        for (let k = 0; k < 10; k++) {
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
          const spd = 120 + Math.random() * 200;
          this.bursts.push({
            x: bt.sx + (Math.random() - 0.5) * 20,
            y: bt.sy - 10,
            vx: Math.cos(ang) * spd * 0.5,
            vy: Math.sin(ang) * spd,
            life: 0.4,
            max: 0.4,
            color: pColors[k % pColors.length],
            r: 2 + Math.random() * 3,
          });
        }
        this.bursts.push({ x: bt.sx, y: bt.sy, vx: 0, vy: -40, life: 0.35, max: 0.35, color: "#ffffff", r: 26 });
      }
      this.floats.push({ x: (btA!.sx + btB!.sx) / 2, y: (btA!.sy + btB!.sy) / 2 - 10, life: 1.0, max: 1.0, text: "+2", color: "#ffd75e" });
    }
    const shard = (slot: number, sym: string) => {
      const bx = CANVAS_W / 2 + (slot - 1.5) * 40;
      for (let k = 0; k < 6; k++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 180;
        this.shards.push({
          x: bx,
          y: CANVAS_H - 58,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 120,
          life: 0.7 + Math.random() * 0.5,
          max: 1,
          color: tileColor(sym),
          r: 3 + Math.random() * 5,
        });
      }
    };
    shard(a, eA.symbol);
    shard(b, eB.symbol);
    this.history.push({ a: eA.id, b: eB.id });
    this.moves++;
    this.tray.splice(b, 1);
    this.tray.splice(a, 1);
    this.combo++;
    if (this.combo >= 2) this.sfx("combo");
    if (this.combo >= 3) this.flash = Math.min(0.6, 0.25 + this.combo * 0.05);
    this.comboTimer = this.comboDuration();
    const totalMult = this.timeBonusMult * this.streakMult;
    this.score += Math.round(100 * (1 + (this.combo - 1) * 0.15) * this.combo * this.scoreMult() * totalMult);
    for (const e of [eA, eB]) {
      if (!e) continue;
      const bt = this.tiles.find((tt) => tt.id === e.id);
      if (!bt) continue;
      for (let k = 0; k < 8; k++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 80 + Math.random() * 160;
        this.windParticles.push({ x: bt.sx, y: bt.sy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 40, life: 0.6, max: 0.6, r: 2 + Math.random() * 3, color: tileColor(bt.symbol) });
      }
    }
    if (this.combo > 5) {
      for (let k = 0; k < 12; k++) {
        const colors = ["#ffd75e","#ff8844","#44aaff","#ff44aa","#44ff88"];
        this.starRain.push({ x: Math.random() * CANVAS_W, y: -20, vy: 100 + Math.random() * 200, vx: (Math.random() - 0.5) * 60, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 6, size: 4 + Math.random() * 6, alpha: 0.7 + Math.random() * 0.3, color: colors[Math.floor(Math.random() * colors.length)] });
      }
    }
    // Endless mode: tum taslar bitince yenile
    if (this.gameMode === "endless" && this.tiles.every((t) => t.removed)) {
      setTimeout(() => {
        this.tiles = [];
        this.tray = [];
        this.history = [];
        this.countdownTiles.clear();
        this.currentLevel = null;
        this.buildLayout();
        this.emitHud();
      }, 800);
    }
    this.emitHud();
  }

  shuffle(): void {
    if (this.shuffleCount >= this.maxShuffles || this.won || this.lost) return;
    const remaining = this.tiles.filter((t) => !t.removed);
    const syms = remaining.map((t) => t.symbol);
    for (let i = syms.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [syms[i], syms[j]] = [syms[j], syms[i]];
    }
    remaining.forEach((t, i) => (t.symbol = syms[i]));
    this.shuffleCount++;
    this.sfx("shuffle");
    this.hintIds = [];
    this.emitHud();
  }

  hint(): void {
    if (this.won || this.lost) return;
    this.sfx("hint");
    this.hintIds = [];
    const usable = (t: Tile) => !t.removed && this.isOpen(t) && this.sideFree(t);
    // Once haznedeki tek tasa karsi acik esi var mi? (en dogrudan hamle)
    for (const te of this.tray) {
      const e = this.tiles.find((t) => usable(t) && matchKey(t.symbol) === matchKey(te.symbol) && t.id !== te.id);
      if (e) {
        this.hintIds = [e.id];
        this.emitHud();
        return;
      }
    }
    // Yoksa tahtada ayni desende iki acik tasa bak.
    const seen = new Map<string, Tile>();
    for (const o of this.tiles) {
      if (!usable(o)) continue;
      const mk = matchKey(o.symbol);
      if (seen.has(mk)) {
        this.hintIds = [seen.get(mk)!.id, o.id];
        this.emitHud();
        return;
      }
      seen.set(mk, o);
    }
    this.emitHud();
  }

  private drawHint(c: CanvasRenderingContext2D): void {
    for (const id of this.hintIds) {
      const t = this.tiles.find((x) => x.id === id);
      if (!t || t.removed) continue;
      const p = 0.5 + 0.5 * Math.sin(this.time * 6);
      c.save();
      c.strokeStyle = "rgba(255,220,80," + (0.5 + 0.4 * p) + ")";
      c.lineWidth = 4;
      c.shadowColor = "rgba(255,220,80,0.9)";
      c.shadowBlur = 12 + 8 * p;
      c.beginPath();
      c.roundRect(t.sx - this.tw / 2 - 5, t.sy - this.th / 2 - 5, this.tw + 10, this.th + 10, 12);
      c.stroke();
      c.restore();
    }
  }

  private ensureAudio(): AudioContext | null {
    if (!this.audio) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.audio = new AC();
    }
    if (this.audio.state === "suspended") void this.audio.resume();
    return this.audio;
  }

  private sfx(name: string): void {
    SoundEngine.play(name, this.combo);
  }

  /** Mahjong tasindan gelen kisir "tak" sesi (filtrelenmis gürültü darbesi). */
  private clack(vol = 0.12): void {
    const ac = this.audio || this.ensureAudio();
    if (!ac) return;
    if (!this.noiseBuf) {
      const len = Math.floor(ac.sampleRate * 0.06);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      this.noiseBuf = buf;
    }
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200 + Math.random() * 1400;
    bp.Q.value = 1.1;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.06);
    src.connect(bp);
    bp.connect(g);
    g.connect(ac.destination);
    src.start();
  }

  /** Sur sesi: karistirma ve dokulusteki karakteristik tas ritmi. */
  private dealRattle(): void {
    for (let i = 0; i < 16; i++) {
      setTimeout(() => this.clack(0.05 + Math.random() * 0.09), i * 85 + Math.random() * 30);
    }
  }

  /** Uyum madalyonu: merkezde yavas donen yin-yang, etrafinda surun
   *  cozulme orani (dağınık parçalardan eksiksiz bütlüne). */
  private drawYinYangMedallion(c: CanvasRenderingContext2D): void {
    const total = this.tiles.length;
    const remaining = this.tiles.filter((t) => !t.removed).length;
    const prog = total > 0 ? 1 - remaining / total : 0;
    const cx = CANVAS_W - 52;
    const cy = 64;
    const r = 26;
    c.save();
    c.strokeStyle = "rgba(255,255,255,0.10)";
    c.lineWidth = 4;
    c.lineCap = "round";
    c.beginPath();
    c.arc(cx, cy, r + 6, 0, Math.PI * 2);
    c.stroke();
    if (prog > 0.001) {
      c.strokeStyle = "rgba(255,215,94,0.9)";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(cx, cy, r + 6, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
      c.stroke();
    }
    this.drawYinYang(c, cx, cy, r, this.time * 0.6);
    c.restore();
  }

  /** Yin-yang sembolu (gecicilik, denge). */
  private drawYinYang(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number): void {
    c.save();
    c.translate(cx, cy);
    c.rotate(rot);
    const light = "#f3ead2";
    const dark = "#1c2430";
    c.fillStyle = light;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = dark;
    c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); c.closePath(); c.fill();
    c.fillStyle = dark;
    c.beginPath(); c.arc(0, r / 2, r / 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = light;
    c.beginPath(); c.arc(0, -r / 2, r / 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = dark;
    c.beginPath(); c.arc(0, -r / 2, r / 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = light;
    c.beginPath(); c.arc(0, r / 2, r / 6, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  private rollFates(): string[] {
    const bonus = ["alp", "iron", "wolf"];
    const lanet = ["shadow", "limited", "heavy"];
    const out: string[] = [];
    if (Math.random() < 0.5) {
      out.push(bonus[Math.floor(Math.random() * bonus.length)]);
    } else {
      out.push(lanet[Math.floor(Math.random() * lanet.length)]);
    }
    if (Math.random() < 0.25) {
      const hasBonus = out.every((id) => bonus.includes(id));
      const pool = hasBonus ? lanet : bonus;
      out.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return out;
  }

  private comboDuration(): number {
    let d = 3;
    if (this.fates.includes("alp")) d += 2;
    if (this.fates.includes("shadow")) d -= 2;
    return Math.max(2, d);
  }

  private maxTray(): number {
    let m = 4;
    if (this.fates.includes("iron")) m += 1;
    if (this.fates.includes("limited")) m -= 1;
    return Math.max(2, m);
  }

  private scoreMult(): number {
    let m = 1;
    if (this.fates.includes("wolf")) m *= 1.25;
    if (this.fates.includes("heavy")) m *= 0.8;
    return m;
  }

  private drawFates(c: CanvasRenderingContext2D): void {
    if (this.fates.length === 0) return;
    const labels: Record<string, string> = {
      alp: "Alp Rünü +2sn",
      iron: "Hazne +1",
      wolf: "Puan x1.25",
      shadow: "Combo -2sn",
      limited: "Hazne -1",
      heavy: "Puan x0.8",
    };
    const bonus = ["alp", "iron", "wolf"];
    const y = 172;
    c.font = "bold 13px Georgia";
    c.textBaseline = "middle";
    const widths = this.fates.map((id) => c.measureText(labels[id]).width + 22);
    const total = widths.reduce((a, b) => a + b, 0) + 8 * (this.fates.length - 1);
    let x = CANVAS_W / 2 - total / 2;
    for (let i = 0; i < this.fates.length; i++) {
      const id = this.fates[i];
      const isB = bonus.includes(id);
      c.fillStyle = isB ? "rgba(212,175,55,0.26)" : "rgba(170,90,70,0.30)";
      c.beginPath();
      c.roundRect(x, y - 10, widths[i], 20, 8);
      c.fill();
      c.strokeStyle = isB ? "rgba(212,175,55,0.7)" : "rgba(200,120,90,0.7)";
      c.lineWidth = 1.2;
      c.beginPath();
      c.roundRect(x, y - 10, widths[i], 20, 8);
      c.stroke();
      c.fillStyle = isB ? "#ffe9a8" : "#e8b8a6";
      c.fillText(labels[id], x + widths[i] / 2, y + 1);
      x += widths[i] + 8;
    }
  }

  private recordProgress(): void {
    try {
      const stars = this.calcStars();
      const sec = Math.floor(this.seconds);
      const skey = 'otuken_' + this.levelIndex + '_stars';
      const bkey = 'otuken_' + this.levelIndex + '_best';
      const prevStars = Number(localStorage.getItem(skey) || '0');
      const prevBest = Number(localStorage.getItem(bkey) || '0');
      if (stars > prevStars) localStorage.setItem(skey, String(stars));
      if (prevBest === 0 || sec < prevBest) localStorage.setItem(bkey, String(sec));
    } catch {
      /* storage unavailable */
    }
  }

  private calcStars(): number {
    const pairs = Math.max(1, this.tiles.length / 2);
    const t = this.seconds;
    if (t <= pairs * 4) return 3;
    if (t <= pairs * 7) return 2;
    return 1;
  }

  private emitHud(): void {
    const remaining = this.tiles.filter((t) => !t.removed).length;
    let stuck = false;
    if (remaining > 0) {
      // Çözülebilir mi? (basit: açık eşleşme var mı)
      const opens = this.tiles.filter((t) => this.isOpen(t));
      const seen = new Set<string>();
      stuck = true;
      for (const o of opens) {
        const mk = matchKey(o.symbol);
        if (seen.has(mk)) {
          stuck = false;
          break;
        }
        seen.add(mk);
      }
    }
    this.onHud?.({
      remaining,
      total: this.tiles.length,
      moves: this.moves,
      seconds: Math.floor(this.seconds),
      selected: this.selectedId === null ? -1 : this.selectedId,
      won: this.won,
      stuck,
      level: this.levelIndex,
      levelName: this.level().name,
      score: this.score,
      combo: this.combo,
      stars: this.won ? this.calcStars() : 0,
      fates: this.fates,
      shuffles: this.maxShuffles - this.shuffleCount,
      cleanWin: this.won && this.shuffleCount === 0,
      mode: this.gameMode,
      raceTimeLeft: this.raceTimeLeft,
    });
  }

  /** Göktürk motifleri: arka plan rünleri, altın tonlu bantlar (bir kez çizilip önbelleğe alınır). */
  /** Göktürk obası sahnesi + motifler (bir kez çizilip önbelleğe alınır). */
  /** Gokyuzunde suruklenen Goekturk kartali (kanat acik). */
  private drawEagle(c: CanvasRenderingContext2D, cx: number, cy: number, su: number): void {
    c.beginPath();
    c.moveTo(cx, cy - 14 * su);
    c.quadraticCurveTo(cx + 3 * su, cy - 8 * su, cx + 9 * su, cy - 3 * su);
    c.lineTo(cx + 7 * su, cy + 3 * su);
    c.lineTo(cx + 11 * su, cy + 12 * su);
    c.lineTo(cx + 4 * su, cy + 8 * su);
    c.lineTo(cx, cy + 10 * su);
    c.lineTo(cx - 4 * su, cy + 8 * su);
    c.lineTo(cx - 11 * su, cy + 12 * su);
    c.lineTo(cx - 7 * su, cy + 3 * su);
    c.lineTo(cx - 9 * su, cy - 3 * su);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(cx - 7 * su, cy - 4 * su);
    c.quadraticCurveTo(cx - 30 * su, cy - 24 * su, cx - 42 * su, cy - 10 * su);
    c.quadraticCurveTo(cx - 27 * su, cy - 7 * su, cx - 9 * su, cy + 1 * su);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(cx + 7 * su, cy - 4 * su);
    c.quadraticCurveTo(cx + 30 * su, cy - 24 * su, cx + 42 * su, cy - 10 * su);
    c.quadraticCurveTo(cx + 27 * su, cy - 7 * su, cx + 9 * su, cy + 1 * su);
    c.closePath();
    c.fill();
  }

  /** Canli atmosfer: yildizlar, ay, sis, ocak alevi + kizarlar, kartal. */
  private drawAmbient(c: CanvasRenderingContext2D): void {
    const t = this.time;

    // Parlayan yildizlar (gece gorunur, gun gizli).
    for (const st of this.stars) {
      const a = (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * st.sp + st.ph))) * 0.5 * this.nightAlpha;
      c.fillStyle = "rgba(235,242,255," + a.toFixed(3) + ")";
      c.beginPath();
      c.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      c.fill();
    }

    // Ay: gece gorunur
    const mx = 590;
    const my = 128;
    const moonA = (0.5 + 0.08 * Math.sin(t * 0.6)) * this.nightAlpha;
    const mg = c.createRadialGradient(mx, my, 4, mx, my, 60);
    mg.addColorStop(0, "rgba(240,240,225," + (0.5 * moonA).toFixed(3) + ")");
    mg.addColorStop(0.4, "rgba(240,240,225," + (0.18 * moonA).toFixed(3) + ")");
    mg.addColorStop(1, "rgba(240,240,225,0)");
    c.fillStyle = mg;
    c.beginPath();
    c.arc(mx, my, 60, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(245,244,230," + (0.85 * moonA).toFixed(3) + ")";
    c.beginPath();
    c.arc(mx, my, 20, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(180,185,175,0.25)";
    c.beginPath();
    c.arc(mx - 6, my - 4, 4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(mx + 7, my + 6, 3, 0, Math.PI * 2);
    c.fill();

    // Dagsilarin arasinda kayan sis bantlari.
    const mist = (y: number, speed: number, phase: number, alpha: number) => {
      const x = ((t * speed + phase * 900) % (CANVAS_W + 520)) - 260;
      c.save();
      c.translate(x, y);
      c.scale(2.4, 0.42);
      const g = c.createRadialGradient(0, 0, 10, 0, 0, 200);
      g.addColorStop(0, "rgba(200,220,235," + alpha + ")");
      g.addColorStop(1, "rgba(200,220,235,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 200, 0, Math.PI * 2);
      c.fill();
      c.restore();
    };
    mist(430, 9, 0, 0.05);
    mist(520, 6.5, 0.5, 0.06);
    mist(610, 7.5, 0.8, 0.05);

    // Ufukta sicak isik (sabah/aksam daha guclu)
    const warmA = (0.05 + 0.02 * Math.sin(t * 0.35)) * this.dawnDusk;
    const wg = c.createLinearGradient(0, 290, 0, 580);
    wg.addColorStop(0, "rgba(255,170,80,0)");
    wg.addColorStop(0.6, "rgba(255,170,80," + warmA.toFixed(3) + ")");
    wg.addColorStop(1, "rgba(255,140,60,0)");
    c.fillStyle = wg;
    c.fillRect(0, 290, CANVAS_W, 290);

    // Ocak alevi: titreyen katmanlar + hale + kizarlar (sol-alt kose, bozkir otunun basinda).
    const fx = 30;
    const fy = 1205;
    const f1 = 46 + Math.sin(t * 9.7) * 5 + Math.sin(t * 15.3 + 1.2) * 3;
    const f2 = 28 + Math.sin(t * 11.1 + 0.6) * 4;
    const fsw = Math.sin(t * 7.3) * 3;
    c.save();
    c.globalAlpha = 0.55;
    c.fillStyle = "rgba(255,160,50,0.55)";
    c.beginPath();
    c.moveTo(fx - 16, fy);
    c.quadraticCurveTo(fx - 6 + fsw, fy - f1 * 0.7, fx + fsw, fy - f1);
    c.quadraticCurveTo(fx + 8 + fsw, fy - f1 * 0.55, fx + 18, fy);
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(255,220,120,0.7)";
    c.beginPath();
    c.moveTo(fx - 9, fy);
    c.quadraticCurveTo(fx - 2 + fsw * 0.6, fy - f2 * 0.8, fx + fsw * 0.6, fy - f2);
    c.quadraticCurveTo(fx + 4 + fsw * 0.6, fy - f2 * 0.5, fx + 11, fy);
    c.closePath();
    c.fill();
    c.restore();
    const fg = c.createRadialGradient(fx, fy - 14, 4, fx, fy - 14, 70);
    fg.addColorStop(0, "rgba(255,170,70," + (0.1 + 0.03 * Math.sin(t * 12.7)).toFixed(3) + ")");
    fg.addColorStop(1, "rgba(255,170,70,0)");
    c.fillStyle = fg;
    c.beginPath();
    c.arc(fx, fy - 14, 70, 0, Math.PI * 2);
    c.fill();
    for (const e of this.embers) {
      const ea = Math.max(0, Math.min(1, (e.y - (fy - 88)) / 88)) * 0.8;
      c.fillStyle = "rgba(255,190,90," + ea.toFixed(3) + ")";
      c.beginPath();
      c.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      c.fill();
    }

    // Gokyuzunde yavas suruklenen kartal.
    const ex = CANVAS_W - 150 + Math.sin(t * 0.13) * 46;
    const ey = 140 + Math.sin(t * 0.31) * 9;
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = "rgba(22,28,40,0.45)";
    this.drawEagle(c, ex, ey, 1);
    c.restore();
  }

  private drawMotifs(c: CanvasRenderingContext2D): void {
    if (!this.motifsCache) {
      const off = document.createElement("canvas");
      off.width = CANVAS_W;
      off.height = CANVAS_H;
      const m = off.getContext("2d")!;
      m.textAlign = "center";

      // ---- Uzak dağ tepeleri (silüet) ----
      // Keskin cok katmanli uzak dag sirtlari (iki harmonik uzerine biner).
      const ridge = (baseY: number, amp: number, seed: number, sharp: number) => {
        m.beginPath();
        m.moveTo(0, baseY + 60);
        for (let x = 0; x <= CANVAS_W; x += 20) {
          const w = (x + seed) * 0.006;
          const y = baseY - Math.abs(Math.sin(w)) * amp - Math.abs(Math.sin(w * 2.3 + 1.7)) * amp * sharp;
          m.lineTo(x, y);
        }
        m.lineTo(CANVAS_W, CANVAS_H);
        m.lineTo(0, CANVAS_H);
        m.closePath();
        m.fill();
      };
      m.save();
      m.globalAlpha = 0.55;
      m.fillStyle = "rgba(150,175,200,0.16)";
      ridge(398, 76, 40, 0.6);
      m.fillStyle = "rgba(130,160,185,0.20)";
      ridge(508, 58, 130, 0.5);
      m.fillStyle = "rgba(110,140,165,0.24)";
      ridge(618, 48, 210, 0.45);
      m.restore();

      // ---- Gök bayrağı / tuğ (solda) ----
      const tugh = (fx: number, fy: number) => {
        m.strokeStyle = "rgba(90,110,120,0.35)";
        m.lineWidth = 3;
        m.beginPath();
        m.moveTo(fx, fy);
        m.lineTo(fx, fy + 90);
        m.stroke();
        m.strokeStyle = "rgba(180,200,215,0.30)";
        m.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          m.beginPath();
          m.moveTo(fx, fy);
          m.quadraticCurveTo(fx - 26, fy + 10 + k * 5, fx - 10, fy + 34 + k * 5);
          m.stroke();
        }
      };
      m.save();
      m.globalAlpha = 0.6;
      tugh(140, 150);
      tugh(148, 148);
      m.restore();

      // ---- Yurtlar (konik çadırlar) ----
      const yurt = (cx: number, baseY: number, w: number, h: number) => {
        m.fillStyle = "rgba(150,150,130,0.28)";
        m.beginPath();
        m.moveTo(cx - w / 2, baseY);
        m.lineTo(cx, baseY - h);
        m.lineTo(cx + w / 2, baseY);
        m.closePath();
        m.fill();
        m.strokeStyle = "rgba(255,255,255,0.10)";
        m.lineWidth = 1.5;
        m.stroke();
        m.fillStyle = "rgba(80,70,50,0.35)";
        m.beginPath();
        m.moveTo(cx - 8, baseY);
        m.lineTo(cx - 8, baseY - 16);
        m.lineTo(cx + 8, baseY - 16);
        m.lineTo(cx + 8, baseY);
        m.closePath();
        m.fill();
        m.strokeStyle = "rgba(200,150,80,0.25)";
        m.lineWidth = 2;
        m.beginPath();
        m.moveTo(cx - w / 2 + 4, baseY - h * 0.15);
        m.lineTo(cx + w / 2 - 4, baseY - h * 0.15);
        m.stroke();
      };
      m.save();
      m.globalAlpha = 0.7;
      yurt(360, 648, 150, 108);
      yurt(560, 660, 175, 124);
      yurt(820, 648, 140, 100);
      yurt(1050, 665, 180, 130);
      m.restore();


      // ---- Bozkır çimenleri (rüzgârda eğilen ot demetleri) ----
      m.save();
      m.globalAlpha = 0.4;
      m.lineWidth = 1.6;
      m.strokeStyle = "rgba(120,145,95,0.45)";
      const grass = (bx: number, baseY: number) => {
        for (let k = 0; k < 6; k++) {
          m.beginPath();
          const gx = bx + (k - 2.5) * 9;
          m.moveTo(gx, baseY);
          m.quadraticCurveTo(gx + 3, baseY - 9, gx + 1 + (k % 2) * 2, baseY - 15 - (k % 3) * 3);
          m.stroke();
        }
      };
      for (let i = 0; i < 6; i++) grass(60 + i * 28, 1216 + (i % 2) * 6);
      for (let i = 0; i < 6; i++) grass(CANVAS_W - 210 + i * 28, 1210 + (i % 2) * 8);
      m.restore();


      // ---- Zayıf arka plan rünleri (su izi) ----
      m.save();
      m.globalAlpha = 0.06;
      m.fillStyle = "#ffffff";
      m.font = "150px 'Segoe UI Historic','Noto Sans Old Turkic',serif";
      const spots: Array<[number, number, number]> = [
        [130, 205, 0], [355, 140, 1], [560, 265, 4], [765, 130, 5],
        [1055, 100, 8], [1230, 300, 9], [90, 545, 12], [1180, 600, 13],
      ];
      for (const [x, y, i] of spots) {
        m.save();
        m.translate(x, y);
        m.rotate(-0.5 + i * 0.13);
        m.fillText(RUNES[i % RUNES.length], 0, 0);
        m.restore();
      }
      m.restore();

      // ---- Altın tonlu şerit bantları: basamak + baklava motifi ----
      const gold = (a: number) => "rgba(212,175,55," + a + ")";
      const band = (yBase: number, dir: 1 | -1) => {
        m.strokeStyle = gold(0.14);
        m.lineWidth = 2;
        m.beginPath();
        m.moveTo(44, yBase);
        m.lineTo(CANVAS_W - 44, yBase);
        m.stroke();
        m.fillStyle = gold(0.2);
        for (let x = 44; x <= CANVAS_W - 44; x += 20) {
          m.beginPath();
          m.moveTo(x, yBase - 13 * dir);
          m.lineTo(x + 5, yBase - 8 * dir);
          m.lineTo(x, yBase - 3 * dir);
          m.lineTo(x - 5, yBase - 8 * dir);
          m.closePath();
          m.fill();
        }
        m.fillStyle = gold(0.1);
        const sy = yBase + 8 * dir;
        for (let x = 40; x <= CANVAS_W - 44; x += 40) {
          m.beginPath();
          m.moveTo(x + 8, sy - 8 * dir);
          m.lineTo(x + 16, sy - 8 * dir);
          m.lineTo(x + 16, sy);
          m.lineTo(x + 26, sy);
          m.lineTo(x + 26, sy + 8 * dir);
          m.fill();
        }
      };
      band(102, 1); // başlık altı
      band(CANVAS_H - 92, -1); // hazne üstü

      this.motifsCache = off;
    }
    c.drawImage(this.motifsCache, 0, 0);
  }

  // ---- Render ----
  private render(): void {
    const c = this.ctx;
    const def = this.level();
    // Arka plan: gun/gece donusumlu gradient
    const dn = getDayNightColors(this.dayPhase);
    const g = c.createLinearGradient(0, 0, 0, CANVAS_H);
    g.addColorStop(0, dn.top);
    g.addColorStop(0.5, dn.mid);
    g.addColorStop(1, dn.bot);
    c.fillStyle = g;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // Gun/gece evre hesaplari
    this.nightAlpha = this.dayPhase < 0.3 ? 1 - this.dayPhase / 0.3 : this.dayPhase > 0.7 ? (this.dayPhase - 0.7) / 0.3 : 0;
    this.dawnDusk = this.dayPhase < 0.4 ? Math.sin(this.dayPhase / 0.4 * Math.PI) : this.dayPhase > 0.6 ? Math.sin((this.dayPhase - 0.6) / 0.4 * Math.PI) : 0;
    // Kece dokusu: ince yatay cizgiler (kis tonlari)
    c.save();
    c.globalAlpha = 0.04;
    for (let i = 0; i < CANVAS_H; i += 4) {
      c.strokeStyle = i % 8 === 0 ? "#2a3a4a" : "#1a2a3a";
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(0, i);
      c.lineTo(CANVAS_W, i);
      c.stroke();
    }
    c.restore();
    // Ambient dust: ucusan transparan tanecikler
    for (const d of this.dustParticles) {
      c.globalAlpha = d.alpha * (0.5 + 0.5 * Math.sin(this.time * 0.8 + d.ph));
      c.fillStyle = "#c8d8d0";
      c.beginPath();
      c.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    // Yagmur damlali (sadece yagmur modunda)
    if (this.rainMode) {
      for (const r of this.rain) {
        c.save();
        c.globalAlpha = r.alpha;
        c.strokeStyle = "#8ab4c8";
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(r.x, r.y);
        c.lineTo(r.x - 3, r.y - r.len);
        c.stroke();
        c.restore();
      }
    }
    // Su birikinti dalgeleri (sadece yagmur modunda)
    if (this.rainMode) {
      for (const rp of this.ripples) {
        const a = Math.max(0, rp.life / rp.max);
        c.save();
        c.globalAlpha = a * 0.35;
        c.strokeStyle = "#6a9ab4";
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        c.stroke();
        if (rp.r > 6) {
          c.globalAlpha = a * 0.18;
          c.beginPath();
          c.arc(rp.x, rp.y, rp.r * 0.6, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();
      }
    }
    // Kar taneleri
    if (this.winterMode) {
      for (const sf of this.snowflakes) {
        c.save();
        c.globalAlpha = sf.alpha;
        c.fillStyle = "#e8f0f8";
        c.beginPath();
        c.arc(sf.x, sf.y, sf.size, 0, Math.PI * 2);
        c.fill();
        // Kar tanesi parliltisi
        c.globalAlpha = sf.alpha * 0.4;
        c.fillStyle = "#ffffff";
        c.beginPath();
        c.arc(sf.x - sf.size * 0.3, sf.y - sf.size * 0.3, sf.size * 0.35, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }
    // Erime su damlalari
    for (const md of this.meltDrops) {
      const a = Math.max(0, md.life / md.max);
      c.save();
      c.globalAlpha = a * 0.7;
      const dg = c.createRadialGradient(md.x, md.y, 0, md.x, md.y, md.r);
      dg.addColorStop(0, "rgba(140,190,220,0.8)");
      dg.addColorStop(1, "rgba(100,160,200,0)");
      c.fillStyle = dg;
      c.beginPath();
      c.arc(md.x, md.y, md.r, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    this.drawMotifs(c);
    this.drawAmbient(c);
    // Screen shake transformu
    c.save();
    if (this.shakeAmount > 0.1) c.translate(this.shakeX, this.shakeY);
    // Sinematik vinyet (kenar karartma).
    const vg = c.createRadialGradient(CANVAS_W / 2, CANVAS_H * 0.46, CANVAS_H * 0.28, CANVAS_W / 2, CANVAS_H * 0.5, CANVAS_H * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(6,4,2,0.46)");
    c.fillStyle = vg;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Gun/gece renk sicakligi overlay
    if (this.dawnDusk > 0.01) {
      c.save();
      c.globalAlpha = this.dawnDusk * 0.12;
      c.fillStyle = "#ff9944";
      c.fillRect(0, 0, CANVAS_W, CANVAS_H);
      c.restore();
    }
    if (this.nightAlpha > 0.3) {
      c.save();
      c.globalAlpha = (this.nightAlpha - 0.3) * 0.15;
      c.fillStyle = "#2244aa";
      c.fillRect(0, 0, CANVAS_W, CANVAS_H);
      c.restore();
    }

    // Baslik: uzaya cekilmis ince bakir plak + basilmis yazi.
    const plateW = 356;
    const plateX = CANVAS_W / 2 - plateW / 2;
    const plateY = 26;
    const plateH = 52;
    const pgr = c.createLinearGradient(0, plateY, 0, plateY + plateH);
    pgr.addColorStop(0, "#8a5a2c");
    pgr.addColorStop(0.5, "#6e4520");
    pgr.addColorStop(1, "#54331a");
    c.fillStyle = pgr;
    c.beginPath();
    c.roundRect(plateX, plateY, plateW, plateH, 10);
    c.fill();
    c.strokeStyle = "rgba(255,205,140,0.35)";
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(plateX + 2.5, plateY + 2.5, plateW - 5, plateH - 5, 8);
    c.stroke();
    c.strokeStyle = "rgba(20,10,4,0.6)";
    c.beginPath();
    c.roundRect(plateX - 1.5, plateY - 1.5, plateW + 3, plateH + 3, 11);
    c.stroke();
    c.fillStyle = "rgba(255,210,150,0.5)";
    c.beginPath();
    c.arc(plateX + 12, plateY + plateH / 2, 2.6, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(plateX + plateW - 12, plateY + plateH / 2, 2.6, 0, Math.PI * 2);
    c.fill();
    c.textAlign = "center";
    c.font = "bold 38px Georgia";
    c.fillStyle = "rgba(255,220,170,0.25)";
    c.fillText("Ötüken Mahjong", CANVAS_W / 2, 61.5);
    c.fillStyle = "#31200e";
    c.fillText("Ötüken Mahjong", CANVAS_W / 2, 60);
    // Seviye: bakir kazima
    c.font = "bold 22px Georgia";
    c.fillStyle = "rgba(20,10,4,0.5)";
    c.fillText(`Seviye ${this.levelIndex + 1} · ${def.name}`, CANVAS_W / 2, 93);
    c.fillStyle = "#c89050";
    c.fillText(`Seviye ${this.levelIndex + 1} · ${def.name}`, CANVAS_W / 2, 92);
    this.drawFates(c);

    // Meditasyon motosu — her yeni duvarda degisen felsefi nefes.
    if (this.motto) {
      c.font = "italic 15px Georgia";
      c.fillStyle = "rgba(200,150,90,0.55)";
      c.fillText(this.motto, CANVAS_W / 2, 122);
    }

    // Uyum madalyonu: yin-yang + surun cozulme yayi (tamamlanma arayisi).
    this.drawYinYangMedallion(c);

    // Yerleşimin çerçevesi (taş alanına göre).
    const boxW = this.layoutCols * (this.tw + this.gap) + this.gap;
    const boxH = this.layoutRows * (this.th + this.gap) + this.gap;
    const bx = this.boardOriginX() - boxW / 2;
    const by = (CANVAS_H - boxH) / 2 + 30;
    c.strokeStyle = "rgba(255,255,255,0.08)";
    c.lineWidth = 2;
    c.strokeRect(bx - 12, by - 12, boxW + 24, boxH + 24);

    // Köşe tamga süsleri (tahta çerçevesi etrafında dört nokta).
    const ts = 13;
    c.strokeStyle = "rgba(212,175,55,0.55)";
    c.lineWidth = 1.8;
    const corners: Array<[number, number]> = [
      [bx - 22 - ts, by - 22 - ts],
      [bx + boxW + 24 + ts, by - 22 - ts],
      [bx - 22 - ts, by + boxH + 26 + ts],
      [bx + boxW + 24 + ts, by + boxH + 26 + ts],
    ];
    for (const [cx2, cy2] of corners) {
      c.strokeRect(cx2 - ts, cy2 - ts, ts * 2, ts * 2);
      c.beginPath();
      c.moveTo(cx2, cy2 - ts);
      c.lineTo(cx2 + ts, cy2);
      c.lineTo(cx2, cy2 + ts);
      c.lineTo(cx2 - ts, cy2);
      c.closePath();
      c.stroke();
    }

    // Taşları çiz (en üst katman önce değil, alt→üst sıralama render etkisi).
    const sorted = [...this.tiles].sort((a, b) => a.layer - b.layer);
    for (const t of sorted) {
      if (t.removed) continue;
      const open = this.isOpen(t);
      const sel = t.id === this.selectedId;
      const canT = open && this.sideFree(t);
      const lift = this.lifts.get(t.id) ?? 0;
      const bob = canT ? Math.sin(this.time * 1.6 + t.x * 1.31 + t.y * 0.97) * 0.7 : 0;
      let dk = 1;
      if (this.dealAt >= 0) {
        dk = Math.max(0, Math.min(1, (this.time - this.dealAt - (this.dealDelay.get(t.id) ?? 0)) / 0.22));
      }
      if (dk <= 0) continue;
      if (dk < 1) {
        const e = 1 - Math.pow(1 - dk, 3);
        c.save();
        c.globalAlpha = e;
        this.drawTile(c, { ...t, sy: t.sy + bob + lift - (1 - e) * 46 }, open, sel, canT);
        c.restore();
      } else {
        this.drawTile(c, { ...t, sy: t.sy + bob + lift }, open, sel, canT);
        // Kilitli tas karartmasi: acik ama secilemeyen taslar
        if (open && !canT && !sel && dk >= 1) {
          c.save();
          c.fillStyle = "rgba(0,0,0,0.38)";
          c.beginPath();
          c.roundRect(t.sx - this.tw / 2, (t.sy + bob + lift) - this.th / 2, this.tw, this.th, Math.max(4, Math.round(this.tw * 0.125)));
          c.fill();
          c.restore();
        }
        // Secili tas aurasi (turkuaz nabiz)
        if (sel) {
          const pulse = 0.22 + 0.10 * Math.sin(this.time * 5.5);
          c.save();
          c.shadowColor = "rgba(80,200,180," + pulse.toFixed(3) + ")";
          c.shadowBlur = 18;
          c.strokeStyle = "rgba(80,200,180," + (0.35 + 0.15 * Math.sin(this.time * 5.5)).toFixed(3) + ")";
          c.lineWidth = 2.5;
          c.beginPath();
          c.roundRect(t.sx - this.tw / 2 - 3, (t.sy + bob + lift) - this.th / 2 - 3, this.tw + 6, this.th + 6, Math.max(5, Math.round(this.tw * 0.125) + 2));
          c.stroke();
          c.restore();
        }
        // Shimmer sweep: secilebilir taslarda 4sn'de bir soldan saga isik suzulmesi
        if (canT && !sel && dk >= 1) {
          const shimmerPhase = (this.time % 4) / 4; // 0..1 her 4 saniyede
          const tileLocalX = (t.sx + this.tw / 2) / CANVAS_W; // 0..1 taş pozisyonu
          const sweep = shimmerPhase * 1.6 - tileLocalX * 0.8; // dalga
          if (sweep > 0 && sweep < 0.35) {
            const sa = Math.sin((sweep / 0.35) * Math.PI) * 0.18;
            c.save();
            c.globalAlpha = sa;
            c.fillStyle = "#ffffff";
            c.beginPath();
            c.roundRect(t.sx - this.tw / 2, (t.sy + bob + lift) - this.th / 2, this.tw, this.th, Math.max(4, Math.round(this.tw * 0.125)));
            c.fill();
            c.restore();
          }
        }
      }
    }
    this.drawHint(c);

    // ---- Eslesme altin huzmesi ----
    if (this.matchFx) {
      const fx = this.matchFx;
      const p = 1 - fx.timer / fx.max;
      const sparkleT = this.time * 12;
      // Ana huzme
      c.save();
      c.globalAlpha = (1 - p) * 0.8;
      c.strokeStyle = "#ffd75e";
      c.lineWidth = 2.5 - p * 1.5;
      c.beginPath();
      c.moveTo(fx.x1, fx.y1);
      c.lineTo(fx.x2, fx.y2);
      c.stroke();
      // Huzme ustunde parcaciklar
      for (let i = 0; i < 8; i++) {
        const t2 = (i / 7 + p * 0.4) % 1;
        const px = fx.x1 + (fx.x2 - fx.x1) * t2;
        const py = fx.y1 + (fx.y2 - fx.y1) * t2 + Math.sin(sparkleT + i * 2.1) * 6;
        c.globalAlpha = (1 - p) * (0.6 + 0.3 * Math.sin(sparkleT + i * 1.7));
        c.fillStyle = "#ffe9a8";
        c.beginPath();
        c.arc(px, py, 2.5 + Math.sin(sparkleT + i) * 1.2, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    // ---- Eslesme patlamasi (parlak parcaciklar) ----
    for (const b of this.bursts) {
      const a = Math.max(0, b.life / b.max);
      c.globalAlpha = a * 0.9;
      c.fillStyle = b.color;
      c.beginPath();
      c.arc(b.x, b.y, Math.max(1, b.r * a), 0, Math.PI * 2);
      c.fill();
    }
    // ---- Suzulen yazi (+2) ----
    for (const f of this.floats) {
      const a = Math.max(0, f.life / f.max);
      c.globalAlpha = a;
      c.fillStyle = f.color;
      c.font = "bold 26px Georgia";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(f.text, f.x, f.y);
      c.restore();
      c.fillStyle = f.color;
    }
    // ---- Tas pop animasyonu (kaybolan halka + run) ----
    for (const pp of this.pops) {
      const k = pp.life / pp.max;
      const a = Math.max(0, Math.min(1, k * 2.5));
      c.save();
      c.globalAlpha = a;
      c.strokeStyle = tileColor(pp.symbol);
      c.lineWidth = 3;
      const rr = (1 - k) * 46 + 8;
      c.beginPath();
      c.arc(pp.x, pp.y, rr, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = a * 0.55;
      c.fillStyle = tileColor(pp.symbol);
      c.font = "bold 30px " + CJK_FONT;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(faceLabel(pp.symbol), pp.x, pp.y);
      c.restore();
    }

    // ---- Kirilma parcaciklari (taslarin ustunde cizilir) ----
    for (const s of this.shards) {
      const a = Math.max(0, s.life / s.max);
      c.globalAlpha = a;
      c.fillStyle = s.color;
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(s.x + s.r, s.y - s.r * 1.4);
      c.lineTo(s.x + s.r * 1.6, s.y + s.r * 0.4);
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 1;

    // Sobaligi: sol-alttan kalkan sicak hale (kadim ocak).
    const hg = c.createRadialGradient(40, 1210, 30, 40, 1210, 720);
    hg.addColorStop(0, "rgba(255,150,60,0.13)");
    hg.addColorStop(0.45, "rgba(255,130,55,0.05)");
    hg.addColorStop(1, "rgba(255,130,55,0)");
    c.fillStyle = hg;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // ---- Hazne (dort taslik yuva) ----
    const trayY = CANVAS_H - 34;
    const trayCx = CANVAS_W / 2;
    const slotW = 72;
    const gapSlot = 10;
    const trayW = 4 * slotW + 3 * gapSlot;
    c.fillStyle = "rgba(10,20,30,0.35)";
    c.beginPath();
    c.roundRect(trayCx - trayW / 2 - 14, trayY - 40, trayW + 28, 66, 14);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.25)";
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = "rgba(20,10,4,0.5)";
    c.font = "bold 14px Georgia";
    c.textAlign = "center";
    c.fillText("HAZNE", trayCx, trayY - 45);
    c.fillStyle = "#c89050";
    c.fillText("HAZNE", trayCx, trayY - 46);
    for (let i = 0; i < 4; i++) {
      const sx = trayCx - trayW / 2 + i * (slotW + gapSlot);
      c.fillStyle = "rgba(255,255,255,0.06)";
      c.beginPath();
      c.roundRect(sx, trayY - 28, slotW, 40, 10);
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.18)";
      c.lineWidth = 1;
      c.stroke();
      if (i < this.tray.length) {
        // Haznedeki tas: mini ceviz tas olarak gorunsun
        const tt = this.tray[i];
        const fh = 42;
        const fw = fh * (this.tw / this.th);
        const fx0 = sx + slotW / 2 - fw / 2;
        const fy0 = trayY - 28 + (40 - fh) / 2;
        c.save();
        c.shadowColor = "rgba(0,0,0,0.55)";
        c.shadowBlur = 7;
        c.shadowOffsetY = 2;
        c.drawImage(this.getFaceCanvas(tt.symbol, true), fx0, fy0, fw, fh);
        c.restore();
      }
    }
    c.textBaseline = "alphabetic";


    // Üst şerit: ahşap bar + istatistik.
    const remaining = this.tiles.filter((t) => !t.removed).length;
    const total = this.tiles.length;
    // Ahşap bar arka planı
    c.save();
    const barY = 96;
    const barH = 62;
    const barG = c.createLinearGradient(0, barY, 0, barY + barH);
    barG.addColorStop(0, "rgba(60,40,18,0.85)");
    barG.addColorStop(0.5, "rgba(50,32,14,0.90)");
    barG.addColorStop(1, "rgba(40,25,10,0.85)");
    c.fillStyle = barG;
    c.beginPath();
    c.roundRect(16, barY, CANVAS_W - 32, barH, 12);
    c.fill();
    // Ahşap kenar）
    c.strokeStyle = "rgba(212,175,55,0.4)";
    c.lineWidth = 1.5;
    c.stroke();
    // İçerneк parıltı
    const barHi = c.createLinearGradient(0, barY, 0, barY + barH);
    barHi.addColorStop(0, "rgba(255,255,255,0.08)");
    barHi.addColorStop(0.4, "rgba(255,255,255,0)");
    barHi.addColorStop(1, "rgba(0,0,0,0.1)");
    c.fillStyle = barHi;
    c.beginPath();
    c.roundRect(16, barY, CANVAS_W - 32, barH, 12);
    c.fill();
    c.restore();
    c.fillStyle = "#ffd75e";
    c.font = "bold 18px Georgia";
    c.textAlign = "center";
    let topLine = `Puan: ${this.score}`;
    if (this.combo > 1 && this.comboTimer > 0) topLine += `   Combo ×${this.combo}`;
    c.fillText(topLine, CANVAS_W / 2, barY + 24);
    // Kombo gosterigi (sag ust)
    if (this.combo > 1 && this.comboTimer > 0) {
      const cAlpha = Math.min(1, this.comboTimer / 0.8);
      const cPulse = 0.7 + 0.3 * Math.sin(this.time * 6);
      c.save();
      c.globalAlpha = cAlpha;
      c.textAlign = "right";
      c.font = "bold 28px Georgia";
      c.shadowColor = "rgba(255,150,40,0.7)";
      c.shadowBlur = 14;
      c.fillStyle = "rgba(255,180,40," + cPulse.toFixed(2) + ")";
      c.fillText(`×${this.combo} Kombo`, CANVAS_W - 36, barY + 24);
      c.shadowBlur = 0;
      c.fillStyle = "#ffd75e";
      c.fillText(`×${this.combo} Kombo`, CANVAS_W - 36, barY + 24);
      c.restore();
    }
    c.fillStyle = "#d4e8f2";
    c.fillText(`Kalan: ${remaining}/${total}   Hamle: ${this.moves}   Süre: ${Math.floor(this.seconds)} sn   Karıştır: ${this.maxShuffles - this.shuffleCount}`, CANVAS_W / 2, barY + 48);

    for (const wp of this.windParticles) { const a = Math.max(0, wp.life / wp.max); c.save(); c.globalAlpha = a * 0.8; c.fillStyle = wp.color; c.beginPath(); c.arc(wp.x, wp.y, wp.r * a, 0, Math.PI * 2); c.fill(); c.restore(); }
    for (const ft of this.flameTrail) { const a = Math.max(0, ft.life / ft.max); c.save(); c.globalAlpha = a * 0.6; const fg = c.createRadialGradient(ft.x, ft.y, 0, ft.x, ft.y, ft.r); fg.addColorStop(0, "rgba(255,160,40,0.8)"); fg.addColorStop(0.5, "rgba(255,80,20,0.4)"); fg.addColorStop(1, "rgba(255,40,10,0)"); c.fillStyle = fg; c.beginPath(); c.arc(ft.x, ft.y, ft.r, 0, Math.PI * 2); c.fill(); c.restore(); }
    for (const sr of this.starRain) { c.save(); c.globalAlpha = Math.max(0, sr.alpha); c.translate(sr.x, sr.y); c.rotate(sr.rot); c.fillStyle = sr.color; c.beginPath(); for (let i = 0; i < 4; i++) { const ang = (i / 4) * Math.PI * 2; c.lineTo(Math.cos(ang) * sr.size, Math.sin(ang) * sr.size); c.lineTo(Math.cos(ang + Math.PI / 4) * sr.size * 0.35, Math.sin(ang + Math.PI / 4) * sr.size * 0.35); } c.closePath(); c.fill(); c.restore(); }
    for (const mp of this.mistParticles) { c.save(); c.globalAlpha = Math.max(0, mp.alpha); const mg = c.createRadialGradient(mp.x, mp.y, 0, mp.x, mp.y, mp.r); mg.addColorStop(0, "rgba(180,200,220,0.4)"); mg.addColorStop(1, "rgba(180,200,220,0)"); c.fillStyle = mg; c.beginPath(); c.arc(mp.x, mp.y, mp.r, 0, Math.PI * 2); c.fill(); c.restore(); }
    if (this.showAchievement) { c.save(); const achA = Math.min(1, this.achievementTimer / 0.3); c.globalAlpha = achA; c.fillStyle = "rgba(20,12,5,0.85)"; c.beginPath(); c.roundRect(CANVAS_W / 2 - 140, 140, 280, 50, 12); c.fill(); c.strokeStyle = "#ffd75e"; c.lineWidth = 2; c.beginPath(); c.roundRect(CANVAS_W / 2 - 140, 140, 280, 50, 12); c.stroke(); c.fillStyle = "#ffd75e"; c.font = "bold 16px Georgia"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("Basari: " + this.showAchievement, CANVAS_W / 2, 165); c.restore(); }
    // Alttaki kısayollar (haznenin üstü) - sadece masaustu
    if (!("ontouchstart" in window)) {
      c.fillStyle = "rgba(200,145,80,0.65)";
      c.font = "15px Georgia";
      c.fillText("[Yeni Oyun] N   [Geri Al] U   [Sonraki] L", CANVAS_W / 2, CANVAS_H - 60);
    }
    // ---- Kayip ekrani ----
    if (this.lost) {
      c.fillStyle = "rgba(30,5,5,0.55)";
      c.fillRect(0, 0, CANVAS_W, CANVAS_H);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = "bold 64px Georgia";
      c.fillStyle = "#ff7a6e";
      c.fillText("Kaybettin!", CANVAS_W / 2, CANVAS_H / 2 - 120);
      c.font = "bold 26px Georgia";
      c.fillStyle = "#f2c9c4";
      c.fillText("Hazne doldu, eslesme kalmadi.", CANVAS_W / 2, CANVAS_H / 2 - 65);
      const bcx = CANVAS_W / 2, bcy = CANVAS_H - 380;
      c.fillStyle = "#7d2a2a";
      c.beginPath();
      c.roundRect(bcx - 105, bcy - 29, 210, 58, 16);
      c.fill();
      c.strokeStyle = "#ffb27a";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(bcx - 105, bcy - 29, 210, 58, 16);
      c.stroke();
      c.fillStyle = "#ffe6d5";
      c.font = "bold 24px Georgia";
      c.fillText("Yeniden Oyna", bcx, bcy);
    }

    // ---- Kazanma ekrani ----
    if (this.won) {
      c.fillStyle = "rgba(0,10,20,0.35)";
      c.fillRect(0, 0, CANVAS_W, CANVAS_H);
      // Zafer sinematik: isik huzmeleri
      if (this.victoryRays.length > 0) {
        c.save();
        c.translate(CANVAS_W / 2, CANVAS_H / 2 - 40);
        for (const ray of this.victoryRays) {
          c.save();
          c.rotate(ray.angle);
          c.globalAlpha = ray.alpha * (0.4 + 0.2 * Math.sin(this.time * 2 + ray.angle));
          const rg = c.createLinearGradient(0, 0, 0, -ray.len);
          rg.addColorStop(0, "rgba(255,215,94,0.5)");
          rg.addColorStop(0.5, "rgba(255,200,60,0.2)");
          rg.addColorStop(1, "rgba(255,180,40,0)");
          c.fillStyle = rg;
          c.beginPath();
          c.moveTo(-8, 0);
          c.lineTo(8, 0);
          c.lineTo(2, -ray.len);
          c.lineTo(-2, -ray.len);
          c.closePath();
          c.fill();
          c.restore();
        }
        c.restore();
      }
      if (this.gateOpen > 0) { c.save(); const gateW = 160 * this.gateOpen; const gateH = 220 * this.gateOpen; const gx = CANVAS_W / 2 - gateW / 2; const gy = CANVAS_H / 2 - gateH / 2 - 30; c.fillStyle = "#5a3a18"; c.beginPath(); c.roundRect(gx - 8, gy - 8, gateW + 16, gateH + 16, 8); c.fill(); const doorGap = gateW * 0.4 * this.gateOpen; c.fillStyle = "#2a1a08"; c.fillRect(gx, gy, gateW / 2 - doorGap / 2, gateH); c.fillRect(gx + gateW / 2 + doorGap / 2, gy, gateW / 2 - doorGap / 2, gateH); if (this.gateOpen > 0.5) { c.globalAlpha = (this.gateOpen - 0.5) * 0.8; const lg = c.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2 - 30, 10, CANVAS_W / 2, CANVAS_H / 2 - 30, 120); lg.addColorStop(0, "#ffd75e"); lg.addColorStop(1, "rgba(255,215,94,0)"); c.fillStyle = lg; c.beginPath(); c.arc(CANVAS_W / 2, CANVAS_H / 2 - 30, 120, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; } c.restore(); }
      // Ucan taslar
      for (const vt of this.victoryTiles) {
        c.save();
        c.globalAlpha = vt.alpha;
        c.translate(vt.x, vt.y);
        c.rotate(vt.rot);
        const sz = 18;
        const R = 4;
        const fg = c.createLinearGradient(-sz/2, -sz*0.7, sz/2, sz*0.7);
        fg.addColorStop(0, "#faf4e6");
        fg.addColorStop(0.5, "#e0d4b8");
        fg.addColorStop(1, "#d4c8a8");
        c.fillStyle = fg;
        c.beginPath();
        c.roundRect(-sz/2, -sz*0.7, sz, sz*1.4, R);
        c.fill();
        c.strokeStyle = "#c8b898";
        c.lineWidth = 1.5;
        c.beginPath();
        c.roundRect(-sz/2, -sz*0.7, sz, sz*1.4, R);
        c.stroke();
        c.fillStyle = "#4a3520";
        c.font = `bold ${Math.round(sz * 0.6)}px ${CJK_FONT}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(faceLabel(vt.symbol), 0, 0);
        c.restore();
      }
      c.textAlign = "center";
      c.textBaseline = "middle";
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const back = (k: number): number => (k <= 0 ? 0 : 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2));
      const tk = back(Math.min(1, (this.time - this.wonAt) / 0.45));
      c.save();
      c.translate(CANVAS_W / 2, CANVAS_H / 2 - 120);
      c.scale(Math.max(0.001, tk), Math.max(0.001, tk));
      c.font = "bold 64px Georgia";
      c.fillStyle = "#ffe08a";
      c.fillText("Zafer!", 0, 0);
      c.restore();
      c.font = "bold 26px Georgia";
      c.fillStyle = "#cfe6f2";
      c.fillText("Tum taslar eslestirildi. Seviye tamamlandi!", CANVAS_W / 2, CANVAS_H / 2 - 60);
      const starCount = this.calcStars();
      for (let i = 0; i < 3; i++) {
        const e = back(Math.min(1, (this.time - this.wonAt - (0.35 + i * 0.2)) / 0.35));
        if (e <= 0) continue;
        c.save();
        c.translate(CANVAS_W / 2 + (i - 1) * 40, CANVAS_H / 2 - 18);
        c.scale(e, e);
        c.font = "bold 34px Georgia";
        c.fillStyle = i < starCount ? "#ffd75e" : "rgba(255,255,255,0.22)";
        c.fillText(i < starCount ? "★" : "☆", 0, 0);
        c.restore();
      }
      c.font = "bold 19px Georgia";
      c.fillStyle = "#9fd0e0";
      c.fillText(`Puan: ${this.score}   Hamle: ${this.moves}   Süre: ${Math.floor(this.seconds)} sn`, CANVAS_W / 2, CANVAS_H / 2 + 24);
      if (!("ontouchstart" in window)) {
        c.font = "bold 20px Georgia";
        c.fillText("[Sonraki Seviye] L    [Yeniden Oyna] N", CANVAS_W / 2, CANVAS_H / 2 + 60);
      }
      let bestLine = "";
      try {
        const b = localStorage.getItem("otuken_" + this.levelIndex + "_best");
        const st = localStorage.getItem("otuken_" + this.levelIndex + "_stars");
        if (b) {
          bestLine = "En iyi: " + b + " sn" + (st ? "  \u2605".repeat(Number(st)) : "");
        }
      } catch { /* ignore */ }
      if (bestLine) {
        c.font = "bold 17px Georgia";
        c.fillStyle = "#ffd75e";
        c.fillText(bestLine, CANVAS_W / 2, CANVAS_H / 2 + 92);
      }
    }

    // Combo parlama (ekran geneline yayan altin flaş).
    if (this.flash > 0) {
      c.fillStyle = "rgba(255,205,90," + (this.flash * 0.16).toFixed(3) + ")";
      c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    // Konfeti (kagit parcalari gibi havada salinir).
    for (const p of this.confetti) {
      c.save();
      c.globalAlpha = Math.min(1, p.life / 1.5);
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.color;
      c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.45 + 0.55 * Math.abs(Math.sin(p.rot * 2))));
      c.restore();
    }

    // ---- Click pop aurasi (altin dairesel dalga) ----
    for (const cp of this.clickPops) {
      const a = Math.max(0, cp.life / cp.max);
      const r = cp.r * (1 + (1 - a) * 2.5);
      c.save();
      c.globalAlpha = a * 0.35;
      c.strokeStyle = "#ffd75e";
      c.lineWidth = 2.5 * a;
      c.beginPath();
      c.arc(cp.x, cp.y, r, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = a * 0.12;
      c.fillStyle = "#ffd75e";
      c.fill();
      c.restore();
    }

    // ---- Suyulen skor metinleri (3D parilti + yukari suzulme) ----
    for (const ft of this.floatingTexts) {
      const a = Math.max(0, ft.life / ft.max);
      c.save();
      c.globalAlpha = a;
      c.textAlign = "center";
      c.textBaseline = "middle";
      // Golge (3D derinlik)
      c.fillStyle = "rgba(0,0,0,0.5)";
      c.font = "bold " + ft.size + "px Georgia";
      c.fillText(ft.text, ft.x + 1.5, ft.y + 1.5);
      // Ana yazi
      c.fillStyle = ft.color;
      c.fillText(ft.text, ft.x, ft.y);
      // Parilti
      c.globalAlpha = a * 0.5 * Math.sin(this.time * 12);
      c.fillStyle = "#ffffff";
      c.fillText(ft.text, ft.x - 0.5, ft.y - 0.5);
      c.restore();
    }

    c.restore(); // shake transform sonu
  }

  private specialArt(): "mixed" | "none" {
    return this.levelIndex >= 100 ? "mixed" : "none";
  }

/** On-talep tas yuzu (ceviz + inlay); boyuta gore on-bellekli. */
  private getFaceCanvas(kind: string, open: boolean): HTMLCanvasElement {
    const w = this.tw;
    const h = this.th;
    const key = kind + "|" + (open ? 1 : 0) + "|" + w + "x" + h;
    const hit = this.faceCache.get(key);
    if (hit) return hit;
    const S = 2;
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * S);
    cv.height = Math.round(h * S);
    const m = cv.getContext("2d")!;
    m.scale(S, S);
    this.paintFace(m, kind, open, w, h);
    this.faceCache.set(key, cv);
    return cv;
  }

  /** El oymasi ceviz yuzu: agac dokusu + parlatilmis panel + inlay sembol. */
  private paintFace(m: CanvasRenderingContext2D, kind: string, open: boolean, w: number, h: number): void {
    const R = Math.max(4, Math.round(w * 0.125));
    // Deterministik agac dokusu (tas basina sabit, ama her turde farkli).
    let seed = kind.charCodeAt(0) * 31 + kind.charCodeAt(kind.length - 1) * 7 + (open ? 3 : 11);
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    // ---- Ceviz tabani ----
    const bg = m.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, open ? "#f5ecd8" : "#6b1a1a");
    bg.addColorStop(0.5, open ? "#e8dcc0" : "#4a1010");
    bg.addColorStop(1, open ? "#d4c8a8" : "#320808");
    m.fillStyle = bg;
    m.beginPath();
    m.roundRect(0, 0, w, h, R);
    m.fill();
    m.save();
    m.beginPath();
    m.roundRect(1, 1, w - 2, h - 2, R - 1);
    m.clip();
    for (let i = 0; i < 11; i++) {
      const y0 = (h / 11) * i + rnd() * 4;
      m.strokeStyle = rnd() > 0.5 ? "rgba(60,40,20,0.18)" : "rgba(200,180,140,0.12)";
      m.lineWidth = 0.8 + rnd() * 0.9;
      m.beginPath();
      m.moveTo(-2, y0);
      const step = (w + 4) / 4;
      for (let x = 0; x < w + 4; x += step) {
        m.quadraticCurveTo(x + step / 2, y0 + (rnd() - 0.5) * 5, x + step, y0 + (rnd() - 0.5) * 3);
      }
      m.stroke();
    }
    // Agac gumlusu
    m.strokeStyle = "rgba(80,20,20,0.25)";
    m.lineWidth = 1;
    const kx = w * (0.2 + rnd() * 0.6);
    const ky = h * (0.15 + rnd() * 0.7);
    for (let r = 2; r < 7; r += 2.4) {
      m.beginPath();
      m.ellipse(kx, ky, r * 1.5, r, 0.3, 0, Math.PI * 2);
      m.stroke();
    }
    m.restore();
    // ---- Oyulmus yuz paneli (cukur) ----
    const px = w * 0.09;
    const py = h * 0.075;
    const pw = w - px * 2;
    const ph = h - py * 2;
    const pR = Math.max(3, R - 2);
    const pg = m.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, open ? "#f0e4cc" : "#5a1515");
    pg.addColorStop(1, open ? "#ddd0b4" : "#3a0c0c");
    m.fillStyle = pg;
    m.beginPath();
    m.roundRect(px, py, pw, ph, pR);
    m.fill();
    m.strokeStyle = "rgba(80,60,30,0.35)";
    m.lineWidth = 1.4;
    m.beginPath();
    m.roundRect(px, py, pw, ph, pR);
    m.stroke();
    m.strokeStyle = "rgba(255,245,220,0.45)";
    m.lineWidth = 1;
    m.beginPath();
    m.roundRect(px + 1.2, py + 1.6, pw - 2.4, ph - 2.4, pR - 1);
    m.stroke();
    if (!open) {
      // Kapali tas arkaligi: hafif kare dokusu + merkezde Gokturk boynuz burme cifti.
      m.save();
      m.beginPath();
      m.roundRect(px, py, pw, ph, pR);
      m.clip();
      m.globalAlpha = 0.09;
      m.strokeStyle = "#8a3030";
      m.lineWidth = 1;
      for (let i = -h; i < w + h; i += 7) {
        m.beginPath();
        m.moveTo(i, 0);
        m.lineTo(i + h, h);
        m.stroke();
        m.beginPath();
        m.moveTo(i, h);
        m.lineTo(i + h, 0);
        m.stroke();
      }
      m.restore();
      this.hornSpiral(m, w / 2 - w * 0.09, h / 2, h * 0.11, 1, 0.55);
      this.hornSpiral(m, w / 2 + w * 0.09, h / 2, h * 0.11, -1, 0.55);
      return;
    }
    // ---- Kazima: cekintinin alt kenari isik + koyu inlay ----
    const carve = (ch: string, cx: number, cy: number, size: number, color: string) => {
      m.font = "bold " + Math.round(size) + "px " + CJK_FONT;
      m.textAlign = "center";
      m.textBaseline = "middle";
      // Koyu halo (arka plan kontrastı)
      m.strokeStyle = "rgba(0,0,0,0.45)";
      m.lineWidth = Math.max(2, size * 0.06);
      m.lineJoin = "round";
      m.strokeText(ch, cx, cy);
      // Işık kenar (alt katman)
      m.fillStyle = "rgba(255,250,240,0.70)";
      m.fillText(ch, cx, cy + 1.5);
      // Ana sembol
      m.fillStyle = color;
      m.fillText(ch, cx, cy);
    };
    // Turkuaz inlay tas: cekinti + parlatilmis tas + matrix damari + spekular.
    const stone = (cx: number, cy: number, r: number) => {
      m.beginPath();
      m.arc(cx, cy, r + 1.6, 0, Math.PI * 2);
      m.fillStyle = "rgba(10,5,2,0.75)";
      m.fill();
      const g = m.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.4, "#e8e0d4");
      g.addColorStop(1, "#b8a890");
      m.fillStyle = g;
      m.beginPath();
      m.arc(cx, cy, r, 0, Math.PI * 2);
      m.fill();
      m.strokeStyle = "rgba(80,60,40,0.30)";
      m.lineWidth = Math.max(0.6, r * 0.12);
      m.beginPath();
      m.moveTo(cx - r * 0.55, cy + r * 0.18);
      m.quadraticCurveTo(cx, cy - r * 0.12, cx + r * 0.55, cy + r * 0.32);
      m.stroke();
      m.fillStyle = "rgba(255,255,255,0.90)";
      m.beginPath();
      m.ellipse(cx - r * 0.35, cy - r * 0.45, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2);
      m.fill();
    };
    // Bambu inlayi: cekinti + sicak degrade + gunler + yan parlaklik.
    const stick = (cx: number, cy: number, sw: number, sh: number, color: string) => {
      const x = cx - sw / 2;
      const y = cy - sh / 2;
      m.beginPath();
      m.roundRect(x - 1, y - 1, sw + 2, sh + 2, sw * 0.5);
      m.fillStyle = "rgba(10,5,2,0.65)";
      m.fill();
      const g = m.createLinearGradient(x, 0, x + sw, 0);
      g.addColorStop(0, shade(color, -30));
      g.addColorStop(0.4, color);
      g.addColorStop(1, shade(color, -38));
      m.fillStyle = g;
      m.beginPath();
      m.roundRect(x, y, sw, sh, sw * 0.5);
      m.fill();
      m.strokeStyle = "rgba(8,24,14,0.70)";
      m.lineWidth = Math.max(0.7, sw * 0.14);
      m.beginPath();
      m.moveTo(x + sw * 0.15, y + sh * 0.32);
      m.lineTo(x + sw * 0.85, y + sh * 0.32);
      m.moveTo(x + sw * 0.15, y + sh * 0.68);
      m.lineTo(x + sw * 0.85, y + sh * 0.68);
      m.stroke();
      m.strokeStyle = "rgba(255,240,200,0.60)";
      m.lineWidth = Math.max(0.5, sw * 0.1);
      m.beginPath();
      m.moveTo(x + sw * 0.28, y + sw * 0.5);
      m.lineTo(x + sw * 0.28, y + sh - sw * 0.5);
      m.stroke();
    };
    // Geometrik Orhon tamgasi (kus / gun / koyun boynuzu).
    const tamga = (x: number, y: number, s: number, style: number) => {
      m.strokeStyle = "rgba(180,130,70,0.80)";
      m.lineWidth = 1.8;
      m.beginPath();
      if (style === 0) {
        m.moveTo(x, y - s);
        m.lineTo(x, y + s);
        m.moveTo(x, y - s * 0.3);
        m.lineTo(x - s * 0.7, y - s);
        m.moveTo(x, y - s * 0.3);
        m.lineTo(x + s * 0.7, y - s);
      } else if (style === 1) {
        m.moveTo(x, y - s);
        m.lineTo(x, y + s);
        m.moveTo(x - s, y);
        m.lineTo(x + s, y);
        m.moveTo(x - s * 0.6, y - s * 0.6);
        m.lineTo(x + s * 0.6, y + s * 0.6);
        m.moveTo(x + s * 0.6, y - s * 0.6);
        m.lineTo(x - s * 0.6, y + s * 0.6);
      } else {
        m.moveTo(x - s, y);
        m.arc(x - s * 0.5, y, s * 0.5, Math.PI, Math.PI * 2.6);
        m.moveTo(x + s, y);
        m.arc(x + s * 0.5, y, s * 0.5, Math.PI * 1.4, Math.PI * 0.4, true);
      }
      m.stroke();
    };
    const fx = w * 0.36;
    const fy = h * 0.32;
    if (kind[0] === "c") {
      // Daire: parlatilmis turkuaz inlay taslari.
      const n = Number(kind.slice(1));
      const r = n === 1 ? fy * 0.6 : n === 2 ? fy * 0.36 : n === 3 ? fy * 0.3 : n === 4 ? fy * 0.27 : fy * 0.235;
      for (const [dx, dy] of DOT_POS[n]) stone(w / 2 + dx * fx, h / 2 + dy * fy, r);
    } else if (kind[0] === "b") {
      // Bambu: inlay mizraklar (5'in ortasi kirmizi inlay).
      const n = Number(kind.slice(1));
      const sw = n === 1 ? fx * 0.36 : fx * 0.26;
      const sh = n === 1 ? fy * 1.3 : fy * 0.66;
      for (const [dx, dy] of DOT_POS[n]) {
        const isCenter = dx === 0 && dy === 0;
        stick(w / 2 + dx * fx, h / 2 + dy * fy, sw, sh, n === 5 && isCenter ? "#8a3320" : "#3f7d5a");
      }
    } else if (kind[0] === "w") {
      // Karakter: kazima sayi + koyu kirmizi wan + ince Orhon tamga cercevesi.
      m.strokeStyle = "rgba(22,12,5,0.70)";
      m.lineWidth = 1;
      m.strokeRect(px + 2.5, py + 2.5, pw - 5, ph - 5);
      m.strokeStyle = "rgba(235,190,130,0.35)";
      m.strokeRect(px + 3.6, py + 3.6, pw - 7.2, ph - 7.2);
      tamga(px + 12, py + 11, h * 0.045, 0);
      tamga(w / 2, py + 11, h * 0.045, 1);
      tamga(px + pw - 12, py + 11, h * 0.045, 2);
      carve(NUM_CH[Number(kind.slice(1)) - 1], w / 2, h / 2 - h * 0.115, h * 0.40, "#ffe0a0");
      carve("萬", w / 2, h / 2 + h * 0.175, h * 0.34, "#e8442a");
    } else if (kind === "E" || kind === "S" || kind === "W" || kind === "N") {
      m.strokeStyle = "rgba(22,12,5,0.65)";
      m.lineWidth = 1;
      m.strokeRect(px + 2.5, py + 2.5, pw - 5, ph - 5);
      carve(WIND_CH[kind], w / 2, h / 2, h * 0.52, "#ffe0a0");
    } else if (kind === "DR") {
      carve("中", w / 2, h / 2, h * 0.56, "#e8442a");
    } else if (kind === "DG") {
      carve("發", w / 2, h / 2, h * 0.56, "#44cc88");
    } else if (kind === "DW") {
      // Beyaz ejderha: oyulmus cift cerceve + merkez tamga.
      m.strokeStyle = "rgba(22,12,5,0.80)";
      m.lineWidth = Math.max(2, w * 0.055);
      m.strokeRect(px + w * 0.1, py + h * 0.12, pw - w * 0.2, ph - h * 0.24);
      m.strokeStyle = "rgba(235,190,130,0.45)";
      m.lineWidth = 1;
      m.strokeRect(px + w * 0.16, py + h * 0.18, pw - w * 0.32, ph - h * 0.36);
      tamga(w / 2, h / 2, h * 0.09, 1);
    } else if (kind[0] === "f") {
      carve(FLOWER_CH[Number(kind.slice(1)) - 1], w / 2, h / 2 - h * 0.04, h * 0.44, "#e85468");
      carve(kind.slice(1), w / 2, h / 2 + h * 0.27, h * 0.18, "#dab050");
      tamga(w / 2 - w * 0.3, h / 2 - h * 0.28, h * 0.04, 2);
      tamga(w / 2 + w * 0.3, h / 2 - h * 0.28, h * 0.04, 2);
    } else if (kind[0] === "s") {
      // Mevsim: harf + Gokturk boynuz burme cifti (sonbahar isi / kis yildizi).
      const n = Number(kind.slice(1));
      carve(SEASON_CH[n - 1], w / 2, h / 2 - h * 0.05, h * 0.38, "#dab050");
      this.hornSpiral(m, w * 0.26, h * 0.3, h * 0.09, 1, 0.60);
      this.hornSpiral(m, w * 0.74, h * 0.3, h * 0.09, -1, 0.60);
      if (n === 3) {
        m.fillStyle = "rgba(150,60,28,0.92)";
        m.save();
        m.translate(w / 2, h * 0.72);
        m.rotate(Math.PI / 4);
        m.fillRect(-2.5, -2.5, 5, 5);
        m.restore();
      } else if (n === 4) {
        m.strokeStyle = "rgba(216,203,178,0.80)";
        m.lineWidth = 1;
        m.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          m.moveTo(w / 2, h * 0.72);
          m.lineTo(w / 2 + Math.cos(a) * 6, h * 0.72 + Math.sin(a) * 6);
        }
        m.stroke();
      } else {
        tamga(w / 2, h * 0.72, h * 0.045, n === 1 ? 0 : 1);
      }
      carve(kind.slice(1), w / 2, h / 2 + h * 0.3, h * 0.15, "#b89040");
    }
  }

  /** Gokturk koyun-boynuzu burmesi (logaritmik, oyulmus). */
  private hornSpiral(m: CanvasRenderingContext2D, x: number, y: number, r: number, dir: number, alpha: number): void {
    m.save();
    m.strokeStyle = "rgba(232,186,126," + alpha.toFixed(2) + ")";
    m.lineWidth = 1.3;
    m.lineCap = "round";
    m.beginPath();
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * 2.2 * Math.PI * 2;
      const rr = r * Math.pow(0.5, a / (Math.PI * 2));
      const sx = x + dir * Math.cos(a) * rr;
      const sy = y + Math.sin(a) * rr;
      if (i === 0) m.moveTo(sx, sy);
      else m.lineTo(sx, sy);
    }
    m.stroke();
    m.restore();
  }

  private drawFace(c: CanvasRenderingContext2D, t: Tile, open: boolean, canTake: boolean): void {
    const w = this.tw;
    const h = this.th;
    const bx = t.sx;
    const by = t.sy;
    const R = Math.max(4, Math.round(w * 0.125));
    const sel = t.id === this.selectedId;

    c.save();
    c.beginPath();
    c.roundRect(bx - w / 2, by - h / 2, w, h, R);
    c.clip();

    if (sel && open) {
      c.translate(bx, by);
      c.rotate(Math.sin(this.time * 0.8) * 0.06);
      c.translate(-bx, -by);
    }

    c.drawImage(this.getFaceCanvas(t.symbol, open), bx - w / 2, by - h / 2, w, h);

    if (open) {
      const sym = t.symbol;
      const cx = bx;
      const cy = by;

      if (sym[0] === "b" || sym[0] === "c" || sym[0] === "w") {
        const shimmer = 0.08 + 0.06 * Math.sin(this.time * 1.8 + t.x * 1.2 + t.y * 0.8);
        c.globalAlpha = shimmer;
        const sg = c.createRadialGradient(cx, cy - h * 0.1, 2, cx, cy, w * 0.45);
        sg.addColorStop(0, "#ffffff");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = sg;
        c.fillRect(bx - w / 2, by - h / 2, w, h);
        c.globalAlpha = 1;
      }

      if (["E", "S", "W", "N"].includes(sym)) {
        c.globalAlpha = 0.12 + 0.06 * Math.sin(this.time * 1.5 + t.y);
        c.fillStyle = "#8ab4c8";
        c.beginPath();
        c.arc(cx + Math.sin(this.time * 1.8 + t.x) * 4, cy, w * 0.3, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
      }

      if (sym === "DR" || sym === "DG" || sym === "DW") {
        const flameColor = sym === "DR" ? "#ff4422" : sym === "DG" ? "#44ff66" : "#4488ff";
        for (let i = 0; i < 3; i++) {
          const ft = this.time * 3 + i * 2.1 + t.x * 0.3;
          const fx = cx + Math.sin(ft * 1.3) * 5;
          const fy = cy - h * 0.25 - Math.abs(Math.sin(ft)) * 10 - i * 4;
          const fr = 2 + Math.sin(ft * 2) * 1;
          c.globalAlpha = 0.35 + 0.15 * Math.sin(ft * 1.7);
          c.fillStyle = flameColor;
          c.beginPath();
          c.arc(fx, fy, fr, 0, Math.PI * 2);
          c.fill();
        }
        c.globalAlpha = 1;
      }

      if (sym[0] === "f") {
        const bloom = 0.15 + 0.08 * Math.sin(this.time * 1.4 + t.y * 0.6);
        c.globalAlpha = bloom;
        const fg = c.createRadialGradient(cx, cy, 1, cx, cy, w * 0.4);
        fg.addColorStop(0, "#ff88bb");
        fg.addColorStop(1, "rgba(255,136,187,0)");
        c.fillStyle = fg;
        c.fillRect(bx - w / 2, by - h / 2, w, h);
        c.globalAlpha = 1;
      }

      if (sym[0] === "s") {
        const sparkT = this.time * 2 + t.x * 0.7;
        const sparkA = 0.12 + 0.08 * Math.sin(sparkT);
        c.globalAlpha = sparkA;
        c.fillStyle = "#ffd75e";
        const sx2 = cx + Math.sin(sparkT * 1.3) * 6;
        const sy2 = cy + Math.cos(sparkT * 0.9) * 4;
        c.beginPath();
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + sparkT * 0.5;
          const outerR = 4 + Math.sin(sparkT * 2 + i) * 1.5;
          const innerR = 1.5;
          c.lineTo(sx2 + Math.cos(ang) * outerR, sy2 + Math.sin(ang) * outerR);
          c.lineTo(sx2 + Math.cos(ang + Math.PI / 4) * innerR, sy2 + Math.sin(ang + Math.PI / 4) * innerR);
        }
        c.closePath();
        c.fill();
        c.globalAlpha = 1;
      }
    }

    c.restore();

    if (open && canTake) {
      c.save();
      c.beginPath();
      c.roundRect(bx - w / 2, by - h / 2, w, h, R);
      c.clip();
      const pulse = 0.22 + 0.08 * Math.sin(this.time * 2.6 + t.x * 0.9 + t.y * 0.7);
      const glow = c.createRadialGradient(bx, by, w * 0.1, bx, by, w * 0.58);
      glow.addColorStop(0, "rgba(255,190,90," + pulse.toFixed(3) + ")");
      glow.addColorStop(1, "rgba(255,190,90,0)");
      c.fillStyle = glow;
      c.fillRect(bx - w / 2, by - h / 2, w, h);
      c.restore();
    }
  }
  private drawTile(
    c: CanvasRenderingContext2D,
    t: Tile,
    open: boolean,
    selected: boolean,
    canTake: boolean,
  ): void {
    const w = this.tw;
    const h = this.th;
    const x = t.sx - w / 2;
    const yTop = t.sy - h / 2;
    const R = Math.max(4, Math.round(w * 0.125));

    // ---- Renk paleti (ceviz: acik = yagli, kapali = golegde) ----
    const faceTop = open ? "#f5ecd8" : "#6b1a1a";
    const faceBot = open ? "#d4c8a8" : "#320808";
    const rim = open ? "#c8b898" : "#5a1212";

    // ---- Cift katmanli golge: yakin temas + derinlik ----
    const ly = this.lifts.get(t.id) ?? 0;
    const layerDepth = t.layer * 2.8;
    // 1) Yakin temas golgesi (keskin, hemen altinda)
    c.fillStyle = "rgba(0,0,0," + (0.85 + ly * 0.02).toFixed(3) + ")";
    c.beginPath();
    c.roundRect(x + 1 - ly * 0.3, yTop + 3 - ly * 0.7, w + 2, h + 1, R + 2);
    c.fill();
    // 2) Derinlik golgesi (yumusak, katman yuksekligine gore genisler)
    c.save();
    c.shadowColor = "rgba(0,0,0,0.5)";
    c.shadowBlur = 20 + layerDepth * 1.5;
    c.shadowOffsetY = 10 + layerDepth;
    c.fillStyle = "rgba(0,0,0,0.01)";
    c.beginPath();
    c.roundRect(x, yTop, w, h, R);
    c.fill();
    c.restore();

    // ---- Yan kalinlik (3D extrusion: 6px derinlik) ----
    const sideH = 6 + layerDepth * 0.4;
    c.fillStyle = open ? "#b8a888" : "#4a1010";
    c.beginPath();
    c.roundRect(x + 1.5, yTop + sideH, w, h, R);
    c.fill();
    // Yan kenar parcasi (sag)
    c.fillStyle = open ? "#9a8a70" : "#380a0a";
    c.beginPath();
    c.roundRect(x + w - 2.5, yTop + sideH * 0.6, 3, h * 0.85, 1);
    c.fill();

    // ---- Govde: 135 derece egimli degrade (bombeli yuzey hissi) ----
    const bg = c.createLinearGradient(x, yTop, x + w, yTop + h);
    bg.addColorStop(0, open ? "#faf4e6" : "#7a2020");
    bg.addColorStop(0.35, faceTop);
    bg.addColorStop(0.65, open ? "#e0d4b8" : "#4a1010");
    bg.addColorStop(1, faceBot);
    c.fillStyle = bg;
    c.beginPath();
    c.roundRect(x, yTop, w, h, R);
    c.fill();

    // ---- 3D Bevel: sol-ust parlak + sag-alt koyu ----
    // Sag-alt: kalin karanlik bevel
    c.strokeStyle = "rgba(0,0,0,0.45)";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(x + R + 1, yTop + h - 1.5);
    c.lineTo(x + w - 3, yTop + h - 1.5);
    c.lineTo(x + w - 1.5, yTop + R + 1);
    c.stroke();
    // Sol-ust: parlak isik cizgisi
    c.strokeStyle = "rgba(255,255,255,0.45)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x + R, yTop + 1);
    c.lineTo(x + w - 3, yTop + 1);
    c.lineTo(x + w - 1, yTop + R);
    c.stroke();

    // ---- Dis cerceve (3D kalınlık) ----
    c.strokeStyle = selected ? "#ffd700" : rim;
    c.lineWidth = selected ? 3.5 : 2;
    c.beginPath();
    c.roundRect(x, yTop, w, h, R);
    c.stroke();

    // ---- Tas yuzu: standart mahjong deseni (bambu / daire / karakter /
    //      ruzgar / ejderha / cicek / mevsim) ----
    this.drawFace(c, t, open, canTake);

    // ---- Taş yüzü sanatsal ışıklandırma (cam vurgusu + iç gölge) ----
    if (open) {
      c.save();
      const gA = c.createRadialGradient(
        x + w * 0.36,
        yTop + h * 0.28,
        2,
        x + w * 0.36,
        yTop + h * 0.28,
        w * 0.95,
      );
      gA.addColorStop(0, "rgba(255,255,255,0.35)");
      gA.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = gA;
      c.beginPath();
      c.roundRect(x + 2, yTop + 2, w - 4, h - 4, R - 1);
      c.fill();
      c.restore();
      c.save();
      const gB = c.createLinearGradient(0, yTop + h * 0.45, 0, yTop + h);
      gB.addColorStop(0, "rgba(120,80,20,0)");
      gB.addColorStop(1, "rgba(180,150,80,0.10)");
      c.fillStyle = gB;
      c.beginPath();
      c.roundRect(x + 2, yTop + 2, w - 4, h - 4, R - 1);
      c.fill();
      c.restore();
      // ---- Parilti suburmesi (lak uberinde kayan isik dalgasi) ----
      const sw0 = ((this.time * 140) % 2100) - 300;
      const dd = (t.sx + t.sy * 0.85 - sw0) / 150;
      const shA = Math.exp(-dd * dd) * 0.20;
      if (shA > 0.004) {
        const gl = c.createLinearGradient(x, yTop, x + w * 0.7, yTop + h);
        gl.addColorStop(0, "rgba(255,250,230,0)");
        gl.addColorStop(0.5, "rgba(255,250,230," + shA.toFixed(3) + ")");
        gl.addColorStop(1, "rgba(255,250,230,0)");
        c.fillStyle = gl;
        c.beginPath();
        c.roundRect(x + 1, yTop + 1, w - 2, h - 2, R - 1);
        c.fill();
      }
    }

    // ---- Hover isik cercevesi ----
    if (!selected && this.hoverId === t.id) {
      c.strokeStyle = "rgba(255,225,160,0.55)";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(x - 2.5, yTop - 2.5, w + 5, h + 5, R);
      c.stroke();
    }
    // Secili tas altina ek isik sızması
    if (selected) {
      c.save();
      c.shadowColor = "rgba(255,180,40,0.45)";
      c.shadowBlur = 12 + layerDepth;
      c.shadowOffsetY = 4;
      c.fillStyle = "rgba(255,180,40,0.03)";
      c.beginPath();
      c.roundRect(x, yTop, w, h, R);
      c.fill();
      c.restore();
    }

    // ---- Secili vurgusu (nabiz atan hale) ----
    if (selected) {
      const glA = 0.28 + 0.13 * Math.sin(this.time * 5.2);
      c.strokeStyle = "rgba(255,176,32," + glA.toFixed(3) + ")";
      c.lineWidth = 7;
      c.beginPath();
      c.roundRect(x - 3, yTop - 3, w + 6, h + 6, R + 2);
      c.stroke();
      c.strokeStyle = "rgba(255,176,32,0.4)";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(x - 6, yTop - 6, w + 12, h + 12, 13);
      c.stroke();
    }

    if (this.countdownTiles.has(t.id) && open) { const rem = this.countdownTiles.get(t.id) ?? 0; const urgency = 1 - rem / this.countdownMax; c.save(); c.fillStyle = urgency > 0.6 ? "#ff4422" : urgency > 0.3 ? "#ffaa22" : "#44cc66"; c.font = "bold 11px Georgia"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(rem), t.sx, t.sy + h * 0.38); c.restore(); }
    if (this.freezeActive && open) { c.save(); c.globalAlpha = 0.25; const frzG = c.createLinearGradient(x, yTop, x + w, yTop + h); frzG.addColorStop(0, "rgba(180,220,255,0.6)"); frzG.addColorStop(0.5, "rgba(200,240,255,0.3)"); frzG.addColorStop(1, "rgba(160,200,240,0.6)"); c.fillStyle = frzG; c.beginPath(); c.roundRect(x, yTop, w, h, R); c.fill(); c.strokeStyle = "rgba(200,240,255,0.5)"; c.lineWidth = 1; for (let i = 0; i < 3; i++) { const cx2 = t.sx + (Math.random() - 0.5) * w * 0.6; const cy2 = t.sy + (Math.random() - 0.5) * h * 0.6; c.beginPath(); c.moveTo(cx2 - 4, cy2); c.lineTo(cx2 + 4, cy2); c.moveTo(cx2, cy2 - 4); c.lineTo(cx2, cy2 + 4); c.stroke(); } c.restore(); }
    // Kış teması: taş üstünde kar birikintisi
    if (this.winterMode && open) {
      let accum = this.snowAccum.get(t.id) ?? 0;
      // Yavas birikim (time tabanli)
      if (accum < 4) {
        accum = Math.min(4, accum + 0.016);
        this.snowAccum.set(t.id, accum);
      }
      if (accum > 0.5) {
        c.save();
        c.beginPath();
        c.roundRect(x, yTop, w, h, R);
        c.clip();
        // Kar tabakasi (ust kisim)
        const snowH = accum * 2.5;
        const sg = c.createLinearGradient(x, yTop, x, yTop + snowH);
        sg.addColorStop(0, "rgba(230,240,250,0.7)");
        sg.addColorStop(0.5, "rgba(210,225,240,0.5)");
        sg.addColorStop(1, "rgba(190,210,230,0)");
        c.fillStyle = sg;
        c.beginPath();
        // Dalgalı kar kenarı
        c.moveTo(x, yTop);
        c.lineTo(x + w, yTop);
        c.lineTo(x + w, yTop + snowH);
        for (let i = w; i >= 0; i -= 8) {
          const wave = Math.sin(i * 0.15 + t.x * 0.1) * 2 + Math.sin(i * 0.3 + t.y * 0.2) * 1;
          c.lineTo(x + i, yTop + snowH + wave);
        }
        c.closePath();
        c.fill();
        // Kar parliltisi
        c.globalAlpha = 0.3 + 0.1 * Math.sin(this.time * 1.2 + t.x * 0.5);
        c.fillStyle = "#ffffff";
        c.beginPath();
        c.ellipse(x + w * 0.3, yTop + 2, w * 0.15, 1.5, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }
  }

}
