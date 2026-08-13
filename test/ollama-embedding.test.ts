import assert from "node:assert/strict";
import { test } from "node:test";
import { OllamaClient } from "../src/llm/ollama.js";

test("Ollama embed prefers /api/embed and falls back to legacy embeddings", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const calls: string[] = [];
    globalThis.fetch = async (input) => { calls.push(String(input)); return new Response(JSON.stringify({ embeddings: [[1, 0], [0, 1]] }), { status: 200, headers: { "content-type": "application/json" } }); };
    assert.deepEqual(await new OllamaClient().embed({ model: "nomic-embed-text", input: ["a", "b"] }), [[1, 0], [0, 1]]);
    assert.match(calls[0] ?? "", /\/api\/embed$/);

    calls.length = 0;
    globalThis.fetch = async (input) => { calls.push(String(input)); return calls.length === 1 ? new Response("missing", { status: 404 }) : new Response(JSON.stringify({ embedding: [1, 2] }), { status: 200, headers: { "content-type": "application/json" } }); };
    assert.deepEqual(await new OllamaClient().embed({ model: "nomic-embed-text", input: ["a", "b"] }), [[1, 2], [1, 2]]);
    assert.equal(calls.filter((call) => call.includes("/api/embeddings")).length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
