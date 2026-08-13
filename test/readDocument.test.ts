import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DocumentError, MAX_DOCUMENT_BYTES, readDocument } from "../src/parser/readDocument.js";

async function tempFile(name: string, content: string | Uint8Array): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "local-deck-ai-"));
  const path = join(directory, name);
  await writeFile(path, content);
  return path;
}

test("readDocument supports markdown and text extensions", async () => {
  for (const extension of ["md", "markdown", "mdx", "txt", "text", ""]) {
    const path = await tempFile(`source${extension ? `.${extension}` : ""}`, "# Hello");
    const document = await readDocument(path);
    assert.equal(document.content, "# Hello");
    assert.ok(["markdown", "text"].includes(document.kind));
  }
});

test("readDocument strips a UTF-8 BOM", async () => {
  const path = await tempFile("bom.md", Buffer.from([0xef, 0xbb, 0xbf, 0x23, 0x20, 0x48]));
  assert.equal((await readDocument(path)).content, "# H");
});

test("readDocument rejects empty, unsupported, missing, and oversized files", async () => {
  const empty = await tempFile("empty.md", " \n");
  await assert.rejects(readDocument(empty), (error: unknown) => error instanceof DocumentError && error.code === "EMPTY");

  const unsupported = await tempFile("source.pdf", "content");
  await assert.rejects(readDocument(unsupported), (error: unknown) => error instanceof DocumentError && error.code === "PARSE_FAILED");

  await assert.rejects(readDocument("does-not-exist.md"), (error: unknown) =>
    error instanceof DocumentError && error.code === "READ_FAILED" && error.message.includes("does-not-exist.md")
  );

  const oversized = await tempFile("large.md", Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 65));
  await assert.rejects(readDocument(oversized), (error: unknown) => error instanceof DocumentError && error.code === "TOO_LARGE");
});
