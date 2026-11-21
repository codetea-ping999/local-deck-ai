import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

type PackageLock = {
  packages?: Record<string, { version?: string; dependencies?: Record<string, string> }>;
};

async function readLock(): Promise<Record<string, { version?: string; dependencies?: Record<string, string> }>> {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8")) as PackageLock;
  return lock.packages ?? {};
}

function atLeast(version: string | undefined, minimum: string): boolean {
  assert.ok(version, "package is missing from package-lock.json");
  const actual = version.split(".").map(Number);
  const floor = minimum.split(".").map(Number);
  for (let index = 0; index < floor.length; index += 1) {
    if ((actual[index] ?? 0) !== floor[index]) return (actual[index] ?? 0) > floor[index];
  }
  return true;
}

test("PPTX renderer dependency graph excludes vulnerable image-size", async () => {
  const packages = await readLock();

  assert.equal(packages["node_modules/image-size"], undefined);
  assert.equal(packages["node_modules/pptxgenjs"]?.dependencies?.["image-size"], undefined);
});

test("production dependencies resolve past known high-severity advisories", async () => {
  const packages = await readLock();

  // GHSA-mrhx-c7xc-m3w5: zod < 4.6.6 can exhaust memory on oversized constrained collections.
  assert.ok(atLeast(packages["node_modules/zod"]?.version, "4.6.6"), `zod ${packages["node_modules/zod"]?.version} is vulnerable`);
  // GHSA-6gmq-8vp8-gcm6 and related: @xmldom/xmldom <= 0.8.14 (mammoth DOCX parsing path).
  assert.ok(atLeast(packages["node_modules/@xmldom/xmldom"]?.version, "0.8.15"), `@xmldom/xmldom ${packages["node_modules/@xmldom/xmldom"]?.version} is vulnerable`);
});
