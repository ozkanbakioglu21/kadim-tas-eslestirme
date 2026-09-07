import { useEffect, useRef, useState } from "react";
import { Game, HudState, GameMode } from "./game/Game";

const MODES: Array<{ id: GameMode; name: string; icon: string; desc: string }> = [
  { id: "classic", name: "Klasik", icon: "🏛️", desc: "Seviyelerle ilerle, derin katmanlar" },
  { id: "zen", name: "Zen", icon: "🧘", desc: "Küçük tahta, sınırsız rahat oyun" },
  { id: "race", name: "Yarış", icon: "⏱️", desc: "Küçük tahta, 60sn'de max skor" },
  { id: "puzzle", name: "Bulmaca", icon: "🧩", desc: "Hazır bulmacalar, sadece doğru hamleler" },
  { id: "endless", name: "Kolay", icon: "♾️", desc: "Orta tahta, sınırsız kolay oyun" },
  { id: "viking", name: "Viking", icon: "🛡️", desc: "Geniş tahta, derin katmanlar, zorlu meydan" },
  { id: "egypt", name: "Mısır", icon: "🏺", desc: "Piramit dizimi, orta derinlik" },
  { id: "steppe", name: "Bozkır", icon: "🐎", desc: "Geniş alçak tahta, rahat oyun" },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [muted, setMuted] = useState(false);
  const [mode, setMode] = useState<GameMode>("classic");
  const [showMenu, setShowMenu] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    gameRef.current = game;
    game.onHud = setHud;
    setMuted(game.isMuted());
    game.start();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "n" || e.key === "N") game.newGame();
      else if (e.key === "u" || e.key === "U") game.undo();
      else if (e.key === "l" || e.key === "L") game.nextLevel();
      else if (e.key === "h" || e.key === "H") game.hint();
      else if (e.key === "s" || e.key === "S") game.shuffle();
      else if (e.key === "Escape") setShowMenu(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      game.stop();
      gameRef.current = null;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const selectMode = (selectedMode: GameMode) => {
    setMode(selectedMode);
    gameRef.current?.setMode(selectedMode);
    setShowMenu(false);
  };

  const goToMenu = () => {
    gameRef.current?.stop();
    gameRef.current = null;
    setHud(null);
    setShowMenu(true);
  };

  const won = hud?.won;

  return (
    <div className="game-shell">
      <div className="arena">
        <canvas ref={canvasRef} className="arena-canvas" />
        {/* Sol ust: mod basligi */}
        <div className="mode-badge">
          <div className="mode-badge-title">{MODES.find((m) => m.id === mode)?.name ?? "Klasik"}</div>
          <div className="mode-badge-icons">
            <button className="mode-badge-btn" onClick={() => setShowMenu(true)} title="Menü">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <button className="mode-badge-btn" onClick={() => setMuted(gameRef.current?.toggleMute() ?? false)} title="Ses">
              {muted ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
              )}
            </button>
          </div>
        </div>
        {/* Alt: yatay butonlar */}
        <div className="action-buttons">
          <button className="action-btn primary" onClick={() => gameRef.current?.newGame()} title="Yeni Oyun">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
          <button className="action-btn" onClick={() => gameRef.current?.undo()} title="Geri Al">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
          <button className="action-btn" onClick={() => gameRef.current?.shuffle()} title="Karıştır">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
            {mode !== "zen" && hud && hud.shuffles > 0 && <span className="action-badge">{hud.shuffles}</span>}
            {mode === "zen" && <span className="action-badge">∞</span>}
          </button>
          <button className="action-btn" onClick={() => gameRef.current?.hint()} title="İpucu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </button>
        </div>
        {/* Puan + Kombo */}
        {hud && (
          <div className="score-bar">
            <span className="score-text">{hud.score}</span>
            {hud.combo > 1 && <span className="combo-text">×{hud.combo}</span>}
          </div>
        )}
        {mode === "race" && hud && (
          <div className={`race-timer ${hud.raceTimeLeft <= 10 ? "pulse" : ""}`} style={{ color: hud.raceTimeLeft <= 10 ? "#ff4444" : "#e8dcc0" }}>
            {Math.ceil(hud.raceTimeLeft)}
          </div>
        )}
        {showMenu && (
          <div className="mode-menu-overlay">
            <div className="mode-title">Kadim Taş</div>
            <div className="mode-subtitle">Eşleştirme</div>
            <div className="mode-grid">
              {MODES.map((m) => (
                <button key={m.id} className="mode-card" onClick={() => selectMode(m.id)}>
                  <span className="mode-icon">{m.icon}</span>
                  <span className="mode-name">{m.name}</span>
                  <span className="mode-desc">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {won && (
          <div className="win-banner">
            <div className="win-title">Başardın!</div>
            <div className="win-sub">
              {hud?.levelName}: {hud?.score} puanda, {hud?.moves} hamlede, {hud?.seconds} saniyede.
            </div>
            <div className="win-stars" style={{ fontSize: 38, color: "#ffd75e", letterSpacing: 8 }}>
              {"★".repeat(hud?.stars ?? 0)}{"☆".repeat(Math.max(0, 3 - (hud?.stars ?? 0)))}
            </div>
            <div className="win-actions">
              {mode === "classic" && <button className="btn" onClick={() => gameRef.current?.nextLevel()}>Sonraki Seviye</button>}
              <button className="btn ghost" onClick={() => gameRef.current?.newGame()}>Tekrar Oyna</button>
              <button className="btn ghost" onClick={() => goToMenu()}>Mod Değiştir</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
