import assert from "node:assert/strict";
import { test } from "node:test";
import { formatJsonParseError, parseJson } from "../public/utils.js";

test("formatJsonParseError highlights the failing position when available", () => {
  const message = formatJsonParseError("abcdef", new SyntaxError("Unexpected token x in JSON at position 3"), "JSON");
  assert.match(message, /JSONを読み込めません/);
  assert.match(message, /周辺: abc⟦d⟧ef/);
});

test("parseJson wraps syntax errors with the supplied label", () => {
  assert.throws(
    () => parseJson('{"slides":[{"title":"One"} {"title":"Two"}]}', "Presentation JSON"),
    (error: unknown) => error instanceof Error && error.message.includes("Presentation JSONを読み込めません")
  );
});
