// Gercek Cin Mahjongu motoru (4 oyuncu, 144 tas, 4 set + 1 cift, fan puanlama).
// Saf mantik: DOM/tarayici bagimligi yok, node'da test edilebilir.

export type Suit = "d" | "b" | "c" | "z" | "f" | "s";
export interface CT {
  suit: Suit;
  rank: number;
  id: number;
}

export const WIND_CH = ["東", "南", "西", "北"];
export const WIND_TR = ["Doğu", "Güney", "Batı", "Kuzey"];
export const Z_TR = ["Doğu", "Güney", "Batı", "Kuzey", "Kırmızı", "Yeşil", "Beyaz"];

export function tileKey(t: CT): string {
  return t.suit + t.rank;
}
export function isCore(t: CT): boolean {
  return t.suit === "d" || t.suit === "b" || t.suit === "c" || t.suit === "z";
}
export function isFlower(t: CT): boolean {
  return t.suit === "f" || t.suit === "s";
}
export function isHonor(t: CT): boolean {
  return t.suit === "z";
}
// 34 tuk tipteki sirali indeks: d1-9 -> 0-8, b1-9 -> 9-17, c1-9 -> 18-26, z1-7 -> 27-33
export function coreIndex(t: CT): number {
  if (t.suit === "d") return t.rank - 1;
  if (t.suit === "b") return 9 + t.rank - 1;
  if (t.suit === "c") return 18 + t.rank - 1;
  if (t.suit === "z") return 27 + t.rank - 1;
  return -1;
}

export function buildWall144(): CT[] {
  const out: CT[] = [];
  let id = 0;
  const push = (suit: Suit, rank: number) => out.push({ suit, rank, id: id++ });
  for (const suit of ["d", "b", "c"] as Suit[])
    for (let r = 1; r <= 9; r++) for (let k = 0; k < 4; k++) push(suit, r);
  for (let r = 1; r <= 7; r++) for (let k = 0; k < 4; k++) push("z", r);
  for (let r = 1; r <= 4; r++) { push("f", r); push("s", r); }
  return out;
}

export interface Meld {
  kind: "chow" | "pung" | "kong";
  tiles: CT[];
  open: boolean;
}

export interface Player {
  name: string;
  seat: number;
  hand: CT[];
  melds: Meld[];
  flowers: CT[];
  discards: CT[];
  score: number;
  ai: boolean;
}

export interface FanHit {
  en: string;
  tr: string;
  pts: number;
}

export type ClaimKind = "chow" | "pung" | "kong" | "win";

export interface ClaimOption {
  player: number;
  kind: ClaimKind;
  tiles: CT[];
}

export interface HandResult {
  winner: number;
  fans: FanHit[];
  value: number;
  tsumo: boolean;
  lastTile: CT | null;
  payments: number[];
  flowers: number[];
  handTiles: CT[];
  melds: Meld[];
}

export type Phase = "idle" | "discard" | "claim" | "handOver" | "matchOver";

const HANDS_PER_MATCH = 16;
export const MIN_FAN = 8;

export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// ---- Kazanma kontrolu: 4 set + 1 cift (34 tip sayim vektoru) ----
function decompSets(counts: number[], start: number): boolean {
  let i = start;
  while (i < 34 && counts[i] === 0) i++;
  if (i >= 34) return true;
  if (counts[i] >= 3) {
    counts[i] -= 3;
    const ok = decompSets(counts, i);
    counts[i] += 3;
    if (ok) return true;
  }
  if (i < 27 && i % 9 <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
    counts[i]--; counts[i + 1]--; counts[i + 2]--;
    const ok = decompSets(counts, i);
    counts[i]++; counts[i + 1]++; counts[i + 2]++;
    if (ok) return true;
  }
  return false;
}

function countsOf(tiles: CT[]): number[] {
  const c = new Array<number>(34).fill(0);
  for (const t of tiles) {
    if (isCore(t)) c[coreIndex(t)]++;
  }
  return c;
}

export function handCounts(hand: CT[], melds: Meld[]): number[] {
  const all: CT[] = [];
  for (const t of hand) all.push(t);
  for (const m of melds) {
    if (m.kind === "chow") all.push(m.tiles[0]);
    else if (m.kind === "pung") all.push(m.tiles[0], m.tiles[0], m.tiles[0]);
    else all.push(m.tiles[0], m.tiles[0], m.tiles[0]);
  }
  return countsOf(all);
}

interface SetInfo {
  kind: "chow" | "pung";
  base: number;
  rank: number;
  suit: number;
}

