const fs = require("fs");
const ts = require("./node_modules/typescript");
function toCjs(rel) {
  const src = fs.readFileSync(rel, "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText.replace(/require\("\.\/sound"\)/g, 'require("./sound.cjs")');
}
fs.mkdirSync("_t", { recursive: true });
fs.writeFileSync("_t/sound.cjs", toCjs("src/game/sound.ts"));
fs.writeFileSync("_t/Game.cjs", toCjs("src/game/Game.ts"));
const ctx = new Proxy({}, { get: (t, p) => {
  if (p === "measureText") return () => ({ width: 10 });
  if (p === "createLinearGradient" || p === "createRadialGradient") return () => ({ addColorStop: () => {} });
  if (p === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
  return typeof p === "string" ? (() => {}) : undefined;
}, set: () => true });
const canvas = { width: 720, height: 1280, style: {}, getContext: () => ctx,
  getBoundingClientRect: () => ({ width: 534, height: 949, left: 0, top: 0 }),
  addEventListener: () => {}, removeEventListener: () => {}, toDataURL: () => "" };
const { Game } = require("./_t/Game.cjs");
let fails = 0;
for (let trial = 0; trial < 25; trial++) {
  const g = new Game(canvas);
  g.gameMode = "standard";
  g.newGame();
  const isOpen = (t) => !t.removed && g.isOpen(t) && g.sideFree(t);
  // Acik taslardan AYNI sembol icin iki tane bul (farkli katmanlarda olabilir).
  const bySym = new Map();
  for (const t of g.tiles) {
    if (!isOpen(t)) continue;
    const arr = bySym.get(t.symbol) ?? [];
    arr.push(t);
    bySym.set(t.symbol, arr);
  }
  const opts = [...bySym.values()].filter((a) => a.length >= 2);
  if (opts.length === 0) { fails++; console.log(`FAIL trial${trial}: acik ikiz bulunamadi`); continue; }
  const pair = opts[0];
  const [a, b] = [pair[0], pair[1]];
  const before = g.tiles.filter((t) => !t.removed).length;
  // Gerçek click() akışı: ikisinin ortasına tıkla.
  g.click(a.sx, a.sy);
  g.click(b.sx, b.sy);
  const aGone = a.removed, bGone = b.removed;
  const trayCleared = g.tray.length;
  const after = g.tiles.filter((t) => !t.removed).length;
  const ok = aGone && bGone && after === before - 2;
  if (!ok) { fails++; console.log(`FAIL trial${trial}: sembol=${a.symbol} aGone=${aGone} bGone=${bGone} tray=${trayCleared} delta=${before - after}`); }
}
// Farkli FLIP'li iki ayni sembol (fantastic) da eslesmeli
for (let trial = 0; trial < 10; trial++) {
  const g = new Game(canvas);
  g.gameMode = "fantastic";
  g.levelIndex = 1; g.modeLevels.fantastic = 1; // Kılıç, flip:3 (ayna)
  g.newGame();
  const isOpen = (t) => !t.removed && g.isOpen(t) && g.sideFree(t);
  const bySym = new Map();
  for (const t of g.tiles) { if (!isOpen(t)) continue; const arr = bySym.get(t.symbol) ?? []; arr.push(t); bySym.set(t.symbol, arr); }
  const diff = [...bySym.values()].find((a) => a.length >= 2 && new Set(a.map((t) => t.flip)).size >= 2);
  if (!diff) continue;
  const a = diff.find((t) => t.flip === 0) ?? diff[0];
  const b = diff.find((t) => t.flip !== a.flip) ?? diff[1];
  const before = g.tiles.filter((t) => !t.removed).length;
  g.click(a.sx, a.sy); g.click(b.sx, b.sy);
  const ok = a.removed && b.removed && g.tiles.filter((t) => !t.removed).length === before - 2;
  if (!ok) { fails++; console.log(`FAIL flip-cross trial${trial}: flips ${a.flip}/${b.flip} aGone=${a.removed} bGone=${b.removed}`); }
}
console.log(fails === 0 ? "ALL OK - ayni sembol (her yonde) click+tray ile eslesiyor" : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
