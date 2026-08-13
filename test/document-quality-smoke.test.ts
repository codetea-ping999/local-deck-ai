import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chunkDocument } from "../src/parser/readDocument.js";
import { generatePresentation } from "../src/pipeline/generatePresentation.js";
import { renderPresentationToPptx } from "../src/renderer/pptx.js";
import { presentationToHtml } from "../src/gui/workflow.js";

test("long sources are chunked with overlap", () => {
  const chunks = chunkDocument("a".repeat(2_000), 700, 100);
  assert.ok(chunks.length > 2); assert.ok(chunks[1]!.start < chunks[0]!.end);
});

test("sample markdown can generate a deterministic mock deck and PPTX without Ollama", async () => {
  const source = "# Local training\n\nUse local models. Keep data private.";
  const deck = await generatePresentation({ document: { path: "sample.md", name: "sample.md", kind: "markdown", content: source }, model: "mock", targetSlideCount: 2, client: { async generate() { return JSON.stringify({ title: "Local training", sourceSummary: source, slides: [{ title: "Local training", layout: "title", bullets: [], speakerNotes: "Source: sample.md" }, { title: "Key point", layout: "key-message", keyMessage: "Keep data private", bullets: ["Keep data private"] }] }); } } });
  assert.match(deck.sourceSummary ?? "", /local models/);
  const directory = await mkdtemp(join(tmpdir(), "local-deck-ai-smoke-")); const output = join(directory, "sample.pptx"); await renderPresentationToPptx(deck, output); assert.ok((await stat(output)).size > 0); assert.match(presentationToHtml(deck), /Keep data private/);
});
