import { useEffect, useRef, useState } from "react";
import { Game, HudState, GameMode } from "./game/Game";

const MODES: Array<{ id: GameMode; name: string; icon: string; desc: string }> = [
  { id: "classic", name: "Klasik", icon: "🏛️", desc: "Seviyelerle ilerle" },
  { id: "zen", name: "Zen", icon: "🧘", desc: "Sınırsız rahat oyun" },
  { id: "race", name: "Yarış", icon: "⏱️", desc: "60sn'de max skor" },
  { id: "puzzle", name: "Bulmaca", icon: "🧩", desc: "Sadece doğru hamleler" },
  { id: "endless", name: "Sonsuz", icon: "♾️", desc: "Bitmeyen oyun" },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [levelCount, setLevelCount] = useState(12);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.75);
  const [mode, setMode] = useState<GameMode>("classic");
  const [showMenu, setShowMenu] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    gameRef.current = game;
    game.onHud = setHud;
    setLevelCount(game.getLevelCount());
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
    return () => { game.stop(); gameRef.current = null; window.removeEventListener("keydown", onKey); };
  }, []);

  const startGame = (selectedMode: GameMode) => {
    setMode(selectedMode);
    gameRef.current?.setMode(selectedMode);
    setShowMenu(false);
  };

  const won = hud?.won;

  return (
    <div className="game-shell">
      {showMenu ? (
        <div className="mode-menu">
          <div className="mode-title">Ötüken Mahjong</div>
          <div className="mode-subtitle">Oyun Modu Seç</div>
          <div className="mode-grid">
            {MODES.map((m) => (
              <button key={m.id} className="mode-card" onClick={() => startGame(m.id)}>
                <span className="mode-icon">{m.icon}</span>
                <span className="mode-name">{m.name}</span>
                <span className="mode-desc">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="arena">
            <canvas ref={canvasRef} className="arena-canvas" />
            <div className="sound-controls">
              <button className="mute-btn" onClick={() => setMuted(gameRef.current?.toggleMute() ?? false)}>
                {muted ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                )}
              </button>
              <input type="range" className="volume-slider" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(e) => { setVolume(parseFloat(e.target.value)); gameRef.current?.getSound().setVolume(parseFloat(e.target.value)); }} />
            </div>
            {mode === "race" && hud && (
              <div className="race-timer" style={{ color: hud.raceTimeLeft <= 10 ? "#ff4444" : "#ffd75e" }}>
                ⏱ {Math.ceil(hud.raceTimeLeft)}sn
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
                  <button className="btn ghost" onClick={() => setShowMenu(true)}>Mod Değiştir</button>
                </div>
              </div>
            )}
          </div>
          <div className="toolbar">
            {mode === "classic" && (
              <div className="level-picker">
                {Array.from({ length: levelCount }, (_, i) => (
                  <button key={i} className={`btn tbtn lvl ${hud?.level === i ? "active" : ""}`} onClick={() => gameRef.current?.goToLevel(i)}>{i + 1}</button>
                ))}
              </div>
            )}
            <button className="btn tbtn" onClick={() => gameRef.current?.newGame()}>Yeni Oyun</button>
            <button className="btn tbtn power-btn" onClick={() => gameRef.current?.undo()}><span>⏪</span><span>Geri</span></button>
            <button className="btn tbtn power-btn" onClick={() => gameRef.current?.hint()}><span>👁️</span><span>İpucu</span></button>
            <button className="btn tbtn power-btn" disabled={!hud || hud.shuffles <= 0} onClick={() => gameRef.current?.shuffle()}>
              <span>🔀</span><span>Karıştır</span>
              {hud && hud.shuffles > 0 && <span className="badge">{hud.shuffles}</span>}
            </button>
            <button className="btn tbtn" onClick={() => setShowMenu(true)}>☰ Menü</button>
          </div>
        </>
      )}
    </div>
  );
}
