import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "../src/cli/index.js";
import { generatePresentation } from "../src/pipeline/generatePresentation.js";
import type { SourceDocument } from "../src/parser/readDocument.js";

const document: SourceDocument = { path: "input.md", name: "input.md", kind: "markdown", content: "# Source" };

test("parseArgs validates supported CLI options", () => {
  const options = parseArgs(["generate", "input.md", "--model", "demo", "--timeout", "900", "--slides", "4", "--output", "out.pptx"]);
  assert.equal(options.command, "generate");
  assert.equal(options.input, "input.md");
  assert.equal(options.model, "demo");
  assert.equal(options.timeout, 900);
  assert.equal(options.slides, 4);
  assert.equal(options.output, "out.pptx");
  assert.throws(() => parseArgs(["generate", "input.md", "--slides", "0"]), /between 1 and 40/);
  assert.throws(() => parseArgs(["generate", "input.md", "--timeout", "4"]), /between 5 and 3600/);
  assert.throws(() => parseArgs(["generate", "input.md", "--unknown"]), /Unknown option/);
});

test("generatePresentation injects a mock client and retries invalid JSON once", async () => {
  let calls = 0;
  const progress: string[] = [];
  const presentation = await generatePresentation({
    document,
    model: "mock",
    targetSlideCount: 1,
    client: {
      async generate() {
        calls += 1;
        return calls === 1 ? "not json" : JSON.stringify({ title: "Deck", slides: [{ title: "One" }] });
      }
    },
    onProgress: (message) => progress.push(message)
  });
  assert.equal(calls, 2);
  assert.equal(presentation.title, "Deck");
  assert.ok(progress.includes("JSON形式で再生成しています"));
});

test("generatePresentation reports both JSON failures and never retries more than once", async () => {
  let calls = 0;
  await assert.rejects(
    generatePresentation({
      document,
      model: "mock",
      targetSlideCount: 1,
      client: { async generate() { calls += 1; return "not json"; } }
    }),
    (error: unknown) => error instanceof Error && error.message.includes("Initial JSON parse failed") && error.message.includes("Retry JSON parse failed")
  );
  assert.equal(calls, 2);
});
