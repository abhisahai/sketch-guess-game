# Sketch Guess Game

A browser-based Pictionary-style AI game — the AI draws a sketch shape by shape, you guess the word. Built as a portfolio piece to demonstrate AI-product thinking: cost-conscious architecture, in-browser ML inference, and zero ongoing API costs.

**[Play it live →](https://abhisahai.github.io/sketch-guess-game/)**

---

## What it does

- The AI progressively reveals SVG shapes every 4 seconds, like Pictionary in reverse
- Type your guess at any point — the earlier you guess correctly, the higher your score (max 10 points per round)
- Guesses are matched using **semantic AI similarity** running entirely in your browser, with fuzzy string matching as a fallback
- Session score accumulates across rounds; your all-time high score is saved in your browser

---

## Architecture & cost decisions

This project was deliberately designed around one constraint: **zero ongoing API cost**, while still telling a compelling AI story.

### 1. Static word bank (default mode)

The word bank (`src/wordBank.json`) is a pre-generated JSON file of 25 words, each with a set of SVG shape descriptors. It was generated **once** using Claude Haiku via `scripts/generate-word-bank.js`, manually reviewed, and committed to the repo. At runtime, the game reads this static file — no API calls, no per-user cost, works offline.

```
Cost to generate entire word bank: ~$0.01 (one-time)
Cost per game session:              $0.00
```

### 2. In-browser semantic matching (Transformers.js)

Guesses are checked using [`all-MiniLM-L6-v2`](https://huggingface.co/Xenova/all-MiniLM-L6-v2) — a sentence embedding model that runs fully in the browser via WebAssembly (via [`@huggingface/transformers`](https://github.com/xenova/transformers.js)). Cosine similarity threshold: 0.62.

- No server, no API key, no per-request cost
- Falls back to Levenshtein fuzzy matching while the model loads (~21 MB WASM bundle, cached after first visit)
- Accepts synonyms and near-matches ("puppy" for "dog", "kitty" for "cat")

### 3. Live AI mode (opt-in, user's own key)

Users can optionally enter their own Anthropic API key via the 🔑 button in the UI. When active, each round calls Claude Haiku directly from the browser to generate a **fresh word + shapes** on the fly. The key is stored only in the user's browser (`localStorage`) and sent exclusively to Anthropic's API — never to any third-party server.

```
Cost to the user per round:    ~$0.0003 (Claude Haiku)
Cost to the developer:          $0.00
```

### 4. Drawings are structured shape data, not images

Each word entry is a JSON array of basic SVG primitives (`circle`, `ellipse`, `polygon`, `line`) with an `order` field controlling the reveal sequence. This was chosen over real image generation to keep costs near-zero and rendering trivial — plain SVG, no canvas or image handling needed.

---

## Running locally

```bash
npm install
npm run dev
```

## Deploying

```bash
# Update source on GitHub
git add . && git commit -m "your message" && git push

# Deploy to GitHub Pages (live site)
npm run deploy
```

## Regenerating the word bank

Requires an Anthropic API key. Generates SVG shapes for all 25 words using Claude Haiku:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run generate
```

Review `src/wordBank.json` after running — AI-generated coordinates occasionally need manual correction.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | React 19 + Vite 8 | Fast dev, trivial GitHub Pages deploy |
| Semantic matching | Transformers.js (WASM) | Zero server cost, runs fully in-browser |
| Shape generation | Claude Haiku (one-time) | Cheapest capable model, ~$0.01 total |
| Live AI mode | Claude Haiku (user's key) | Cost stays with the user, not the developer |
| Hosting | GitHub Pages | Free, no infra to manage |
| Score persistence | localStorage | No backend needed |

---

## Project structure

```
src/
  App.jsx               # Main game component (all logic + inline styles)
  wordBank.json         # Pre-generated word bank (25 words, committed)
  useSemanticMatch.js   # Transformers.js semantic matching hook
  useApiGeneration.js   # Runtime Anthropic API generation hook (user's key)
scripts/
  generate-word-bank.js # One-time offline word bank generation script
```

---

## License

MIT — see [LICENSE](./LICENSE)

---

Conceived & developed by [Abhinav Sahai](https://www.linkedin.com/in/absahai/)
