import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJsonObject } from "../src/utils/json.js";
import { PresentationSchema } from "../src/schemas/presentation.js";

test("extractJsonObject handles plain, fenced, prose-wrapped, and nested JSON", () => {
  const expected = { title: "Deck", slides: [{ title: "One", bullets: ["A"] }] };
  assert.deepEqual(extractJsonObject(JSON.stringify(expected)), expected);
  assert.deepEqual(extractJsonObject(`\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``), expected);
  assert.deepEqual(extractJsonObject(`Here is the result:\n${JSON.stringify(expected)}\nDone.`), expected);
});

test("extractJsonObject rejects invalid or missing JSON", () => {
  assert.throws(() => extractJsonObject("not json"), /No valid JSON object/);
  assert.throws(() => extractJsonObject("{ invalid"), /No valid JSON object/);
});

test("PresentationSchema enforces required fields and layout values", () => {
  assert.equal(PresentationSchema.safeParse({ title: "Deck", slides: [{ title: "One" }] }).success, true);
  assert.equal(PresentationSchema.safeParse({ title: "", slides: [{ title: "One" }] }).success, false);
  assert.equal(PresentationSchema.safeParse({ title: "Deck", slides: [] }).success, false);
  assert.equal(PresentationSchema.safeParse({ title: "Deck", slides: [{ title: "One", layout: "unknown" }] }).success, false);
  assert.equal(PresentationSchema.safeParse({ title: "Deck", slides: Array.from({ length: 41 }, () => ({ title: "One" })) }).success, false);
  assert.equal(PresentationSchema.safeParse({ title: "Deck", slides: [{ title: "One", bullets: [""] }] }).success, false);
});
