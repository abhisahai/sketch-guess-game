# Project context: Sketch-Guess Game

## What this is
A browser-based game where the "AI" draws a simple sketch (rendered as SVG shapes,
not real image generation) and the player guesses the word. Shapes reveal
progressively over time, like Pictionary in reverse. Built primarily as a
portfolio piece to demonstrate AI-product thinking, not just raw coding —
cost-consciousness and architecture decisions matter as much as the game itself.

## Why it's built this way (don't second-guess these without asking)

- **No live API calls during gameplay.** The original idea was to call an LLM
  every round to generate a fresh word + drawing, but that was deliberately
  rejected for cost reasons. Instead, the plan is a **pre-built word bank**:
  call the API once (or a few times), generate ~50-100 word+shapes entries,
  manually review them, and save as a static JSON/JS file. Runtime gameplay
  reads from that static bank with zero ongoing API cost.
- **Drawings are structured shape data, not images.** Each word entry is JSON
  describing a small list of basic SVG primitives (circle, line, polygon,
  ellipse) with an `order` field controlling reveal sequence. This was chosen
  over real image generation specifically to keep cost near-zero and rendering
  trivial (plain SVG, no canvas/image handling).
- **Reveal is gentle, not punitive.** Running out of hints does NOT show a
  "you lost" framing — it calmly reveals the answer ("Here's what it was...
  that one was tricky, give the next a go"). This was an explicit design
  choice, not an oversight — don't reintroduce lose/fail language.
- **Fuzzy guess matching.** Guesses are matched against the secret word using
  Levenshtein distance (small typo tolerance that scales with word length),
  not exact string match. Very short words (≤3 chars) require exact matches
  to avoid false positives.

## Current state of the code

- `src/App.jsx` contains the full single-round game component (originally
  named `SketchGuess`). It currently has ONE hardcoded demo word ("cat")
  defined inline as `DEMO_WORD` — this is a placeholder, not final content.
- Auto-reveal timer: a new shape reveals every 4 seconds
  (`REVEAL_INTERVAL_MS = 4000`), shown via a countdown progress bar.
- Aesthetic: "sketchbook" theme — cream paper background with a subtle grid,
  graphite-colored ink strokes, a coral accent color, Caveat (handwritten-style)
  font for headers paired with Inter for UI/body text. New shapes animate in
  with a hand-drawn stroke-dasharray reveal effect. Keep this visual direction
  consistent in any new UI added later.
- Scoring: fewer hints used = higher score (max 10, -2 per extra shape shown).

## What's NOT built yet (likely next steps)
1. The actual word bank generation script (one-time use of the Anthropic API
   to generate ~50-100 word+shape JSON entries across a few categories, with
   manual review afterward since AI-generated shape coordinates can come out
   visually wrong).
2. Multi-round flow / running score across rounds (currently single-round only
   by deliberate scope decision — may expand later).
3. A polished README explaining the architecture/cost-tradeoff reasoning for
   portfolio purposes.

## Deployment setup (already working, don't break it)
- Vite + React project, deployed via `gh-pages` package to GitHub Pages.
- `vite.config.js` has `base: '/sketch-guess-game/'` — required for GitHub
  Pages subpath routing, don't remove.
- `package.json` has a `"deploy": "vite build && gh-pages -d dist"` script.
- Workflow: edit → test with `npm run dev` → `git add . && git commit && git push`
  (updates source on `main`) → `npm run deploy` (updates the live site via the
  `gh-pages` branch). These are two separate steps — pushing to main does NOT
  automatically update the live site.
- Live at: https://abhisahai.github.io/sketch-guess-game/

## Known quirks
- The Guess button previously appeared not to submit in Claude's own artifact
  preview environment specifically — turned out to be an environment quirk,
  not a real bug (confirmed working fine in actual browsers). An `onClick`
  fallback was added to the submit button alongside the form's `onSubmit` as
  defensive redundancy; no need to remove it.
