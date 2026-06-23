import { useState, useCallback } from "react";

const buildPrompt = (usedWords) =>
  `You are generating content for a drawing guessing game.

Pick ONE common, visually drawable noun. Avoid these already-used words: [${usedWords.join(", ") || "none"}].

Then describe how to draw it using only basic SVG shapes on a 400×300 canvas (viewBox "0 0 400 300"). Centre the drawing — keep all coordinates inside the canvas.

Allowed shape types (use EXACTLY these keys):
  { "type": "circle",  "cx": n, "cy": n, "r": n,             "order": n }
  { "type": "ellipse", "cx": n, "cy": n, "rx": n, "ry": n,   "order": n }
  { "type": "polygon", "points": "x1,y1 x2,y2 x3,y3 …",     "order": n }
  { "type": "line",    "x1": n, "y1": n, "x2": n, "y2": n,  "order": n }

Rules:
- 6–9 shapes total
- order 1 = most recognisable part shown first; order N = fine detail revealed last
- No fill is applied — outlines only — so make shapes large and clear
- Shapes must not overlap so much that later ones are invisible

Reply with ONLY valid JSON — no markdown, no explanation:
{
  "secretWord": "word",
  "acceptableGuesses": ["word", "synonym1", "synonym2"],
  "category": "animals|objects|food|nature",
  "shapes": [...]
}`;

export function useApiGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  const generateWord = useCallback(async (apiKey, usedWords = []) => {
    setIsGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [{ role: "user", content: buildPrompt(usedWords) }],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      const text = data.content[0].text.trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in response");
      const parsed = JSON.parse(match[0]);
      if (!parsed.secretWord || !Array.isArray(parsed.shapes) || parsed.shapes.length === 0) {
        throw new Error("Invalid word data from API");
      }
      return parsed;
    } catch (err) {
      setGenError(err.message);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return { generateWord, isGenerating, genError };
}
