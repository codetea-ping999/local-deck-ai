import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadTemplate, validateTemplateForPresentation } from "../src/template/template.js";
import type { Presentation } from "../src/schemas/presentation.js";

test("template sidecar may declare a subset of slide layouts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "local-deck-template-"));
  const templatePath = join(dir, "brand.pptx");
  await writeFile(templatePath, "placeholder");
  await writeFile(join(dir, "brand.template.json"), JSON.stringify({ layouts: { title: { templateLayout: 0 }, content: { placeholders: { body: { x: 1, y: 1 } } } } }));

  const template = await loadTemplate(templatePath);
  assert.deepEqual(Object.keys(template.layouts ?? {}).sort(), ["content", "title"]);
  assert.deepEqual(template.layouts?.title?.placeholders, {});

  const presentation: Presentation = { title: "Deck", slides: [{ title: "Intro", layout: "title", bullets: [] }, { title: "Data", layout: "table", bullets: [] }] };
  assert.deepEqual(validateTemplateForPresentation(template, presentation), ['Template layout mapping is missing for "table" (slide 2).']);
});

test("template sidecar rejects unknown slide layouts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "local-deck-template-"));
  const templatePath = join(dir, "brand.pptx");
  await writeFile(templatePath, "placeholder");
  await writeFile(join(dir, "brand.template.json"), JSON.stringify({ layouts: { hero: {} } }));
  await assert.rejects(loadTemplate(templatePath), /Invalid template definition/);
});
