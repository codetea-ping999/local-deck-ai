import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { OllamaClient, OllamaError } from "../src/llm/ollama.js";
import { renderPresentationToPptx } from "../src/renderer/pptx.js";

test("OllamaClient disables thinking for structured presentation output", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ response: "{}" }), { status: 200 });
    };
    await new OllamaClient().generate({ model: "m", prompt: "p" });
    assert.equal(body?.format, "json");
    assert.equal(body?.think, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OllamaClient classifies connection, timeout, HTTP, and malformed responses", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("offline"); };
    await assert.rejects(new OllamaClient("http://example.test").generate({ model: "m", prompt: "p" }), (error: unknown) => error instanceof OllamaError && error.message.includes("接続できません"));

    globalThis.fetch = async () => new Response("model missing", { status: 404, statusText: "Not Found" });
    await assert.rejects(new OllamaClient().generate({ model: "m", prompt: "p" }), (error: unknown) => error instanceof OllamaError && error.status === 404 && error.hint?.includes("ollama pull m"));

    globalThis.fetch = async () => new Response("bad", { status: 200 });
    await assert.rejects(new OllamaClient().generate({ model: "m", prompt: "p" }), (error: unknown) => error instanceof OllamaError && error.message.includes("invalid JSON"));

    globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    await assert.rejects(new OllamaClient("http://example.test", 1).generate({ model: "m", prompt: "p" }), (error: unknown) => error instanceof OllamaError && error.message.includes("タイムアウト") && error.hint?.includes("--timeout"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("renderPresentationToPptx writes a non-empty PowerPoint file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "local-deck-ai-pptx-"));
  const output = join(directory, "deck.pptx");
  await renderPresentationToPptx({ title: "Deck", slides: [{ title: "One", layout: "content", bullets: ["A"] }] }, output);
  const outputStat = await stat(output);
  assert.ok(outputStat.size > 0);
  assert.equal(output.endsWith(".pptx"), true);
});
