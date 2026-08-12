import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { autoAdjustPresentation, validatePresentationQuality } from "../src/pipeline/quality.js";
import { createEmbeddingIndex, saveLocalIndex, loadLocalIndex, searchByEmbedding } from "../src/rag/localIndex.js";
import { resolvePresentationCitations } from "../src/rag/citations.js";
import { renderPresentation } from "../src/renderer/export.js";
import { defaultTheme } from "../src/theme/theme.js";

test("quality report identifies hard structure errors and soft density warnings", () => {
  const presentation = { title: "Deck", slides: [{ title: "Dense", layout: "content" as const, bullets: ["1", "2", "3", "4", "5", "6", "7"] }] };
  const report = validatePresentationQuality(presentation);
  assert.equal(report.errors[0]?.code, "TOO_MANY_BULLETS");
  const adjusted = autoAdjustPresentation(presentation);
  assert.equal(adjusted.slides[0]?.layout, "title");
  assert.ok(adjusted.slides.every((slide) => slide.bullets.length <= 6));
});

test("embedding index stores metadata and searches by cosine similarity", async () => {
  const document = { id: "doc-1", path: "manual.pdf", name: "manual.pdf", kind: "pdf" as const, content: "alpha policy\nbeta rollout", segments: [{ text: "alpha policy", pageStart: 3, pageEnd: 3 }, { text: "beta rollout", pageStart: 4, pageEnd: 4 }] };
  const index = await createEmbeddingIndex([document], { model: "nomic-embed-text", client: { async embed({ input }) { return (Array.isArray(input) ? input : [input]).map((value) => value.includes("alpha") ? [1, 0] : [0, 1]); } } });
  assert.equal(index.chunks[0]?.documentId, "doc-1");
  assert.equal(index.chunks[0]?.pageStart, 3);
  assert.equal(searchByEmbedding(index, [1, 0])[0]?.text, "alpha policy");
  const directory = await mkdtemp(join(tmpdir(), "local-deck-ai-index-"));
  const path = join(directory, "index.json");
  await saveLocalIndex(index, path);
  assert.equal((await loadLocalIndex(path)).embeddingModel, "nomic-embed-text");
});

test("citations resolve source IDs and HTML rendering is theme-aware", async () => {
  const presentation = resolvePresentationCitations({ title: "Deck", slides: [{ title: "One", layout: "key-message", bullets: [], keyMessage: "Takeaway", citations: [{ source: "S1" }] }] }, [{ id: "S1", source: "manual.pdf", text: "Takeaway", pageStart: 3 }]);
  assert.equal(presentation.slides[0]?.citations?.[0]?.source, "manual.pdf");
  assert.match(presentation.slides[0]?.speakerNotes ?? "", /manual\.pdf/);
  const directory = await mkdtemp(join(tmpdir(), "local-deck-ai-html-"));
  const path = join(directory, "deck.html");
  await renderPresentation({ presentation, format: "html", outputPath: path, theme: { ...defaultTheme, footer: "Test footer" } });
  assert.ok((await stat(path)).size > 0);
  assert.match(await readFile(path, "utf8"), /Test footer/);
});
