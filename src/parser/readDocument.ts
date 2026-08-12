import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export type DocumentKind = "markdown" | "text" | "pdf" | "docx";
export type SourceDocument = { path: string; name: string; kind: DocumentKind; content: string; bytes?: number };
export type DocumentParser = (bytes: Uint8Array, path: string) => Promise<string>;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export class DocumentError extends Error {
  constructor(message: string, readonly code: "READ_FAILED" | "EMPTY" | "TOO_LARGE" | "UNSUPPORTED" | "PARSE_FAILED") {
    super(message); this.name = "DocumentError";
  }
}

const parsers: Record<string, { kind: DocumentKind; parse: DocumentParser }> = {
  ".md": { kind: "markdown", parse: async (b) => Buffer.from(b).toString("utf8") },
  ".markdown": { kind: "markdown", parse: async (b) => Buffer.from(b).toString("utf8") },
  ".mdx": { kind: "markdown", parse: async (b) => Buffer.from(b).toString("utf8") },
  ".txt": { kind: "text", parse: async (b) => Buffer.from(b).toString("utf8") },
  ".text": { kind: "text", parse: async (b) => Buffer.from(b).toString("utf8") },
  ".pdf": { kind: "pdf", parse: async (b) => { const parser = new PDFParse({ data: Buffer.from(b) }); const result = await parser.getText(); await parser.destroy(); return result.text; } },
  ".docx": { kind: "docx", parse: async (b) => (await mammoth.extractRawText({ buffer: Buffer.from(b) })).value }
};

export async function readDocument(inputPath: string): Promise<SourceDocument> {
  const extension = extname(inputPath).toLowerCase();
  const parser = parsers[extension] ?? (extension === "" ? parsers[".txt"] : undefined);
  if (!parser) throw new DocumentError(`Unsupported input file type: ${extension || "(none)"}. Supported formats: .md, .txt, .pdf, .docx`, "UNSUPPORTED");
  let bytes: Buffer;
  try {
    bytes = await readFile(inputPath);
  } catch (error) {
    throw new DocumentError(`Could not read input document "${inputPath}": ${error instanceof Error ? error.message : String(error)}`, "READ_FAILED");
  }
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new DocumentError(`Input document is too large (${bytes.length} bytes). Maximum is ${MAX_DOCUMENT_BYTES} bytes.`, "TOO_LARGE");
  let content: string;
  try { content = (await parser.parse(bytes, inputPath)).replace(/^\uFEFF/, ""); }
  catch (error) { const code = extension === ".pdf" ? "UNSUPPORTED" : "PARSE_FAILED"; throw new DocumentError(`Could not parse ${extension} document "${inputPath}": ${error instanceof Error ? error.message : String(error)}`, code); }
  if (!content.trim()) throw new DocumentError(`Input document "${inputPath}" is empty after extraction.`, "EMPTY");
  return { path: inputPath, name: basename(inputPath), kind: parser.kind, content, bytes: bytes.length };
}

export type DocumentChunk = { index: number; text: string; start: number; end: number };
export function chunkDocument(content: string, maxCharacters = 12_000, overlap = 400): DocumentChunk[] {
  if (maxCharacters < 500 || overlap < 0 || overlap >= maxCharacters) throw new Error("maxCharacters must be >= 500 and overlap must be smaller");
  const chunks: DocumentChunk[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(content.length, start + maxCharacters);
    if (end < content.length) { const boundary = content.lastIndexOf("\n", end); if (boundary > start + maxCharacters * 0.6) end = boundary; }
    chunks.push({ index: chunks.length, text: content.slice(start, end).trim(), start, end });
    if (end >= content.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}
