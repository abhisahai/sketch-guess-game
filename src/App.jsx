import React, { useState, useEffect, useRef, useCallback } from "react";
import WORD_BANK from "./wordBank.json";
import { useSemanticMatch } from "./useSemanticMatch";

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
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
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
  const inputRef = useRef(null);
  const { modelStatus, isSemanticMatch } = useSemanticMatch();

  const word = WORD_BANK[wordIndex];
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
        setStatus("won");
        setFeedback({ type: "won", text: `Got it — it was "${word.secretWord}"!` });
      } else {
        setWrongGuesses((prev) => [...prev, guess.trim()]);
        setFeedback({ type: "wrong", text: "Not quite — keep looking." });
        setTimeout(() => setFeedback(null), 1400);
      }
      setGuess("");
    },
    [guess, status, word, isSemanticMatch]
  );

  const score =
    status === "won" ? Math.max(10 - (revealedCount - 1) * 2, 1) : 0;

  const restart = () => {
    setWordIndex((i) => {
      let next;
      do { next = Math.floor(Math.random() * WORD_BANK.length); } while (next === i && WORD_BANK.length > 1);
      return next;
    });
    setRevealedCount(1);
    setGuess("");
    setStatus("playing");
    setFeedback(null);
    setTimeLeft(REVEAL_INTERVAL_MS / 1000);
    setWrongGuesses([]);
  };

  const progressPct = ((REVEAL_INTERVAL_MS / 1000 - timeLeft) / (REVEAL_INTERVAL_MS / 1000)) * 100;

  return (
    <div className="page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Inter:wght@400;500;600&display=swap');

        * { box-sizing: border-box; }

        .page {
          min-height: 100vh;
          width: 100%;
          background: #FAF7F0;
          background-image:
            linear-gradient(#EDE8DC 1px, transparent 1px),
            linear-gradient(90deg, #EDE8DC 1px, transparent 1px);
          background-size: 28px 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
          padding: 24px;
        }

        .card {
          width: 100%;
          max-width: 440px;
          background: #FFFDF8;
          border: 1.5px solid #2B2B2E;
          border-radius: 4px;
          box-shadow: 6px 6px 0 rgba(43,43,46,0.08);
          padding: 28px 28px 32px;
        }

        .eyebrow {
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #9A958C;
          font-weight: 600;
          margin: 0 0 4px;
        }

        .title {
          font-family: 'Caveat', cursive;
          font-size: 40px;
          font-weight: 700;
          color: #2B2B2E;
          margin: 0 0 18px;
          line-height: 1;
        }

        .canvas-wrap {
          background: #FAF7F0;
          border: 1.5px dashed #D9D3C6;
          border-radius: 4px;
          padding: 8px;
          margin-bottom: 16px;
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
        }

        .timer-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }

        .timer-label {
          font-size: 12px;
          color: #9A958C;
          font-weight: 500;
          white-space: nowrap;
          min-width: 88px;
        }

        .timer-track {
          flex: 1;
          height: 6px;
          background: #EDE8DC;
          border-radius: 3px;
          overflow: hidden;
        }

        .timer-fill {
          height: 100%;
          background: #E2603A;
          transition: width 1s linear;
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
          border: 1.5px solid #2B2B2E;
          border-radius: 4px;
          background: #FFFDF8;
          color: #2B2B2E;
          outline: none;
        }

        .guess-input:focus {
          outline: 2px solid #E2603A;
          outline-offset: 1px;
        }

        .guess-input::placeholder { color: #B8B2A4; }

        .submit-btn {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14px;
          padding: 11px 18px;
          background: #2B2B2E;
          color: #FAF7F0;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .submit-btn:hover { background: #3F3F44; }
        .submit-btn:disabled { background: #C9C4B7; cursor: not-allowed; }

        .feedback {
          font-size: 13px;
          font-weight: 500;
          margin: 0 0 10px;
          min-height: 18px;
        }

        .feedback.wrong { color: #C45B3A; }
        .feedback.won { color: #5C7251; }

        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #9A958C;
        }

        .result-box {
          text-align: center;
          padding: 6px 0 4px;
        }

        .result-word {
          font-family: 'Caveat', cursive;
          font-size: 34px;
          color: #2B2B2E;
          margin: 4px 0 6px;
        }

        .result-sub {
          font-size: 13px;
          color: #7A8B6F;
          margin-bottom: 16px;
        }

        .restart-btn {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14px;
          padding: 10px 20px;
          background: #E2603A;
          color: #FFFDF8;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .restart-btn:hover { background: #CC5430; }

        .wrong-list {
          font-size: 12px;
          color: #B8B2A4;
          margin-top: 8px;
          word-break: break-word;
        }
      `}</style>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <p className="eyebrow" style={{ margin: 0 }}>Category · {word.category}</p>
          <span style={{
            fontSize: 10, fontFamily: "Inter, sans-serif", fontWeight: 600,
            letterSpacing: "0.08em", textTransform: "uppercase",
            padding: "2px 7px", borderRadius: 99,
            background: modelStatus === "ready" ? "#D4F0D4" : modelStatus === "error" ? "#F5E0DC" : "#EDE8DC",
            color: modelStatus === "ready" ? "#2A6B2A" : modelStatus === "error" ? "#8B2A1A" : "#7A7368",
          }}>
            {modelStatus === "ready" ? "AI guess on" : modelStatus === "error" ? "AI unavailable" : "AI loading…"}
          </span>
        </div>
        <h1 className="title">What am I drawing?</h1>

        <div className="canvas-wrap">
          <svg viewBox="0 0 400 300" width="100%" height="auto">
            {visibleShapes.map((shape, i) => (
              <ShapeSVGElement
                key={`${shape.type}-${i}`}
                shape={shape}
                isNew={shape.order === latestOrder}
              />
            ))}
          </svg>
        </div>

        {status === "playing" && (
          <>
            <div className="timer-row">
              <span className="timer-label">Next hint in {timeLeft}s</span>
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
              <button className="submit-btn" type="submit" disabled={!guess.trim()}>
                Guess
              </button>
            </form>

            <p className={`feedback ${feedback?.type || ""}`}>
              {feedback?.text || "\u00A0"}
            </p>

            <div className="meta-row">
              <span>Shapes shown: {revealedCount} / {MAX_HINTS}</span>
              <span>Wrong guesses: {wrongGuesses.length}</span>
            </div>
          </>
        )}

        {status === "won" && (
          <div className="result-box">
            <p className="result-sub">You got it — the word was</p>
            <p className="result-word">{word.secretWord}</p>
            <p className="result-sub">Score: {score} / 10</p>
            <button className="restart-btn" onClick={restart}>
              Draw another
            </button>
          </div>
        )}

        {status === "revealed" && (
          <div className="result-box">
            <p className="result-sub">Here's what it was</p>
            <p className="result-word">{word.secretWord}</p>
            <p className="result-sub">That one was tricky — give the next a go</p>
            <button className="restart-btn" onClick={restart}>
              Draw another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
