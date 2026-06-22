import { useState, useEffect, useRef } from "react";

// Singleton promise — model loads once and is reused across re-renders
let pipelinePromise = null;

function loadPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = import("@huggingface/transformers").then(({ pipeline }) =>
      pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" })
    );
  }
  return pipelinePromise;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embed(pipe, text) {
  const out = await pipe(text.trim().toLowerCase(), { pooling: "mean", normalize: true });
  return Array.from(out.data);
}

// threshold: 0.62 catches synonyms ("canine" → "dog") while rejecting unrelated words
const SEMANTIC_THRESHOLD = 0.62;

export function useSemanticMatch() {
  const [modelStatus, setModelStatus] = useState("loading"); // loading | ready | error
  const pipeRef = useRef(null);

  useEffect(() => {
    loadPipeline()
      .then((pipe) => {
        pipeRef.current = pipe;
        setModelStatus("ready");
      })
      .catch(() => setModelStatus("error"));
  }, []);

  async function isSemanticMatch(guess, targets) {
    if (!pipeRef.current) return null; // model not ready — caller should fallback

    const embeddings = await Promise.all(
      [guess, ...targets].map((t) => embed(pipeRef.current, t))
    );
    const [guessEmb, ...targetEmbs] = embeddings;
    const best = Math.max(...targetEmbs.map((t) => cosine(guessEmb, t)));
    return best >= SEMANTIC_THRESHOLD;
  }

  return { modelStatus, isSemanticMatch };
}
