import { useEffect, useRef, useState } from "react";
import {
  ChinaMahjong,
  CT,
  WIND_TR,
  MIN_FAN,
  fanTotal,
} from "../game/china/chinaMahjong";
import { SoundEngine } from "../game/sound";

const W = 720;
const H = 1280;
const NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const FLOWERS = ["春", "夏", "秋", "冬"];
const SEASONS = ["梅", "蘭", "菊", "竹"];
const CJK = "'Noto Serif SC','Noto Serif CJK SC','SimSun','MS Mincho',serif";

function glyph(t: CT): { ch: string; color: string; suit?: string } {
  if (t.suit === "d") return { ch: NUM[t.rank - 1], color: "#203a63", suit: "筒" };
  if (t.suit === "b") return { ch: NUM[t.rank - 1], color: "#2e8b57", suit: "索" };
  if (t.suit === "c") return { ch: NUM[t.rank - 1], color: "#c0392b", suit: "萬" };
  if (t.suit === "z") {
    if (t.rank === 5) return { ch: "中", color: "#c0392b" };
    if (t.rank === 6) return { ch: "發", color: "#2e8b57" };
    if (t.rank === 7) return { ch: "", color: "#3b6ea5" };
    return { ch: ["東", "南", "西", "北"][t.rank - 1], color: "#203a63" };
  }
  if (t.suit === "f") return { ch: FLOWERS[t.rank - 1], color: "#b8860b" };
  return { ch: SEASONS[t.rank - 1], color: "#b8860b" };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  t: CT | null,
  opts: { faceDown?: boolean; glow?: number; lift?: number } = {}
) {
  const y0 = y - (opts.lift ?? 0);
  if (opts.glow) {
    ctx.save();
    ctx.shadowColor = `rgba(255,215,94,${opts.glow})`;
    ctx.shadowBlur = 16;
  }
  const g = ctx.createLinearGradient(x, y0, x, y0 + h);
  if (opts.faceDown) {
    g.addColorStop(0, "#2f566c");
    g.addColorStop(1, "#1c3a4c");
  } else {
    g.addColorStop(0, "#f7efdd");
    g.addColorStop(1, "#e2d3b2");
  }
  roundRect(ctx, x, y0, w, h, Math.min(6, w * 0.16));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = opts.faceDown ? "#0e2433" : "#b3a284";
  ctx.stroke();
  if (opts.glow) ctx.restore();
  if (opts.faceDown || !t) {
    if (opts.faceDown && w > 18) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      roundRect(ctx, x + 3, y0 + 3, w - 6, h - 6, Math.min(4, w * 0.12));
      ctx.stroke();
    }
    return;
  }
  const gl = glyph(t);
  ctx.fillStyle = gl.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (t.suit === "z" && t.rank === 7) {
    ctx.strokeStyle = gl.color;
    ctx.lineWidth = Math.max(1.5, w * 0.06);
    roundRect(ctx, x + w * 0.24, y0 + h * 0.2, w * 0.52, h * 0.6, 2);
    ctx.stroke();
    return;
  }
  if (gl.suit) {
    ctx.font = `700 ${Math.round(h * 0.42)}px ${CJK}`;
    ctx.fillText(gl.ch, x + w / 2, y0 + h * 0.3);
    ctx.font = `700 ${Math.round(h * 0.34)}px ${CJK}`;
    ctx.fillText(gl.suit, x + w / 2, y0 + h * 0.72);
  } else {
    ctx.font = `700 ${Math.round(h * 0.52)}px ${CJK}`;
    ctx.fillText(gl.ch, x + w / 2, y0 + h * 0.52);
  }
}

function panelBg(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, active: boolean) {
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = active ? "rgba(212,175,55,0.14)" : "rgba(255,255,255,0.045)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = active ? "rgba(255,215,94,0.85)" : "rgba(212,175,55,0.22)";
  ctx.stroke();
}

function meldRow(ctx: CanvasRenderingContext2D, x: number, y: number, melds: { tiles: CT[] }[], tw: number, th: number) {
  let cx = x;
  for (const m of melds) {
    for (const t of m.tiles) {
      drawTile(ctx, cx, y, tw, th, t);
      cx += tw + 1;
    }
    cx += 5;
  }
  return cx;
}

