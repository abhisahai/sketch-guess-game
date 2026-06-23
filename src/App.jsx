import React, { useState, useEffect, useRef, useCallback } from "react";
import WORD_BANK from "./wordBank.json";
import { useSemanticMatch } from "./useSemanticMatch";
import { useApiGeneration } from "./useApiGeneration";

const REVEAL_INTERVAL_MS = 4000;

function normalize(str) {
  return str.trim().toLowerCase();
}

// Levenshtein distance for fuzzy matching (handles typos)
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

// Allows small typos; tolerance scales gently with word length
function isFuzzyMatch(guess, target) {
  const g = normalize(guess);
  const t = normalize(target);
  if (g === t) return true;
  const maxLen = Math.max(g.length, t.length);
  if (maxLen <= 3) return false; // too short for fuzzy slack, require exact
  const distance = levenshtein(g, t);
  const tolerance = maxLen <= 5 ? 1 : maxLen <= 8 ? 2 : 3;
  return distance <= tolerance;
}

function ShapeSVGElement({ shape, isNew }) {
  const common = {
    stroke: "#2B2B2E",
    strokeWidth: 4,
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: isNew ? "stroke-draw" : "",
  };

  if (shape.type === "circle") {
    return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...common} />;
  }
  if (shape.type === "polygon") {
    return <polygon points={shape.points} {...common} />;
  }
  if (shape.type === "line") {
    return (
      <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...common} />
    );
  }
  if (shape.type === "ellipse") {
    return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...common} />;
  }
  return null;
}

