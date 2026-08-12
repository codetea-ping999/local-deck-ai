import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalIndex, searchLocalIndex } from "../src/rag/localIndex.js";
import { defaultTheme, validateTheme } from "../src/theme/theme.js";

test("local index returns source-grounded hits", () => {
  const index = createLocalIndex([{ source: "a.md", content: "private local models" }, { source: "b.md", content: "cloud deployment" }]);
  assert.equal(searchLocalIndex(index, "private models")[0]?.source, "a.md");
});
test("theme validation catches invalid colors", () => { assert.deepEqual(validateTheme(defaultTheme), []); assert.ok(validateTheme({ ...defaultTheme, colors: { ...defaultTheme.colors, accent: "blue" } }).length > 0); });