export default function ChinaMahjongView({ onExit, paused }: { onExit: () => void; paused?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ChinaMahjong | null>(null);
  const aiAtRef = useRef(0);
  const hoverRef = useRef(-1);
  const lastDiscardRef = useRef<{ id: number; at: number }>({ id: -1, at: 0 });
  const pausedRef = useRef(!!paused);
  useEffect(() => {
    pausedRef.current = !!paused;
    if (paused) aiAtRef.current = performance.now() + 600;
  }, [paused]);
  const [, setTick] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const bump = () => setTick((t) => t + 1);

  useEffect(() => {
    const g = new ChinaMahjong(Date.now() & 0x7fffffff);
    g.onEvent = (ev) => {
      const map: Record<string, string> = {
        discard: "tileclick",
        flower: "hint",
        chow: "match",
        pung: "match",
        kong: "match",
        win: "win",
        lowfan: "hint",
        shuffle: "shuffle",
      };
      if (map[ev]) SoundEngine.play(map[ev]);
      if (ev === "discard" && g.pendingDiscard) lastDiscardRef.current = { id: g.pendingDiscard.id, at: performance.now() };
      bump();
    };
    g.startMatch();
    gameRef.current = g;
    aiAtRef.current = performance.now() + 500;
    bump();

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const loop = () => {
      const now = performance.now();
      if (!pausedRef.current) {
        if (g.phase === "discard" && g.turn !== 0 && now >= aiAtRef.current) {
          g.aiTakeTurn();
          aiAtRef.current = now + 420;
          bump();
        }
      }
      const last = lastDiscardRef.current;
      const glowId = now - last.at < 450 ? last.id : -1;
      render(ctx, g, hoverRef.current, glowId);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const canvasPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const ox = (rect.width - W * scale) / 2;
    const oy = (rect.height - H * scale) / 2;
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale };
  };

  const handRects = () => {
    const g = gameRef.current!;
    const tiles = g.players[0].hand;
    const n = tiles.length;
    const tw = 40, gap = 3;
    const dw = 40;
    const total = n * (tw + gap) - gap + 14 + dw;
    let x = (W - total) / 2;
    const y = 1168, th = 96;
    const out: Array<{ id: number; x: number; y: number; w: number; h: number; drawn: boolean }> = [];
    for (const t of tiles) {
      out.push({ id: t.id, x, y, w: tw, h: th, drawn: false });
      x += tw + gap;
    }
    if (g.drawn && g.turn === 0) {
      out.push({ id: g.drawn.id, x: x + 14 - gap, y, w: dw, h: th, drawn: true });
    }
    return out;
  };

  const onMove = (e: React.PointerEvent) => {
    const g = gameRef.current;
    if (!g || g.phase !== "discard" || g.turn !== 0) {
      hoverRef.current = -1;
      return;
    }
    const { x, y } = canvasPos(e);
    let hit = -1;
    handRects().forEach((r, i) => {
      if (x >= r.x && x <= r.x + r.w && y >= r.y - 14 && y <= r.y + r.h) hit = i;
    });
    if (hit !== hoverRef.current) bump();
    hoverRef.current = hit;
  };

  const onDown = (e: React.PointerEvent) => {
    const g = gameRef.current;
    if (!g || g.phase !== "discard" || g.turn !== 0) return;
    const { x, y } = canvasPos(e);
    for (const r of handRects()) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y - 14 && y <= r.y + r.h) {
        g.discard(0, r.id);
        bump();
        return;
      }
    }
  };

  const g = gameRef.current;
  const canTsumo = !!(g && g.phase === "discard" && g.turn === 0 && g.canWinNow(0) && fanTotal(g.winFansNow(0, true)) >= MIN_FAN);
  const kongs = g && g.phase === "discard" && g.turn === 0 ? g.canSelfKong() : [];
  const claims = g && g.phase === "claim" ? g.claimOptions : [];
  const claimKinds = Array.from(new Set(claims.map((c) => c.kind)));
  const result = g?.result ?? null;

  return (
    <div className="chin-root">
      <canvas
        ref={canvasRef}
        className="arena-canvas chin-canvas"
        width={W}
        height={H}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerLeave={() => { hoverRef.current = -1; bump(); }}
      />
      {g && g.phase === "discard" && g.turn === 0 && (
        <div className="chin-bar">
          {canTsumo && (
            <button className="chin-btn win" onClick={() => { g.declareTsumoWin(); bump(); }}>
              🀄 Kazan! ({fanTotal(g.winFansNow(0, true))})
            </button>
          )}
          {kongs.length > 0 && (
            <button className="chin-btn" onClick={() => { g.doSelfKong(kongs[0].kind, kongs[0].meldIdx); bump(); }}>
              Kong
            </button>
          )}
          <span className="chin-hint">Bir taşa dokunarak at</span>
        </div>
      )}
      {g && g.phase === "claim" && (
        <div className="chin-bar">
          {claimKinds.includes("win") && (
            <button className="chin-btn win" onClick={() => { g.humanClaim("win"); bump(); }}>🀄 Kazan!</button>
          )}
          {claimKinds.includes("kong") && (
            <button className="chin-btn" onClick={() => { g.humanClaim("kong"); bump(); }}>Kong</button>
          )}
          {claimKinds.includes("pung") && (
            <button className="chin-btn" onClick={() => { g.humanClaim("pung"); bump(); }}>Pung (Üçlü)</button>
          )}
          {claimKinds.includes("chow") && (
            <button className="chin-btn" onClick={() => { g.humanClaim("chow"); bump(); }}>Serit</button>
          )}
          <button className="chin-btn ghost" onClick={() => { g.humanClaim("pass"); bump(); }}>Geç</button>
        </div>
      )}
      {g && g.phase === "handOver" && result && (
        <div className="chin-overlay">
          <div className="chin-card">
            {result.winner === -1 ? (
              <>
                <div className="chin-card-title">Berabere</div>
                <div className="chin-card-sub">Duvar bitti, kazanan yok. Çiçekler ödendi.</div>
              </>
            ) : (
              <>
                <div className="chin-card-title">
                  {g.players[result.winner].name} kazandı! {result.tsumo ? "(Tsumo)" : "(Ron)"}
                </div>
                <div className="chin-card-sub">El değeri: <b>{result.value}</b> puan · min {MIN_FAN}</div>
                <div className="chin-fans">
                  {result.fans.map((f) => (
                    <div key={f.en} className="chin-fan-row">
                      <span>{f.tr}</span>
                      <span className="chin-fan-pts">+{f.pts}</span>
                    </div>
                  ))}
                  {result.fans.length === 0 && <div className="chin-fan-row"><span>—</span></div>}
                </div>
                <div className="chin-pay">
                  {g.players.map((p, i) => (
                    <div key={i} className="chin-pay-row">
                      <span>{p.name}</span>
                      <span className={result.payments[i] >= 0 ? "pos" : "neg"}>
                        {result.payments[i] >= 0 ? "+" : ""}{result.payments[i]}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button className="chin-btn primary" onClick={() => { g.nextHand(); bump(); }}>
              Sonraki El
            </button>
          </div>
        </div>
      )}
      {g && g.phase === "matchOver" && (
        <div className="chin-overlay">
          <div className="chin-card">
            <div className="chin-card-title">Maç Bitti</div>
            <div className="chin-card-sub">16 el oynandı — nihai skorlar:</div>
            {[...g.players].map((p) => p).sort((a, b) => b.score - a.score).map((p) => (
              <div key={p.name} className="chin-pay-row big">
                <span>{p.name}</span>
                <span className={p.score >= 0 ? "pos" : "neg"}>{p.score}</span>
              </div>
            ))}
            <div className="chin-actions-row">
              <button className="chin-btn primary" onClick={() => {
                const ng = new ChinaMahjong(Date.now() & 0x7fffffff);
                ng.onEvent = g.onEvent;
                ng.startMatch();
                gameRef.current = ng;
                aiAtRef.current = performance.now() + 500;
                bump();
              }}>
                Yeni Maç
              </button>
              <button className="chin-btn ghost" onClick={onExit}>Ana Menü</button>
            </div>
          </div>
        </div>
      )}
      {showRules && (
        <div className="chin-overlay" onClick={() => setShowRules(false)}>
          <div className="chin-card rules" onClick={(e) => e.stopPropagation()}>
            <div className="chin-card-title">Gerçek Çin Mahjong'u</div>
            <ul className="chin-rules">
              <li>144 taş, 4 oyuncu; elin 13 taş, 4 set (serit/üçlü) + 1 çift.</li>
              <li>Kazanmak için en az <b>{MIN_FAN} puan</b> fan gerekir.</li>
              <li>Sıradayken bir taşa dokun → atar. Çekilen taş sağda ayrı durur.</li>
              <li>Rakip attığında: Serit (sadece soldan), Pung, Kong veya Kazan talebi.</li>
              <li>Kong sonrası yedek duvardan (sondan) ek taş çekilir.</li>
              <li>Çiçek (mevsim/çiçek) çekilince açılır, her el sonunda 3'er puan ödenir.</li>
              <li>16 el: 4 tur rüzgarı × 4 el; rüzgarlar her elde döner.</li>
              <li>Tsumo: herkes değer+8 öder; Ron: atan değer+8, diğerleri 8 öder.</li>
            </ul>
            <button className="chin-btn ghost" onClick={() => setShowRules(false)}>Kapat</button>
          </div>
        </div>
      )}
      <button className="chin-rules-btn" onClick={() => setShowRules(true)} title="Kurallar">?</button>
    </div>
  );
}

function render(ctx: CanvasRenderingContext2D, g: ChinaMahjong, hover: number, glowId: number) {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a1a24");
  bg.addColorStop(0.45, "#14202e");
  bg.addColorStop(1, "#1a1430");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ---- Üst oyuncu (p2) ----
  const p2 = g.players[2];
  panelBg(ctx, 150, 58, 560, 98, g.turn === 2 && g.phase !== "handOver");
  ctx.fillStyle = "#e8dcc0";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText(p2.name, 166, 86);
  ctx.font = "400 14px system-ui, sans-serif";
  ctx.fillStyle = "#d4af37";
  ctx.fillText(WIND_TR[g.seatWindOf(2)] + " · " + p2.score + " puan", 166, 116);
  const n2 = p2.hand.length + (g.drawn && g.turn === 2 ? 1 : 0);
  for (let i = 0; i < n2; i++) drawTile(ctx, 330 + i * 24, 70, 22, 30, null, { faceDown: true });
  meldRow(ctx, 330, 112, p2.melds, 20, 27);
  p2.flowers.forEach((f, i) => drawTile(ctx, 640 + i * 23, 110, 21, 28, f));

  // ---- Sol oyuncu (p3) ----
  const p3 = g.players[3];
  panelBg(ctx, 10, 180, 118, 960, g.turn === 3 && g.phase !== "handOver");
  ctx.fillStyle = "#e8dcc0";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.textAlign = "left";
  for (let i = 0; i < p3.name.length; i++) ctx.fillText(p3.name[i], 26, 214 + i * 24);
  ctx.font = "400 13px system-ui, sans-serif";
  ctx.fillStyle = "#d4af37";
  ctx.fillText(WIND_TR[g.seatWindOf(3)], 60, 214);
  ctx.fillText(String(p3.score), 60, 240);
  const n3 = p3.hand.length + (g.drawn && g.turn === 3 ? 1 : 0);
  for (let i = 0; i < n3; i++) drawTile(ctx, 40, 300 + i * 30, 40, 27, null, { faceDown: true });
  let my = 300 + n3 * 30 + 14;
  for (const m of p3.melds) {
    meldRow(ctx, 18, my, [m], 20, 26);
    my += 32;
  }
  p3.flowers.forEach((f, i) => drawTile(ctx, 88, my + i * 28, 20, 26, f));

  // ---- Sağ oyuncu (p1) ----
  const p1 = g.players[1];
  panelBg(ctx, 592, 180, 118, 960, g.turn === 1 && g.phase !== "handOver");
  ctx.fillStyle = "#e8dcc0";
  ctx.font = "600 20px system-ui, sans-serif";
  for (let i = 0; i < p1.name.length; i++) ctx.fillText(p1.name[i], 606, 214 + i * 24);
  ctx.font = "400 13px system-ui, sans-serif";
  ctx.fillStyle = "#d4af37";
  ctx.fillText(WIND_TR[g.seatWindOf(1)], 656, 214);
  ctx.fillText(String(p1.score), 656, 240);
  const n1 = p1.hand.length + (g.drawn && g.turn === 1 ? 1 : 0);
  for (let i = 0; i < n1; i++) drawTile(ctx, 640, 300 + i * 30, 40, 27, null, { faceDown: true });
  let my1 = 300 + n1 * 30 + 14;
  for (const m of p1.melds) {
    meldRow(ctx, 618, my1, [m], 20, 26);
    my1 += 32;
  }
  p1.flowers.forEach((f, i) => drawTile(ctx, 618, my1 + i * 28, 20, 26, f));

  // ---- Bilgi şeridi ----
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(232,220,192,0.85)";
  ctx.font = "600 17px system-ui, sans-serif";
  ctx.fillText(
    `El ${g.handIndex + 1}/16  ·  Tur rüzgarı ${WIND_TR[g.roundWind()]}  ·  Duvar ${g.wall.length}`,
    W / 2, 152
  );

  // ---- p2 nehri (üst orta) ----
  drawRiver(ctx, p2.discards, 207, 170, 6, 48, 58, glowId);
  // ---- p3 nehri (sol orta dikey) ----
  drawRiverVert(ctx, p3.discards, 146, 300, 44, 54, glowId);
  // ---- p1 nehri (sağ orta dikey) ----
  drawRiverVert(ctx, p1.discards, 530, 300, 44, 54, glowId);
  // ---- İnsan nehri (alt orta) ----
  drawRiver(ctx, g.players[0].discards, 202, 860, 7, 42, 50, glowId);

  // ---- Orta bant: mesaj + sıra ----
  const turnName = g.players[g.turn]?.name ?? "";
  ctx.fillStyle = "rgba(212,175,55,0.9)";
  ctx.font = "700 26px system-ui, sans-serif";
  const turnLabel =
    g.phase === "handOver" ? "El bitti" :
    g.phase === "claim" ? "Talep zamanı!" :
    `Sıra: ${turnName}`;
  ctx.fillText(turnLabel, W / 2, 690);
  if (g.message) {
    ctx.fillStyle = "rgba(232,220,192,0.75)";
    ctx.font = "500 17px system-ui, sans-serif";
    ctx.fillText(g.message, W / 2, 726);
  }
  const dealer = g.dealer();
  ctx.fillStyle = "rgba(232,220,192,0.55)";
  ctx.font = "400 15px system-ui, sans-serif";
  ctx.fillText(`Dealer: ${g.players[dealer].name}`, W / 2, 758);

  // ---- İnsan alanı ----
  const p0 = g.players[0];
  panelBg(ctx, 10, 1150, 700, 122, g.turn === 0 && (g.phase === "discard" || g.phase === "claim"));
  ctx.textAlign = "left";
  ctx.fillStyle = "#e8dcc0";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.fillText(`Sen · ${WIND_TR[g.seatWindOf(0)]} · ${p0.score} puan`, 24, 1160);
  meldRow(ctx, 200, 1138, p0.melds, 20, 26);
  p0.flowers.forEach((f, i) => drawTile(ctx, 640 + i * 23, 1138, 21, 28, f));

  // ---- İnsan eli ----
  const tiles = p0.hand;
  const tw = 40, gap = 3, th = 96, ty = 1168;
  const dw = 40;
  const hasDrawn = !!(g.drawn && g.turn === 0);
  const total = tiles.length * (tw + gap) - gap + (hasDrawn ? 14 + dw : 0);
  let x = (W - total) / 2;
  tiles.forEach((t, i) => {
    const lift = hover === i ? 12 : 0;
    drawTile(ctx, x, ty, tw, th, t, { lift });
    x += tw + gap;
  });
  if (hasDrawn && g.drawn) {
    x += 14;
    const li = tiles.length;
    const lift = hover === li ? 12 : 0;
    drawTile(ctx, x, ty, dw, th, g.drawn, { lift });
  }
}

function drawRiver(
  ctx: CanvasRenderingContext2D,
  discards: CT[],
  x0: number,
  y0: number,
  perRow: number,
  tw: number,
  th: number,
  glowId: number
) {
  discards.slice(-perRow * 5).forEach((t, i) => {
    const cx = x0 + (i % perRow) * (tw + 3);
    const cy = y0 + Math.floor(i / perRow) * (th + 3);
    drawTile(ctx, cx, cy, tw, th, t, { glow: t.id === glowId ? 0.9 : undefined });
  });
}

function drawRiverVert(
  ctx: CanvasRenderingContext2D,
  discards: CT[],
  x0: number,
  y0: number,
  tw: number,
  th: number,
  glowId: number
) {
  discards.slice(-9).forEach((t, i) => {
    const cx = x0 + (i % 2) * (tw + 3);
    const cy = y0 + Math.floor(i / 2) * (th + 3);
    drawTile(ctx, cx, cy, tw, th, t, { glow: t.id === glowId ? 0.9 : undefined });
  });
}
