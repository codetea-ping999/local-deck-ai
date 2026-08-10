import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";

export type SourceDocument = {
  path: string;
  name: string;
  kind: "markdown" | "text";
  content: string;
};

const markdownExtensions = new Set([".md", ".markdown", ".mdx"]);
const textExtensions = new Set([".txt", ".text"]);

export async function readDocument(inputPath: string): Promise<SourceDocument> {
  const extension = extname(inputPath).toLowerCase();
  const content = await readFile(inputPath, "utf-8");

  if (markdownExtensions.has(extension)) {
    return {
      path: inputPath,
      name: basename(inputPath),
      kind: "markdown",
      content
    };
  }

  if (textExtensions.has(extension) || extension === "") {
    return {
      path: inputPath,
      name: basename(inputPath),
      kind: "text",
      content
    };
  }

  throw new Error(
    `Unsupported input file type: ${extension}. Currently supported: .md, .markdown, .mdx, .txt`
  );
}