export default function SketchGuess() {
  const [wordIndex, setWordIndex] = useState(() => Math.floor(Math.random() * WORD_BANK.length));
  const [revealedCount, setRevealedCount] = useState(1);
  const [guess, setGuess] = useState("");
  const [status, setStatus] = useState("playing"); // playing | won | revealed
  const [feedback, setFeedback] = useState(null); // {type, text}
  const [timeLeft, setTimeLeft] = useState(REVEAL_INTERVAL_MS / 1000);
  const [wrongGuesses, setWrongGuesses] = useState([]);
  const [sessionScore, setSessionScore] = useState(0);
  const [highScore, setHighScore] = useState(
    () => parseInt(localStorage.getItem("sketchGuessHighScore") || "0", 10)
  );
  const [newRecord, setNewRecord] = useState(false);
  // Live-AI mode
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("sketchGuessApiKey") || "");
  const [liveMode, setLiveMode] = useState(() => !!localStorage.getItem("sketchGuessApiKey"));
  const [showSettings, setShowSettings] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [generatedWord, setGeneratedWord] = useState(null);
  const [usedWords, setUsedWords] = useState([]);
  const inputRef = useRef(null);
  const { modelStatus, isSemanticMatch } = useSemanticMatch();
  const { generateWord, genError } = useApiGeneration();

  const word = (liveMode && generatedWord) ? generatedWord : WORD_BANK[wordIndex];
  const MAX_HINTS = word.shapes.length;
  const visibleShapes = word.shapes.filter((s) => s.order <= revealedCount);
  const latestOrder = revealedCount;

  // Auto-reveal timer
  useEffect(() => {
    if (status !== "playing") return;
    if (revealedCount >= MAX_HINTS) {
      setStatus("revealed");
      return;
    }

    const tick = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) return REVEAL_INTERVAL_MS / 1000;
        return t - 1;
      });
    }, 1000);

    const reveal = setTimeout(() => {
      setRevealedCount((c) => Math.min(c + 1, MAX_HINTS));
      setTimeLeft(REVEAL_INTERVAL_MS / 1000);
    }, REVEAL_INTERVAL_MS);

    return () => {
      clearInterval(tick);
      clearTimeout(reveal);
    };
  }, [revealedCount, status]);

  useEffect(() => {
    if (status === "playing" && inputRef.current) inputRef.current.focus();
  }, [status, revealedCount]);

  const handleGuess = useCallback(
    async (e) => {
      e.preventDefault();
      if (!guess.trim() || status !== "playing") return;

      // Try semantic AI match first; fall back to fuzzy string match if model isn't ready
      const semanticResult = await isSemanticMatch(guess, word.acceptableGuesses);
      const isCorrect =
        semanticResult !== null
          ? semanticResult
          : word.acceptableGuesses.some((g) => isFuzzyMatch(guess, g));

      if (isCorrect) {
        const roundScore = Math.max(10 - (revealedCount - 1) * 2, 1);
        setSessionScore((prev) => {
          const newTotal = prev + roundScore;
          setHighScore((best) => {
            if (newTotal > best) {
              localStorage.setItem("sketchGuessHighScore", String(newTotal));
              setNewRecord(true);
              return newTotal;
            }
            return best;
          });
          return newTotal;
        });
        setStatus("won");
        setFeedback({ type: "won", text: `Got it — it was "${word.secretWord}"!` });
      } else {
        setWrongGuesses((prev) => [...prev, guess.trim()]);
        setFeedback({ type: "wrong", text: "Not quite — keep looking." });
        setTimeout(() => setFeedback(null), 1400);
      }
      setGuess("");
    },
    [guess, status, word, isSemanticMatch, revealedCount]
  );

  const score =
    status === "won" ? Math.max(10 - (revealedCount - 1) * 2, 1) : 0;

  const pickStaticWord = () => {
    setWordIndex((i) => {
      let next;
      do { next = Math.floor(Math.random() * WORD_BANK.length); } while (next === i && WORD_BANK.length > 1);
      return next;
    });
  };

  const restart = async () => {
    setRevealedCount(1);
    setGuess("");
    setFeedback(null);
    setTimeLeft(REVEAL_INTERVAL_MS / 1000);
    setWrongGuesses([]);
    setNewRecord(false);

    if (liveMode && apiKey) {
      setStatus("generating");
      const newWord = await generateWord(apiKey, usedWords);
      if (newWord) {
        setGeneratedWord(newWord);
        setUsedWords((prev) => [...prev, newWord.secretWord]);
      } else {
        // Generation failed — fall back to static word bank silently
        pickStaticWord();
      }
      setStatus("playing");
    } else {
      pickStaticWord();
      setStatus("playing");
    }
  };

  const handleSaveKey = () => {
    const key = keyDraft.trim();
    if (!key) return;
    localStorage.setItem("sketchGuessApiKey", key);
    setApiKey(key);
    setLiveMode(true);
    setKeyDraft("");
    setShowSettings(false);
  };

  const handleClearKey = () => {
    localStorage.removeItem("sketchGuessApiKey");
    setApiKey("");
    setLiveMode(false);
    setGeneratedWord(null);
    setUsedWords([]);
  };

  const progressPct = ((REVEAL_INTERVAL_MS / 1000 - timeLeft) / (REVEAL_INTERVAL_MS / 1000)) * 100;

  return (
    <div className="page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }

        .page {
          min-height: 100vh;
          width: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .page-deco {
          position: fixed;
          font-size: 36px;
          opacity: 0.18;
          pointer-events: none;
          user-select: none;
          animation: float 6s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-12px) rotate(8deg); }
        }

        .card {
          width: 100%;
          max-width: 480px;
          background: #FFFFFF;
          border: 3px solid #2D1B69;
          border-radius: 20px;
          box-shadow: 6px 6px 0 #FFD93D, 12px 12px 0 #FF6B6B;
          padding: 28px 28px 32px;
          position: relative;
          z-index: 1;
        }

        .eyebrow {
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #764ba2;
          font-weight: 700;
          margin: 0 0 4px;
        }

        .title {
          font-family: 'Caveat', cursive;
          font-size: 42px;
          font-weight: 700;
          background: linear-gradient(90deg, #6C63FF, #FF6B9D);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 18px;
          line-height: 1.1;
        }

        .canvas-outer {
          position: relative;
          margin-bottom: 16px;
          padding: 14px;
        }

        .canvas-deco {
          position: absolute;
          font-size: 24px;
          line-height: 1;
          pointer-events: none;
          user-select: none;
          animation: float 5s ease-in-out infinite;
        }

        .canvas-deco.tl { top: -4px; left: -4px; animation-delay: 0s; }
        .canvas-deco.tr { top: -4px; right: -4px; animation-delay: 1.2s; }
        .canvas-deco.bl { bottom: -4px; left: -4px; animation-delay: 2.4s; }
        .canvas-deco.br { bottom: -4px; right: -4px; animation-delay: 0.8s; }

        .canvas-wrap {
          background: #FAFAFA;
          border: 3px dashed #6C63FF;
          border-radius: 12px;
          padding: 8px;
        }

        .stroke-draw {
          stroke-dasharray: 600;
          stroke-dashoffset: 600;
          animation: draw 0.9s ease-out forwards;
        }

        @keyframes draw {
          to { stroke-dashoffset: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .stroke-draw { animation: none; stroke-dashoffset: 0; }
          .page-deco, .canvas-deco { animation: none; }
        }

        .timer-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }

        .timer-label {
          font-size: 12px;
          color: #636e72;
          font-weight: 600;
          white-space: nowrap;
          min-width: 104px;
        }

        .timer-track {
          flex: 1;
          height: 8px;
          background: #E8E0FF;
          border-radius: 4px;
          overflow: hidden;
        }

        .timer-fill {
          height: 100%;
          background: linear-gradient(90deg, #6C63FF, #FF6B9D);
          transition: width 1s linear;
          border-radius: 4px;
        }

        form.guess-form {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }

        .guess-input {
          flex: 1;
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          padding: 11px 14px;
          border: 2px solid #DFE6E9;
          border-radius: 10px;
          background: #FFFFFF;
          color: #2D3436;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .guess-input:focus {
          border-color: #6C63FF;
          box-shadow: 0 0 0 3px rgba(108,99,255,0.15);
        }

        .guess-input::placeholder { color: #B2BEC3; }

        .submit-btn {
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: 14px;
          padding: 11px 20px;
          background: linear-gradient(135deg, #6C63FF, #9C59FF);
          color: #FFFFFF;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.1s;
          box-shadow: 0 4px 12px rgba(108,99,255,0.4);
        }

        .submit-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(108,99,255,0.5);
        }

        .submit-btn:active { transform: translateY(0); }

        .submit-btn:disabled {
          background: #B2BEC3;
          box-shadow: none;
          cursor: not-allowed;
          transform: none;
        }

        .feedback {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 10px;
          min-height: 20px;
        }

        .feedback.wrong { color: #FF6B6B; }
        .feedback.won { color: #00B894; }

        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #636e72;
          font-weight: 500;
        }

        .result-box {
          text-align: center;
          padding: 8px 0 4px;
        }

        .result-emoji {
          font-size: 52px;
          display: block;
          margin-bottom: 6px;
        }

        .result-word {
          font-family: 'Caveat', cursive;
          font-size: 40px;
          font-weight: 700;
          background: linear-gradient(90deg, #6C63FF, #FF6B9D);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 4px 0 4px;
          display: block;
        }

        .result-sub {
          font-size: 14px;
          color: #636e72;
          margin-bottom: 8px;
        }

        .score-badge {
          display: inline-block;
          font-family: 'Caveat', cursive;
          font-size: 26px;
          font-weight: 700;
          color: #2D1B69;
          background: #FFD93D;
          padding: 3px 18px;
          border-radius: 99px;
          border: 2px solid #2D1B69;
          margin-bottom: 18px;
        }

        .restart-btn {
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: 14px;
          padding: 12px 28px;
          background: linear-gradient(135deg, #FF6B6B, #FF9F43);
          color: #FFFFFF;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.1s;
          box-shadow: 0 4px 12px rgba(255,107,107,0.4);
        }

        .restart-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(255,107,107,0.5);
        }

        .restart-btn:active { transform: translateY(0); }

        .wrong-list {
          font-size: 12px;
          color: #B2BEC3;
          margin-top: 8px;
          word-break: break-word;
        }

        .footer {
          margin-top: 12px;
          text-align: center;
          font-size: 12px;
          color: rgba(255,255,255,0.6);
          font-family: 'Inter', sans-serif;
          letter-spacing: 0.03em;
        }

        .footer a {
          color: rgba(255,255,255,0.85);
          font-weight: 600;
          text-decoration: none;
          border-bottom: 1px solid rgba(255,255,255,0.35);
          transition: color 0.15s, border-color 0.15s;
        }

        .footer a:hover {
          color: #FFD93D;
          border-color: #FFD93D;
        }

        .header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
          gap: 8px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }

        .settings-toggle {
          background: none;
          border: 2px solid #C8B8FF;
          border-radius: 8px;
          padding: 4px 8px;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          color: #764ba2;
          transition: background 0.15s;
          flex-shrink: 0;
        }

        .settings-toggle:hover { background: #F0EAFF; }
        .settings-toggle.active { background: #E8E0FF; border-color: #6C63FF; }

        .live-badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 99px;
          background: linear-gradient(135deg, #6C63FF, #FF6B9D);
          color: #fff;
          flex-shrink: 0;
        }

        .settings-panel {
          background: #F8F5FF;
          border: 2px solid #C8B8FF;
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 14px;
        }

        .settings-info {
          font-size: 12px;
          color: #636e72;
          margin: 0 0 10px;
          line-height: 1.5;
        }

        .key-input-row {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }

        .key-input {
          flex: 1;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          padding: 8px 11px;
          border: 2px solid #C8B8FF;
          border-radius: 8px;
          background: #fff;
          color: #2D3436;
          outline: none;
        }

        .key-input:focus { border-color: #6C63FF; }
        .key-input::placeholder { color: #B2BEC3; }

        .key-save-btn {
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: 13px;
          padding: 8px 14px;
          background: linear-gradient(135deg, #6C63FF, #9C59FF);
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }

        .key-save-btn:disabled { background: #B2BEC3; cursor: not-allowed; }

        .key-active-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
        }

        .key-active-label { color: #00854D; font-weight: 600; }

        .key-clear-btn {
          font-size: 12px;
          font-weight: 600;
          color: #FF6B6B;
          background: none;
          border: 1px solid #FF6B6B;
          border-radius: 6px;
          padding: 3px 8px;
          cursor: pointer;
        }

        .key-error {
          font-size: 12px;
          color: #FF6B6B;
          margin-top: 6px;
        }

        .generating-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 40px 0;
          color: #764ba2;
        }

        .generating-spinner {
          font-size: 36px;
          animation: spin 2s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .generating-label {
          font-family: 'Caveat', cursive;
          font-size: 22px;
          font-weight: 700;
          color: #6C63FF;
        }

        .scoreboard {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
          padding: 10px 14px;
          background: linear-gradient(135deg, #E8E0FF 0%, #FFE0F0 100%);
          border-radius: 12px;
          border: 2px solid #C8B8FF;
        }

        .score-item {
          flex: 1;
          text-align: center;
        }

        .score-divider {
          width: 1px;
          background: #C8B8FF;
          align-self: stretch;
          margin: 2px 0;
        }

        .score-label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #764ba2;
          margin-bottom: 1px;
        }

        .score-value {
          font-family: 'Caveat', cursive;
          font-size: 26px;
          font-weight: 700;
          color: #2D1B69;
          line-height: 1.1;
        }

        .score-item.best .score-value {
          color: #FF6B6B;
        }

        .new-record-banner {
          font-family: 'Caveat', cursive;
          font-size: 20px;
          font-weight: 700;
          color: #FF6B6B;
          background: #FFF0F3;
          border: 2px solid #FF6B6B;
          border-radius: 8px;
          padding: 4px 14px;
          display: inline-block;
          margin-bottom: 8px;
          animation: pulse 0.6s ease-in-out 2;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>

      {/* Floating background decorations */}
      <span className="page-deco" style={{ top: "7%",  left: "4%",   animationDelay: "0s"   }}>✏️</span>
      <span className="page-deco" style={{ top: "14%", right: "5%",  animationDelay: "1s"   }}>🎨</span>
      <span className="page-deco" style={{ top: "42%", left: "2%",   animationDelay: "2s"   }}>🖌️</span>
      <span className="page-deco" style={{ top: "58%", right: "3%",  animationDelay: "0.5s" }}>❓</span>
      <span className="page-deco" style={{ top: "72%", left: "6%",   animationDelay: "1.5s" }}>⭐</span>
      <span className="page-deco" style={{ top: "82%", right: "6%",  animationDelay: "2.5s" }}>💡</span>
      <span className="page-deco" style={{ top: "28%", left: "7%",   animationDelay: "3s"   }}>👀</span>
      <span className="page-deco" style={{ top: "90%", left: "18%",  animationDelay: "1.8s" }}>🎯</span>
      <span className="page-deco" style={{ top: "6%",  right: "20%", animationDelay: "0.7s" }}>🏆</span>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 480, zIndex: 1 }}>
      <div className="card" style={{ zIndex: "auto" }}>
        <div className="header-row">
          <div className="header-left">
            <p className="eyebrow" style={{ margin: 0 }}>🏷️ {status !== "generating" ? word.category : "…"}</p>
            {liveMode && <span className="live-badge">⚡ Live AI</span>}
          </div>
          <span style={{
            fontSize: 11, fontFamily: "Inter, sans-serif", fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
            padding: "3px 9px", borderRadius: 99, flexShrink: 0,
            background: modelStatus === "ready" ? "#D4F0D4" : modelStatus === "error" ? "#FFE0DC" : "#E8E0FF",
            color: modelStatus === "ready" ? "#00854D" : modelStatus === "error" ? "#CC3300" : "#764ba2",
          }}>
            {modelStatus === "ready" ? "🤖 AI on" : modelStatus === "error" ? "⚠️ AI off" : "⏳ AI loading…"}
          </span>
          <button
            className={`settings-toggle${showSettings ? " active" : ""}`}
            onClick={() => setShowSettings((v) => !v)}
            title="API key settings"
          >
            🔑
          </button>
        </div>

        {showSettings && (
          <div className="settings-panel">
            <p className="settings-info">
              Enter your Anthropic API key to generate a fresh word every round.
              Your key is stored only in your browser and sent directly to Anthropic — never to any other server.
            </p>
            {!apiKey ? (
              <div className="key-input-row">
                <input
                  className="key-input"
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                />
                <button className="key-save-btn" onClick={handleSaveKey} disabled={!keyDraft.trim()}>
                  Save
                </button>
              </div>
            ) : (
              <div className="key-active-row">
                <span className="key-active-label">✅ Live AI active — fresh words every round</span>
                <button className="key-clear-btn" onClick={handleClearKey}>Remove key</button>
              </div>
            )}
            {genError && <p className="key-error">⚠️ {genError} — falling back to word bank</p>}
          </div>
        )}

        <h1 className="title">🎨 What am I drawing?</h1>

        <div className="scoreboard">
          <div className="score-item">
            <span className="score-label">Session</span>
            <span className="score-value">{sessionScore} pts</span>
          </div>
          <div className="score-divider" />
          <div className="score-item best">
            <span className="score-label">🏆 Best ever</span>
            <span className="score-value">{highScore} pts</span>
          </div>
        </div>

        {/* Canvas with corner decorations */}
        <div className="canvas-outer">
          <span className="canvas-deco tl">✏️</span>
          <span className="canvas-deco tr">💡</span>
          <span className="canvas-deco bl">🤔</span>
          <span className="canvas-deco br">⭐</span>
          <div className="canvas-wrap">
            {status === "generating" ? (
              <div className="generating-state">
                <span className="generating-spinner">✨</span>
                <span className="generating-label">AI is thinking up something to draw…</span>
              </div>
            ) : (
              <svg viewBox="0 0 400 300" width="100%" height="auto">
                {visibleShapes.map((shape, i) => (
                  <ShapeSVGElement
                    key={`${shape.type}-${i}`}
                    shape={shape}
                    isNew={shape.order === latestOrder}
                  />
                ))}
              </svg>
            )}
          </div>
        </div>

        {status === "playing" && (
          <>
            <div className="timer-row">
              <span className="timer-label">⏱️ Next hint in {timeLeft}s</span>
              <div className="timer-track">
                <div className="timer-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            <form className="guess-form" onSubmit={handleGuess}>
              <input
                ref={inputRef}
                className="guess-input"
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Type your guess..."
                autoComplete="off"
              />
              <button className="submit-btn" type="submit" disabled={!guess.trim()} onClick={handleGuess}>
                Guess!
              </button>
            </form>

            <p className={`feedback ${feedback?.type || ""}`}>
              {feedback?.type === "wrong" ? "❌ " : ""}{feedback?.text || " "}
            </p>

            <div className="meta-row">
              <span>🔍 Shapes shown: {revealedCount} / {MAX_HINTS}</span>
              <span>❌ Wrong: {wrongGuesses.length}</span>
            </div>
          </>
        )}

        {status === "won" && (
          <div className="result-box">
            <span className="result-emoji">{newRecord ? "🎊" : "🎉"}</span>
            {newRecord && <div className="new-record-banner">🌟 New High Score!</div>}
            <p className="result-sub">You got it — the word was</p>
            <span className="result-word">{word.secretWord}</span>
            <p className="result-sub" style={{ marginTop: 8 }}>Round score</p>
            <div className="score-badge">⭐ {score} / 10</div>
            <br />
            <button className="restart-btn" onClick={restart}>
              🎨 Draw another!
            </button>
          </div>
        )}

        {status === "revealed" && (
          <div className="result-box">
            <span className="result-emoji">🙈</span>
            <p className="result-sub">Here's what it was</p>
            <span className="result-word">{word.secretWord}</span>
            <p className="result-sub" style={{ marginTop: 8 }}>That one was tricky — give the next a go!</p>
            <button className="restart-btn" onClick={restart}>
              🎨 Draw another!
            </button>
          </div>
        )}
      </div>

      <footer className="footer">
        Conceived &amp; developed by{" "}
        <a href="https://www.linkedin.com/in/absahai/" target="_blank" rel="noopener noreferrer">
          Abhinav Sahai
        </a>
      </footer>
      </div>
    </div>
  );
}
