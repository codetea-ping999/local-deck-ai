import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGenerateRequest } from "../src/gui/server.js";

test("GUI request validation accepts a valid request", () => {
  const request = validateGenerateRequest({ content: "# Source", model: "qwen3:8b", slides: 8, output: "C:\\temp\\deck.pptx" });
  assert.equal(request.model, "qwen3:8b");
  assert.equal(request.slides, 8);
});

test("GUI request validation rejects malformed, oversized-range, and relative output values", () => {
  assert.throws(() => validateGenerateRequest(null), /JSONオブジェクト/);
  assert.throws(() => validateGenerateRequest({ model: "m" }), /文書内容/);
  assert.throws(() => validateGenerateRequest({ content: "x" }), /モデル/);
  assert.throws(() => validateGenerateRequest({ content: "x", model: "m", slides: 41 }), /1から40/);
  assert.throws(() => validateGenerateRequest({ content: "x", model: "m", output: "relative.pptx" }), /絶対パス/);
});