function findDecomposition(counts: number[]): { sets: SetInfo[]; pair: number } | null {
  for (let p = 0; p < 34; p++) {
    if (counts[p] < 2) continue;
    const c = counts.slice();
    c[p] -= 2;
    const sets: SetInfo[] = [];
    const rec = (start: number): boolean => {
      let i = start;
      while (i < 34 && c[i] === 0) i++;
      if (i >= 34) return true;
      if (c[i] >= 3) {
        c[i] -= 3;
        sets.push({ kind: "pung", base: i, rank: i % 9, suit: i < 27 ? Math.floor(i / 9) : -1 });
        if (rec(i)) return true;
        sets.pop();
        c[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        sets.push({ kind: "chow", base: i, rank: i % 9, suit: Math.floor(i / 9) });
        if (rec(i)) return true;
        sets.pop();
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
      return false;
    };
    if (rec(0)) return { sets, pair: p };
  }
  return null;
}

export function canWinStandard(hand: CT[], melds: Meld[]): boolean {
  const c = handCounts(hand, melds);
  let total = 0;
  for (const v of c) total += v;
  if (total % 3 !== 2) return false;
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const okd = decompSets(c, 0);
    c[p] += 2;
    if (okd) return true;
  }
  return false;
}

// ---- Fan tablosu (81 kombinasyondan temsilci alt kume, klasik degerler) ----
interface WinCtx {
  tsumo: boolean;
  seatWind: number;
  roundWind: number;
  concealed: boolean;
  lastWallTile: boolean;
}

export function scoreFans(hand: CT[], melds: Meld[], ctx: WinCtx): FanHit[] {
  const dec = findDecomposition(handCounts(hand, melds));
  if (!dec) return [];
  const allTiles: CT[] = [];
  for (const t of hand) if (isCore(t)) allTiles.push(t);
  for (const m of melds) for (const t of m.tiles) if (isCore(t)) allTiles.push(t);
  const sets: SetInfo[] = [...dec.sets];
  let openSets = 0;
  for (const m of melds) {
    if (m.kind === "chow") sets.push({ kind: "chow", base: coreIndex(m.tiles[0]), rank: m.tiles[0].rank - 1, suit: Math.floor(coreIndex(m.tiles[0]) / 9) });
    else sets.push({ kind: "pung", base: coreIndex(m.tiles[0]), rank: m.tiles[0].rank - 1, suit: coreIndex(m.tiles[0]) < 27 ? Math.floor(coreIndex(m.tiles[0]) / 9) : -1 });
    if (m.open) openSets++;
  }
  const concealed = ctx.concealed && openSets === 0;
  const pungs = sets.filter((s) => s.kind === "pung");
  const chows = sets.filter((s) => s.kind === "chow");
  const fans: FanHit[] = [];
  const add = (en: string, tr: string, pts: number) => fans.push({ en, tr, pts });

  const suitsUsed = new Set<number>();
  let honorCount = 0;
  for (const t of allTiles) {
    if (isHonor(t)) honorCount++;
    else suitsUsed.add(Math.floor(coreIndex(t) / 9));
  }
  const allTerminals = allTiles.every((t) => t.rank === 1 || t.rank === 9);
  const allHonors = honorCount === allTiles.length && allTiles.length > 0;
  const fullFlush = suitsUsed.size === 1 && honorCount === 0;
  const halfFlush = suitsUsed.size === 1 && honorCount > 0;
  const allPungs = chows.length === 0 && pungs.length === 4;
  const windPungs = pungs.filter((s) => s.suit === -1 && s.base < 31).map((s) => s.rank);
  const dragonPungs = pungs.filter((s) => s.suit === -1 && s.base >= 31).map((s) => s.rank);
  const bigFourWinds = windPungs.length === 4;
  const bigThreeDragons = dragonPungs.length === 3;
  const smallFourWinds = windPungs.length === 3 && dec.pair >= 27 && dec.pair < 31;
  const smallThreeDragons = dragonPungs.length === 2 && dec.pair >= 31;
  const allChows = pungs.length === 0 && chows.length === 4;

  if (fullFlush) add("Qing Yi Se", "Tek Renk El", 64);
  if (allHonors) add("Gui Yi Se", "Tam Onur Eli", 64);
  if (allTerminals && allPungs) add("Qing Yao Jiu", "Tam Uctas Eli", 64);
  if (allPungs && !allTerminals) add("Qian Qian", "Tum Ucyluler", 64);
  if (bigFourWinds) add("Da Si Xi", "Buyuk Dort Ruzgar", 64);
  if (bigThreeDragons) add("Da San Yuan", "Buyuk Uc Ejder", 64);
  if (smallFourWinds && !bigFourWinds) add("Xiao Si Xi", "Kucuk Dort Ruzgar", 32);
  if (smallThreeDragons && !bigThreeDragons) add("Xiao San Yuan", "Kucuk Uc Ejder", 32);
  if (halfFlush && !fullFlush) add("Hun Yi Se", "Yari Tek Renk", 32);

  const pureStraight = [0, 3, 6].some((o) => {
    const s1 = chows.find((s) => s.base === o);
    const s2 = chows.find((s) => s.base === o + 3);
    const s3 = chows.find((s) => s.base === o + 6);
    return !!s1 && !!s2 && !!s3 && s1.suit === s2.suit && s2.suit === s3.suit;
  });
  const mixedStraight = [0, 3, 6].some((o) => {
    const s1 = chows.find((s) => s.base === o);
    const s2 = chows.find((s) => s.base === o + 3);
    const s3 = chows.find((s) => s.base === o + 6);
    return !!s1 && !!s2 && !!s3 && new Set([s1.suit, s2.suit, s3.suit]).size === 3;
  });
  if (pureStraight) add("Qing Long", "Tam Serit", 16);
  else if (mixedStraight) add("Jie Long", "Karma Serit", 8);

  const rankPungs: Record<number, number[]> = {};
  for (const p of pungs) {
    if (p.suit >= 0) {
      (rankPungs[p.rank] ??= []).push(p.suit);
    }
  }
  const sameRankTri = Object.values(rankPungs).some((ss) => ss.length === 3);
  if (sameRankTri) add("San Yi Gong", "Ayni Sayili Uc Pung", 16);
  const pairRank = dec.pair % 9;
  const pairSuit = dec.pair < 27 ? Math.floor(dec.pair / 9) : -1;
  const pairPungs = Object.entries(rankPungs).filter(([r, ss]) => Number(r) === pairRank && pairSuit >= 0 && !ss.includes(pairSuit) && ss.length === 2);
  if (pairPungs.length > 0) add("San Shuang Gong", "Uc Cift", 16);

  if (concealed) add("Men Qian Qing", "Gizli El", 16);

  const nineInAllSuits = [0, 8].some((r) => [0, 1, 2].every((su) => pungs.some((p) => p.suit === su && p.rank === r)));
  if (nineInAllSuits) add("San Bu Gao", "Uc Uc Art Arda Uctas", 8);

  if (!bigThreeDragons && !smallThreeDragons) {
    for (const d of dragonPungs) add("Ejder Uclusu", Z_TR[d] + " Ejder", 8);
  }
  if (!bigFourWinds && !smallFourWinds) {
    if (windPungs.includes(ctx.seatWind)) add("Koltuk Ruzgari", WIND_TR[ctx.seatWind] + " Uclusu", 8);
    if (windPungs.includes(ctx.roundWind)) add("Tur Ruzgari", WIND_TR[ctx.roundWind] + " Uclusu", 8);
  }
  if (suitsUsed.size === 2) add("Que Yi Se", "Tek Renk Eksik", 8);
  if (ctx.tsumo && ctx.lastWallTile) add("Jin Gou Diao", "Son Tasla Kazanma", 8);
  for (const m of melds) if (m.kind === "kong" && !m.open) add("An Gang", "Kacili Kong", 2);
  if (ctx.tsumo) add("Zi Mo", "Kendi Cekti", 1);
  if (honorCount === 0) add("Wu Zi Feng", "Ruzgar-Ejder Yok", 4);
  if (honorCount === 0 && allTiles.every((t) => t.rank >= 2 && t.rank <= 8)) add("Zhong Zhang", "Tam Orta Taslar", 4);
  if (allChows) add("Ping Gu", "Tam Cift Dizili", 2);
  return fans;
}

export function fanTotal(fans: FanHit[]): number {
  return fans.reduce((a, f) => a + f.pts, 0);
}

// ---- Motor ----
export class ChinaMahjong {
  players: Player[] = [];
  wall: CT[] = [];
  endWall: CT[] = [];
  handIndex = 0;
  phase: Phase = "idle";
  turn = 0;
  drawn: CT | null = null;
  pendingDiscard: CT | null = null;
  discarder = -1;
  claimOptions: ClaimOption[] = [];
  aiClaims: ClaimOption[] = [];
  result: HandResult | null = null;
  message = "";
  rng: () => number;
  onEvent: ((ev: string) => void) | null = null;
  private matchSeed: number;

  constructor(seed: number = Date.now()) {
    this.matchSeed = seed;
    this.rng = makeRng(seed);
  }

  private emit(ev: string) {
    if (this.onEvent) this.onEvent(ev);
  }

  roundWind(): number {
    return Math.floor(this.handIndex / 4);
  }
  handInRound(): number {
    return this.handIndex % 4;
  }
  dealer(): number {
    return (4 - (this.handIndex % 4)) % 4;
  }
  seatWindOf(p: number): number {
    return (p + this.handIndex) % 4;
  }

  startMatch(): void {
    this.players = [0, 1, 2, 3].map((i) => ({
      name: i === 0 ? "Sen" : ["Kuzgun", "Serkar", "Ayla"][i - 1],
      seat: 0,
      hand: [],
      melds: [],
      flowers: [],
      discards: [],
      score: 0,
      ai: i !== 0,
    }));
    this.handIndex = 0;
    this.startHand();
  }

  private startHand(): void {
    this.phase = "discard";
    this.rng = makeRng(this.matchSeed + this.handIndex * 7919 + 13);
    const wall = shuffle(buildWall144(), this.rng);
    this.wall = wall.slice(0, 136);
    this.endWall = wall.slice(136);
    for (const p of this.players) {
      p.hand = [];
      p.melds = [];
      p.flowers = [];
      p.discards = [];
      p.seat = (this.players.indexOf(p) + this.handIndex) % 4;
    }
    for (let i = 0; i < 13; i++)
      for (let p = 0; p < 4; p++)
        this.players[p].hand.push(this.wall.pop()!);
    for (let i = 0; i < 4; i++) this.sortHand(i);
    this.drawn = null;
    this.pendingDiscard = null;
    this.discarder = -1;
    this.claimOptions = [];
    this.aiClaims = [];
    this.result = null;
    const dealer = this.dealer();
    this.turn = dealer;
    this.drawFor(dealer);
    if ((this.phase as Phase) !== "handOver") this.phase = "discard";
    this.message = `El ${this.handIndex + 1}/16 · Tur rüzgarı ${WIND_TR[this.roundWind()]} · Dealer ${this.players[dealer].name}`;
    this.emit("hand");
  }

  sortHand(p: number): void {
    const pl = this.players[p];
    pl.hand.sort((a, b) => {
      const ia = coreIndex(a), ib = coreIndex(b);
      if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
      return a.id - b.id;
    });
  }

  handSize(p: number): number {
    const pl = this.players[p];
    return pl.hand.length + (this.drawn && this.turn === p ? 1 : 0);
  }

  allHandTiles(p: number): CT[] {
    const pl = this.players[p];
    const out = pl.hand.slice();
    if (this.drawn && this.turn === p) out.push(this.drawn);
    return out;
  }

  private drawFor(p: number, fromEnd = false): void {
    let fromEndNow = fromEnd;
    while (true) {
      const t = fromEndNow
        ? (this.endWall.length > 0 ? this.endWall.shift()! : null)
        : (this.wall.length > 0 ? this.wall.pop()! : null);
      if (!t) {
        this.endHandDraw();
        return;
      }
      if (isFlower(t)) {
        this.players[p].flowers.push(t);
        this.emit("flower");
        fromEndNow = true;
        continue;
      }
      this.drawn = t;
      return;
    }
  }

  private endHandDraw(): void {
    this.drawn = null;
    this.phase = "handOver";
    this.result = {
      winner: -1,
      fans: [],
      value: 0,
      tsumo: false,
      lastTile: null,
      payments: [0, 0, 0, 0],
      flowers: this.players.map((q) => q.flowers.length),
      handTiles: [],
      melds: [],
    };
    this.settleFlowersOnly();
    this.message = "Duvar bitti — berabere";
    this.emit("handover");
  }

  private settleFlowersOnly(): void {
    if (!this.result) return;
    for (let p = 0; p < 4; p++) {
      const f = this.players[p].flowers.length;
      if (f === 0) continue;
      this.result.payments[p] += f * 3;
      for (let q = 0; q < 4; q++) if (q !== p) this.result.payments[q] -= f;
    }
    this.applyPayments();
  }

  private applyPayments(): void {
    if (!this.result) return;
    for (let p = 0; p < 4; p++) this.players[p].score += this.result.payments[p];
  }

  canSelfKong(): Array<{ kind: "concealed" | "added"; tile: CT; meldIdx: number }> {
    const out: Array<{ kind: "concealed" | "added"; tile: CT; meldIdx: number }> = [];
    if (this.phase !== "discard") return out;
    const tiles = this.allHandTiles(0).filter((t) => isCore(t));
    const counts: Record<string, CT[]> = {};
    for (const t of tiles) (counts[tileKey(t)] ??= []).push(t);
    for (const list of Object.values(counts)) if (list.length === 4) out.push({ kind: "concealed", tile: list[0], meldIdx: -1 });
    for (let i = 0; i < this.players[0].melds.length; i++) {
      const m = this.players[0].melds[i];
      if (m.kind === "pung") {
        const k = tileKey(m.tiles[0]);
        if ((counts[k] ?? []).length >= 1) out.push({ kind: "added", tile: m.tiles[0], meldIdx: i });
      }
    }
    return out;
  }

  doSelfKong(kind: "concealed" | "added", meldIdx: number): void {
    if (this.phase !== "discard") return;
    const pl = this.players[0];
    const key = kind === "concealed"
      ? tileKey(this.allHandTiles(0).find((t) => {
          const c = this.allHandTiles(0).filter((u) => tileKey(u) === tileKey(t));
          return c.length === 4;
        })!)
      : tileKey(pl.melds[meldIdx].tiles[0]);
    if (kind === "concealed") {
      const all = this.allHandTiles(0);
      const four = all.filter((t) => tileKey(t) === key);
      pl.hand = pl.hand.filter((t) => !(tileKey(t) === key && four.includes(t)));
      if (this.drawn && tileKey(this.drawn) === key) this.drawn = null;
      pl.melds.push({ kind: "kong", tiles: four, open: false });
    } else {
      const m = pl.melds[meldIdx];
      m.kind = "kong";
      const extra = pl.hand.find((t) => tileKey(t) === key);
      if (extra) pl.hand = pl.hand.filter((t) => t !== extra);
      else if (this.drawn && tileKey(this.drawn) === key) {
        m.tiles.push(this.drawn);
        this.drawn = null;
      } else {
        m.tiles.push({ suit: key[0] as Suit, rank: Number(key.slice(1)), id: -100 - meldIdx });
      }
    }
    this.drawFor(0, true);
    this.sortHand(0);
    this.emit("kong");
  }

  canWinNow(p: number): boolean {
    const tiles = this.allHandTiles(p);
    if (tiles.length % 3 !== 2) return false;
    return canWinStandard(tiles, this.players[p].melds);
  }

  winFansNow(p: number, tsumo: boolean): FanHit[] {
    const tiles = this.allHandTiles(p);
    const ctx: WinCtx = {
      tsumo,
      seatWind: this.seatWindOf(p),
      roundWind: this.roundWind(),
      concealed: this.players[p].melds.every((m) => !m.open),
      lastWallTile: tsumo && (this.wall.length === 0 || this.endWall.length === 0),
    };
    return scoreFans(tiles, this.players[p].melds, ctx);
  }

  // Insan oyuncu kendi cektiği tasla kazanmayi ilan eder
  declareTsumoWin(): void {
    if (this.phase !== "discard" || this.turn !== 0) return;
    const tiles = this.allHandTiles(0);
    if (this.drawn && tiles.length % 3 === 2 && canWinStandard(tiles, this.players[0].melds)) {
      const fans = this.winFansNow(0, true);
      if (fanTotal(fans) >= MIN_FAN) this.finishWin(0, true, this.drawn);
    }
  }

  // Insan oyuncunun (0) atilastan talebi
  claimOptionsForDiscard(): ClaimOption[] {
    const opts: ClaimOption[] = [];
    const t = this.pendingDiscard;
    if (!t || !isCore(t)) return opts;
    const pl = this.players[0];
    const hand = pl.hand;
    const same = hand.filter((x) => tileKey(x) === tileKey(t));
    if (same.length >= 3) opts.push({ player: 0, kind: "kong", tiles: same.slice(0, 3) });
    if (same.length >= 2) opts.push({ player: 0, kind: "pung", tiles: same.slice(0, 2) });
    if (this.discarder === 3) {
      for (const combo of chowCombos(hand, t)) opts.push({ player: 0, kind: "chow", tiles: combo });
    }
    const testHand = [...hand, t];
    if (testHand.length % 3 === 2 && canWinStandard(testHand, pl.melds)) {
      const fans = scoreFans(testHand, pl.melds, {
        tsumo: false,
        seatWind: this.seatWindOf(0),
        roundWind: this.roundWind(),
        concealed: pl.melds.every((m) => !m.open),
        lastWallTile: false,
      });
      if (fanTotal(fans) >= MIN_FAN) opts.push({ player: 0, kind: "win", tiles: [] });
    }
    return opts;
  }

  humanClaim(kind: ClaimKind | "pass"): void {
    if (this.phase !== "claim") return;
    const my = this.claimOptions.find((o) => o.player === 0 && o.kind === kind);
    if (kind !== "pass" && !my) return;
    let chosen: ClaimOption | null = my ?? null;
    // AI talepleri arasindan en yuksek oncelikli olan
    let aiBest: ClaimOption | null = null;
    for (const a of this.aiClaims) {
      if (!aiBest || priority(a.kind) > priority(aiBest.kind) || (priority(a.kind) === priority(aiBest.kind) && a.player < aiBest.player)) aiBest = a;
    }
    if (chosen && (!aiBest || priority(chosen.kind) >= priority(aiBest.kind))) {
      this.applyClaim(chosen);
    } else if (aiBest) {
      this.applyClaim(aiBest);
    } else {
      this.advanceAfterDiscard();
    }
    this.claimOptions = [];
    this.aiClaims = [];
    this.pendingDiscard = null;
  }

  private aiDecideClaims(t: CT, from: number): ClaimOption[] {
    const out: ClaimOption[] = [];
    for (let i = 1; i < 4; i++) {
      const p = (from + i) % 4;
      if (!this.players[p].ai) continue;
      const hand = this.players[p].hand;
      const same = hand.filter((x) => tileKey(x) === tileKey(t));
      const testHand = [...hand, t];
      if (testHand.length % 3 === 2 && canWinStandard(testHand, this.players[p].melds)) {
        const fans = scoreFans(testHand, this.players[p].melds, {
          tsumo: false,
          seatWind: this.seatWindOf(p),
          roundWind: this.roundWind(),
          concealed: this.players[p].melds.every((m) => !m.open),
          lastWallTile: false,
        });
        if (fanTotal(fans) >= MIN_FAN) {
          out.push({ player: p, kind: "win", tiles: [] });
          continue;
        }
      }
      if (same.length >= 3) {
        out.push({ player: p, kind: "kong", tiles: same.slice(0, 3) });
        continue;
      }
      if (same.length >= 2) {
        const suitCount = t.suit === "z" ? 0 : hand.filter((x) => x.suit === t.suit && isCore(x)).length;
        const protectsFlush = suitCount >= 8;
        if (!protectsFlush && (t.suit === "z" || suitCount <= 4)) {
          out.push({ player: p, kind: "pung", tiles: same.slice(0, 2) });
          continue;
        }
      }
      if (i === 1 && t.suit !== "z") {
        const combo = chowCombos(hand, t).find(() => hand.filter((x) => x.suit === t.suit && isCore(x)).length >= 2);
        if (combo) out.push({ player: p, kind: "chow", tiles: combo });
      }
    }
    return out;
  }

  private applyClaim(o: ClaimOption): void {
    const pl = this.players[o.player];
    const t = this.pendingDiscard!;
    const from = this.discarder;
    this.discarder = -1;
    if (o.kind === "win") {
      this.finishWin(o.player, false, t, from);
      return;
    }
    if (o.kind === "pung") {
      for (const x of o.tiles) {
        const idx = pl.hand.findIndex((y) => y.id === x.id);
        if (idx >= 0) pl.hand.splice(idx, 1);
      }
      pl.melds.push({ kind: "pung", tiles: [...o.tiles, t], open: true });
      this.message = `${pl.name} pung sozledi!`;
      this.emit("pung");
    } else if (o.kind === "kong") {
      for (const x of o.tiles) {
        const idx = pl.hand.findIndex((y) => y.id === x.id);
        if (idx >= 0) pl.hand.splice(idx, 1);
      }
      pl.melds.push({ kind: "kong", tiles: [...o.tiles, t], open: true });
      this.message = `${pl.name} kong sozledi!`;
      this.emit("kong");
      this.turn = o.player;
      this.drawn = null;
      this.drawFor(o.player, true);
      this.sortHand(o.player);
      if (this.phase !== "handOver") this.phase = "discard";
      return;
    } else if (o.kind === "chow") {
      for (const x of o.tiles) {
        const idx = pl.hand.findIndex((y) => y.id === x.id);
        if (idx >= 0) pl.hand.splice(idx, 1);
      }
      const all = [...o.tiles, t].sort((a, b) => a.rank - b.rank);
      pl.melds.push({ kind: "chow", tiles: all, open: true });
      this.message = `${pl.name} chow sozledi!`;
      this.emit("chow");
    }
    this.turn = o.player;
    this.drawn = null;
    this.phase = "discard";
  }

  private advanceAfterDiscard(): void {
    const next = (this.discarder + 1) % 4;
    this.discarder = -1;
    this.turn = next;
    this.drawFor(next);
    if (this.phase !== "handOver") this.phase = "discard";
  }

  discard(p: number, tileId: number): void {
    if (this.phase !== "discard") return;
    if (p !== this.turn) return;
    const pl = this.players[p];
    if (this.drawn) {
      pl.hand.push(this.drawn);
      this.drawn = null;
    }
    const idx = pl.hand.findIndex((x) => x.id === tileId);
    if (idx < 0) return;
    const t = pl.hand[idx];
    pl.hand.splice(idx, 1);
    pl.discards.push(t);
    this.sortHand(p);
    this.pendingDiscard = t;
    this.discarder = p;
    this.message = "";
    this.emit("discard");
    // Talepler
    const aiClaims = this.aiDecideClaims(t, p);
    const humanOpts = p === 0 ? [] : this.claimOptionsForDiscard();
    if (humanOpts.length > 0) {
      this.claimOptions = humanOpts;
      this.aiClaims = aiClaims;
      this.phase = "claim";
      this.emit("claim");
      return;
    }
    this.aiClaims = [];
    let best: ClaimOption | null = null;
    for (const a of aiClaims) {
      if (!best || priority(a.kind) > priority(best.kind)) best = a;
    }
    if (best) {
      this.applyClaim(best);
    } else {
      this.advanceAfterDiscard();
    }
    this.pendingDiscard = null;
  }

  private finishWin(p: number, tsumo: boolean, lastTile: CT, discarder = -1): void {
    const pl = this.players[p];
    let winTiles: CT[];
    if (tsumo) {
      winTiles = this.allHandTiles(p);
    } else {
      winTiles = [...pl.hand, lastTile];
    }
    const fans = scoreFans(winTiles, pl.melds, {
      tsumo,
      seatWind: this.seatWindOf(p),
      roundWind: this.roundWind(),
      concealed: pl.melds.every((m) => !m.open),
      lastWallTile: tsumo && (this.wall.length === 0 || this.endWall.length === 0),
    });
    const value = fanTotal(fans);
    if (value < MIN_FAN) {
      // Puan yetersiz: mahjong ilan edilemez, oyun devam eder
      this.message = "Puan yetersiz (min 8) — devam";
      this.pendingDiscard = tsumo ? null : lastTile;
      if (tsumo) {
        this.phase = "discard";
      } else {
        this.phase = "discard";
        this.turn = (discarder + 1) % 4;
        this.discarder = -1;
        this.drawFor(this.turn);
        if ((this.phase as Phase) !== "handOver") this.phase = "discard";
      }
      this.emit("lowfan");
      return;
    }
    if (tsumo) this.drawn = null;
    const payments = [0, 0, 0, 0];
    for (let q = 0; q < 4; q++) {
      if (q === p) continue;
      if (tsumo) payments[q] -= value + 8;
      else payments[q] -= q === discarder ? value + 8 : 8;
      if (q !== p) payments[p] += tsumo ? value + 8 : q === discarder ? value + 8 : 8;
    }
    // Cicekler: her oyuncunun cicegi el sonunda herkes tarafindan ode
    for (let q = 0; q < 4; q++) {
      const f = this.players[q].flowers.length;
      if (f === 0) continue;
      payments[q] += f * 3;
      for (let w = 0; w < 4; w++) if (w !== q) payments[w] -= f;
    }
    this.phase = "handOver";
    this.result = {
      winner: p,
      fans,
      value,
      tsumo,
      lastTile,
      payments,
      flowers: this.players.map((q) => q.flowers.length),
      handTiles: winTiles,
      melds: pl.melds,
    };
    this.applyPayments();
    this.message = `${pl.name} MAHJONG! ${value} + 8 puan`;
    this.discarder = -1;
    this.emit("win");
  }

  nextHand(): void {
    this.handIndex++;
    if (this.handIndex >= HANDS_PER_MATCH) {
      this.phase = "matchOver";
      this.emit("matchover");
      return;
    }
    this.startHand();
  }

  aiTakeTurn(): void {
    if (this.phase !== "discard") return;
    const p = this.turn;
    if (!this.players[p].ai) return;
    const tiles = this.allHandTiles(p);
    // Ceki tasla kazaniyorsa kazi (talep sonrasi cekilen tas yok -> kazanim yok)
    if (this.drawn && tiles.length % 3 === 2 && canWinStandard(tiles, this.players[p].melds)) {
      const fans = this.winFansNow(p, true);
      if (fanTotal(fans) >= MIN_FAN) {
        this.finishWin(p, true, this.drawn);
        return;
      }
    }
    // Kong kontrolu
    const kongOpts = this.selfKongFor(p);
    if (kongOpts.length > 0 && this.rng() < 0.8) {
      const k = kongOpts[0];
      this.doSelfKongFor(p, k.kind, k.meldIdx);
      return;
    }
    const idx = this.aiChooseDiscard(p);
    const t = tiles[idx];
    if (!t) return;
    this.discard(p, t.id);
  }

  private selfKongFor(p: number): Array<{ kind: "concealed" | "added"; meldIdx: number }> {
    const out: Array<{ kind: "concealed" | "added"; meldIdx: number }> = [];
    const pl = this.players[p];
    const tiles = this.allHandTiles(p).filter((t) => isCore(t));
    const counts: Record<string, number> = {};
    for (const t of tiles) counts[tileKey(t)] = (counts[tileKey(t)] ?? 0) + 1;
    for (const n of Object.values(counts)) if (n === 4) out.push({ kind: "concealed", meldIdx: -1 });
    for (let i = 0; i < pl.melds.length; i++) {
      const m = pl.melds[i];
      if (m.kind === "pung" && (counts[tileKey(m.tiles[0])] ?? 0) >= 1) out.push({ kind: "added", meldIdx: i });
    }
    return out;
  }

  private doSelfKongFor(p: number, kind: "concealed" | "added", meldIdx: number): void {
    const pl = this.players[p];
    if (kind === "concealed") {
      const tiles = this.allHandTiles(p).filter((t) => isCore(t));
      const byKey: Record<string, CT[]> = {};
      for (const t of tiles) (byKey[tileKey(t)] ??= []).push(t);
      const key = Object.keys(byKey).find((k) => byKey[k].length === 4)!;
      const four = byKey[key];
      pl.hand = pl.hand.filter((t) => !(tileKey(t) === key && four.includes(t)));
      if (this.drawn && tileKey(this.drawn) === key) this.drawn = null;
      pl.melds.push({ kind: "kong", tiles: four, open: false });
    } else {
      const m = pl.melds[meldIdx];
      m.kind = "kong";
      const key = tileKey(m.tiles[0]);
      const idx = pl.hand.findIndex((t) => tileKey(t) === key);
      if (idx >= 0) {
        m.tiles.push(pl.hand[idx]);
        pl.hand.splice(idx, 1);
      } else if (this.drawn && tileKey(this.drawn) === key) {
        m.tiles.push(this.drawn);
        this.drawn = null;
      }
    }
    this.drawFor(p, true);
    this.sortHand(p);
    this.emit("kong");
  }

  private aiChooseDiscard(p: number): number {
    const tiles = this.allHandTiles(p);
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      let s = 0;
      const same = tiles.filter((u) => u.id !== t.id && tileKey(u) === tileKey(t)).length;
      s += same * 10;
      if (isCore(t) && !isHonor(t)) {
        for (const u of tiles) {
          if (u.id === t.id || u.suit !== t.suit) continue;
          const d = Math.abs(u.rank - t.rank);
          if (d === 1) s += 6;
          else if (d === 2) s += 2;
        }
      } else if (same === 0) {
        s -= 2;
      }
      if (s < bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    return bestIdx;
  }
}

function chowCombos(hand: CT[], t: CT): CT[][] {
  if (t.suit === "z" || t.suit === "f" || t.suit === "s") return [];
  const out: CT[][] = [];
  const find = (rank: number): CT | undefined =>
    hand.find((x) => x.suit === t.suit && x.rank === rank && isCore(x));
  // t tasini iceren uc serit: elden 2 tas gerekir
  const a = [t.rank - 2, t.rank - 1];
  const b = [t.rank - 1, t.rank + 1];
  const c = [t.rank + 1, t.rank + 2];
  for (const combo of [a, b, c]) {
    const picks: CT[] = [];
    let ok = true;
    for (const r of combo) {
      if (r < 1 || r > 9) { ok = false; break; }
      const f = find(r);
      if (!f) { ok = false; break; }
      picks.push(f);
    }
    if (ok) out.push(picks);
  }
  return out;
}

function priority(k: ClaimKind): number {
  return k === "win" ? 4 : k === "kong" ? 3 : k === "pung" ? 2 : 1;
}
