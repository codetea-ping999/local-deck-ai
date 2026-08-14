import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

type PackageLock = {
  packages?: Record<string, { dependencies?: Record<string, string> }>;
};

test("PPTX renderer dependency graph excludes vulnerable image-size", async () => {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8")) as PackageLock;
  const packages = lock.packages ?? {};

  assert.equal(packages["node_modules/image-size"], undefined);
  assert.equal(packages["node_modules/pptxgenjs"]?.dependencies?.["image-size"], undefined);
});
