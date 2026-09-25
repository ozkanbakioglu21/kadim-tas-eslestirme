import { useCallback, useEffect, useRef, useState, FormEvent } from "react";
import { Game, HudState, GameMode } from "./game/Game";
import { QUOTES } from "./quotes";

const MODES: Array<{ id: GameMode; name: string; icon: string; desc: string }> = [
  { id: "standard", name: "Standart", icon: "🀄", desc: "Klasik kaplumbağa 142, saf mahjong" },
  { id: "classic", name: "Klasik", icon: "🏛️", desc: "Seviyelerle ilerle, derin katmanlar" },
  { id: "zen", name: "Zen", icon: "🧘", desc: "Küçük tahta, sınırsız rahat oyun" },
  { id: "race", name: "Yarış", icon: "⏱️", desc: "Küçük tahta, 60sn'de max skor" },
  { id: "puzzle", name: "Bulmaca", icon: "🧩", desc: "Hazır bulmacalar, sadece doğru hamleler" },
  { id: "endless", name: "Kolay", icon: "♾️", desc: "Orta tahta, sınırsız kolay oyun" },
  { id: "viking", name: "Viking", icon: "🛡️", desc: "Geniş tahta, derin katmanlar, zorlu meydan" },
  { id: "egypt", name: "Mısır", icon: "🏺", desc: "Piramit dizimi, orta derinlik" },
  { id: "steppe", name: "Bozkır", icon: "🐎", desc: "Geniş alçak tahta, rahat oyun" },
  { id: "fantastic", name: "Fantastik", icon: "🐉", desc: "Kale dizimi, ejder & büyülü tahta" },
];

type Player = { name: string; pass: string };
const PLAYER_KEY = "kadm_player_v1";

function loadPlayer(): Player | null {
  try {
    const raw = localStorage.getItem(PLAYER_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.name === "string" && typeof p.pass === "string" && p.name.length >= 2) return p;
    return null;
  } catch {
    return null;
  }
}

function hashPass(p: string): string {
  let h = 5381;
  for (let i = 0; i < p.length; i++) h = ((h << 5) + h + p.charCodeAt(i)) >>> 0;
  return "h" + h.toString(16);
}

