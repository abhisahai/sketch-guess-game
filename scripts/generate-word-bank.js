/**
 * Run once to generate SVG shapes for all 25 words using Claude Haiku.
 * Output is written to src/wordBank.json — commit that file; never run this at runtime.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-word-bank.js
 */

import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const WORDS = [
  // Animals
  { word: "cat",       guesses: ["cat", "kitten", "kitty"],                    category: "animals" },
  { word: "dog",       guesses: ["dog", "puppy", "pup", "doggy"],              category: "animals" },
  { word: "fish",      guesses: ["fish", "fishy"],                              category: "animals" },
  { word: "rabbit",    guesses: ["rabbit", "bunny", "hare"],                   category: "animals" },
  { word: "elephant",  guesses: ["elephant", "elefant", "ele"],                category: "animals" },
  { word: "bird",      guesses: ["bird", "birdie", "chick", "sparrow"],        category: "animals" },
  { word: "snake",     guesses: ["snake", "serpent", "viper"],                 category: "animals" },
  { word: "turtle",    guesses: ["turtle", "tortoise"],                        category: "animals" },
  { word: "lion",      guesses: ["lion", "lioness", "cub"],                    category: "animals" },
  { word: "penguin",   guesses: ["penguin"],                                   category: "animals" },
  { word: "frog",      guesses: ["frog", "toad", "froggy"],                   category: "animals" },
  { word: "butterfly", guesses: ["butterfly", "moth"],                         category: "animals" },
  // Objects
  { word: "sun",       guesses: ["sun", "sunshine"],                           category: "objects" },
  { word: "house",     guesses: ["house", "home", "cottage", "hut"],           category: "objects" },
  { word: "tree",      guesses: ["tree", "plant"],                             category: "objects" },
  { word: "car",       guesses: ["car", "automobile", "vehicle", "auto"],      category: "objects" },
  { word: "bicycle",   guesses: ["bicycle", "bike", "cycle"],                  category: "objects" },
  { word: "boat",      guesses: ["boat", "ship", "sailboat"],                  category: "objects" },
  { word: "airplane",  guesses: ["airplane", "aeroplane", "plane", "jet"],     category: "objects" },
  { word: "star",      guesses: ["star"],                                      category: "objects" },
  { word: "flower",    guesses: ["flower", "rose", "daisy", "blossom"],        category: "objects" },
  { word: "pizza",     guesses: ["pizza", "pie"],                              category: "objects" },
  { word: "umbrella",  guesses: ["umbrella", "brolly", "parasol"],             category: "objects" },
  { word: "rocket",    guesses: ["rocket", "spaceship", "spacecraft"],         category: "objects" },
  { word: "mushroom",  guesses: ["mushroom", "toadstool", "fungus"],           category: "objects" },
];

const SHAPE_PROMPT = (word) => `Draw a simple recognisable sketch of a "${word}" using only basic SVG shapes.

Canvas: 400 wide × 300 tall (viewBox "0 0 400 300"). Centre the drawing — keep all coordinates inside the canvas.

Allowed shape types (use EXACTLY these keys):
  { "type": "circle",  "cx": n, "cy": n, "r": n,             "order": n }
  { "type": "ellipse", "cx": n, "cy": n, "rx": n, "ry": n,   "order": n }
  { "type": "polygon", "points": "x1,y1 x2,y2 x3,y3 …",     "order": n }
  { "type": "line",    "x1": n, "y1": n, "x2": n, "y2": n,  "order": n }

Rules:
- 6–9 shapes total
- order 1 = most distinctive part shown first; order N = fine detail revealed last
- No fill is applied — outlines only — so make shapes large and clear
- Shapes must not overlap so much that later ones are invisible

Reply with ONLY a valid JSON array. No markdown, no explanation.`;

async function generateShapes(entry) {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: SHAPE_PROMPT(entry.word) }],
  });

  const text = msg.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array for "${entry.word}": ${text.slice(0, 120)}`);
  return JSON.parse(match[0]);
}

async function main() {
  const wordBank = [];
  let ok = 0;
  let fail = 0;

  for (const entry of WORDS) {
    process.stdout.write(`  ${entry.word.padEnd(12)}`);
    try {
      const shapes = await generateShapes(entry);
      wordBank.push({
        secretWord: entry.word,
        acceptableGuesses: entry.guesses,
        category: entry.category,
        shapes,
      });
      ok++;
      console.log(`✓  (${shapes.length} shapes)`);
    } catch (err) {
      fail++;
      console.log(`✗  ${err.message}`);
    }
    // Respect rate limits
    await new Promise((r) => setTimeout(r, 400));
  }

  writeFileSync(
    new URL("../src/wordBank.json", import.meta.url),
    JSON.stringify(wordBank, null, 2)
  );
  console.log(`\nDone — ${ok} generated, ${fail} failed → src/wordBank.json`);
}

main().catch((err) => { console.error(err); process.exit(1); });