// Acilis sayfasinda dolasan oyun figurleri: mevsimler, cicekler, ruzgarlar,
// ejderhalar, sayilar + mod emojileri.
const SPLASH_FIGS: Array<{ ch?: string; color?: string; emoji?: string }> = [
  { ch: "春", color: "#b8860b" }, { ch: "夏", color: "#b8860b" }, { ch: "秋", color: "#b8860b" }, { ch: "冬", color: "#b8860b" },
  { ch: "梅", color: "#c2185b" }, { ch: "蘭", color: "#c2185b" }, { ch: "菊", color: "#c2185b" }, { ch: "竹", color: "#2e8b57" },
  { ch: "東", color: "#203a63" }, { ch: "南", color: "#203a63" }, { ch: "西", color: "#203a63" }, { ch: "北", color: "#203a63" },
  { ch: "中", color: "#c0392b" }, { ch: "發", color: "#2e8b57" }, { ch: "白", color: "#3b6ea5" },
  { ch: "一", color: "#1b5faa" }, { ch: "九", color: "#c0392b" }, { ch: "五", color: "#2e8b57" },
  { emoji: "🀄" }, { emoji: "🐉" }, { emoji: "🏮" }, { emoji: "✨" },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [muted, setMuted] = useState(false);
  const [mode, setMode] = useState<GameMode>("classic");
  const [showMenu, setShowMenu] = useState(true);
  const [stage, setStage] = useState<"splash" | "register" | "motto" | "menu">("splash");
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  const [player, setPlayer] = useState<Player | null>(() => loadPlayer());
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [formErr, setFormErr] = useState("");
  const [mottoText, setMottoText] = useState("");
  const splashDone = useRef(false);
  const mottoDone = useRef(false);
  const lastMotto = useRef(-1);

  const afterSplash = useCallback(() => {
    if (splashDone.current) return;
    splashDone.current = true;
    setStage(player ? "menu" : "register");
  }, [player]);

  useEffect(() => {
    if (stage !== "splash") return;
    const t = setTimeout(afterSplash, 4200);
    return () => clearTimeout(t);
  }, [stage, afterSplash]);

  const afterMotto = useCallback(() => {
    if (mottoDone.current) return;
    mottoDone.current = true;
    setStage("menu");
    setShowMenu(false);
  }, []);

  useEffect(() => {
    if (stage !== "motto") return;
    const t = setTimeout(afterMotto, 5000);
    return () => clearTimeout(t);
  }, [stage, afterMotto]);

  const submitRegister = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 2) {
      setFormErr("Oyuncu adı en az 2 karakter olmalı.");
      return;
    }
    if (pass.length < 4) {
      setFormErr("Şifre en az 4 karakter olmalı.");
      return;
    }
    const p: Player = { name: n, pass: hashPass(pass) };
    try {
      localStorage.setItem(PLAYER_KEY, JSON.stringify(p));
    } catch {
      // depolama yoksa bile oturum icinde devam et
    }
    setPlayer(p);
    setFormErr("");
    setStage("menu");
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    gameRef.current = game;
    game.onHud = setHud;
    setMuted(game.isMuted());
    game.start();

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (stageRef.current !== "menu") return;
      if (e.key === "n" || e.key === "N") game.newGame();
      else if (e.key === "u" || e.key === "U") game.undo();
      else if (e.key === "l" || e.key === "L") game.nextLevel();
      else if (e.key === "h" || e.key === "H") game.hint();
      else if (e.key === "s" || e.key === "S") game.shuffle();
      else if (e.key === "Escape") setShowMenu(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      (gameRef.current ?? game).stop();
      gameRef.current = null;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const selectMode = (selectedMode: GameMode) => {
    setMode(selectedMode);
    // Oyun durdurulmustu (menu'ye donulduyse) — yeniden olustur
    if (!gameRef.current) {
      const canvas = canvasRef.current;
      if (canvas) {
        const game = new Game(canvas);
        game.onHud = setHud;
        setMuted(game.isMuted());
        game.start();
        gameRef.current = game;
      }
    }
    gameRef.current?.setMode(selectedMode);
    // Rastgele ilham cümlesi (öncekiyle aynı olmasın)
    let idx = Math.floor(Math.random() * QUOTES.length);
    if (QUOTES.length > 1 && idx === lastMotto.current) {
      idx = (idx + 1) % QUOTES.length;
    }
    lastMotto.current = idx;
    setMottoText(QUOTES[idx]);
    mottoDone.current = false;
    setStage("motto");
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
        {stage === "menu" && showMenu && (
          <div className="mode-menu-overlay">
            <div className="menu-fx" aria-hidden="true">
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  className="menu-fx-tile"
                  style={{
                    left: `${(i * 61 + 7) % 100}%`,
                    top: `${(i * 37 + 13) % 100}%`,
                    fontSize: `${26 + (i % 5) * 10}px`,
                    animationDelay: `${((i * 0.53) % 4).toFixed(2)}s`,
                    animationDuration: `${7 + (i % 6)}s`,
                  }}
                >
                  {["🀄", "✨", "🐉", "🏮", "🀅", "⭐", "🀆", "🌀"][i % 8]}
                </span>
              ))}
            </div>
            <div className="mode-title">Kadim Taş</div>
            <div className="mode-subtitle">Eşleştirme</div>
            {player && <div className="menu-player">🀄 Oyuncu: {player.name}</div>}
            <div className="mode-grid">
              {MODES.map((m, i) => (
                <button key={m.id} className="mode-card" style={{ animationDelay: `${(0.06 * i).toFixed(2)}s` }} onClick={() => selectMode(m.id)}>
                  <span className="mode-icon">{m.icon}</span>
                  <span className="mode-name">{m.name}</span>
                  <span className="mode-desc">{m.desc}</span>
                </button>
              ))}
            </div>
            <div className="menu-tip">🀄 İpucu: Aynı şekil + aynı yöndeki iki serbest taşı eşleştir; hazne 4 taşı aşırsa kaybedersin.</div>
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
              <button className="btn" onClick={() => (mode === "classic" ? gameRef.current?.nextLevel() : gameRef.current?.newGame())}>Sonraki Seviye</button>
              <button className="btn ghost" onClick={() => gameRef.current?.newGame()}>Tekrar Oyna</button>
              <button className="btn ghost" onClick={() => goToMenu()}>Mod Değiştir</button>
            </div>
          </div>
        )}
        {stage === "splash" && (
          <div className="splash-overlay" onClick={afterSplash}>
            <div className="splash-figs" aria-hidden="true">
              {SPLASH_FIGS.map((f, i) =>
                f.emoji ? (
                  <span
                    key={i}
                    className="splash-fig"
                    style={{
                      left: `${(i * 53 + 11) % 100}%`,
                      top: `${(i * 37 + 17) % 100}%`,
                      fontSize: `${30 + (i % 5) * 8}px`,
                      animationDelay: `${((i * 0.71) % 5).toFixed(2)}s`,
                      animationDuration: `${7 + (i % 6)}s`,
                    }}
                  >
                    {f.emoji}
                  </span>
                ) : (
                  (() => {
                    const sz = 34 + (i % 4) * 12;
                    return (
                      <span
                        key={i}
                        className="splash-tile"
                        style={{
                          left: `${(i * 41 + 13) % 100}%`,
                          top: `${(i * 53 + 29) % 100}%`,
                          width: `${sz}px`,
                          height: `${Math.round(sz * 1.4)}px`,
                          fontSize: `${Math.round(sz * 0.62)}px`,
                          color: f.color,
                          animationDelay: `${((i * 0.71) % 5).toFixed(2)}s`,
                          animationDuration: `${7 + (i % 6)}s`,
                        }}
                      >
                        {f.ch}
                      </span>
                    );
                  })()
                )
              )}
            </div>
            <div className="splash-title">Kadim Taş</div>
            <div className="splash-sub">Eşleştirme</div>
            <div className="splash-tag">142 taş · 10 mod · kadim figürler</div>
            <div className="splash-hint">Devam için dokun</div>
          </div>
        )}
        {stage === "register" && (
          <div className="register-overlay">
            <div className="register-card">
              <div className="register-title">Oyuncu Oluştur</div>
              <div className="register-sub">Oyuna başlamak için adını ve şifreni belirle.</div>
              <form onSubmit={submitRegister}>
                <label className="register-label" htmlFor="reg-name">Oyuncu Adı</label>
                <input
                  id="reg-name"
                  className="register-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: TasUstasi"
                  maxLength={20}
                  autoComplete="off"
                  autoFocus
                />
                <label className="register-label" htmlFor="reg-pass">Şifre</label>
                <input
                  id="reg-pass"
                  className="register-input"
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="En az 4 karakter"
                  maxLength={40}
                />
                <div className="register-err">{formErr}</div>
                <button className="register-btn" type="submit">Oyuna Başla</button>
              </form>
            </div>
          </div>
        )}
        {stage === "motto" && (
          <div className="motto-overlay" onClick={afterMotto}>
            <div className="motto-mode">🀄 {MODES.find((m) => m.id === mode)?.name}</div>
            <div className="motto-quote">“{mottoText}”</div>
            <div className="motto-bar"><div className="motto-bar-fill" /></div>
            <div className="motto-hint">Oyuna geçmek için dokun</div>
          </div>
        )}
      </div>
    </div>
  );
}
