import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";

export type IndexedChunk = { id: string; source: string; text: string; terms: Record<string, number> };
export type SearchHit = { source: string; text: string; score: number };
export type LocalIndex = { version: 1; chunks: IndexedChunk[] };
const tokenize = (text: string) => text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1);
export function createLocalIndex(documents: Array<{ source: string; content: string }>, chunkSize = 1200): LocalIndex {
  const chunks: IndexedChunk[] = []; for (const document of documents) for (let start = 0, n = 0; start < document.content.length; start += chunkSize, n += 1) { const text = document.content.slice(start, start + chunkSize); const terms: Record<string, number> = {}; for (const term of tokenize(text)) terms[term] = (terms[term] ?? 0) + 1; chunks.push({ id: `${document.source}:${n}`, source: document.source, text, terms }); }
  return { version: 1, chunks };
}
export function searchLocalIndex(index: LocalIndex, query: string, limit = 5): SearchHit[] { const terms = new Set(tokenize(query)); return index.chunks.map((chunk) => ({ source: chunk.source, text: chunk.text, score: [...terms].reduce((sum, term) => sum + (chunk.terms[term] ?? 0), 0) })).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, limit); }
export async function saveLocalIndex(index: LocalIndex, path: string): Promise<void> { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(index, null, 2), "utf8"); }
export async function loadLocalIndex(path: string): Promise<LocalIndex> { return JSON.parse(await readFile(path, "utf8")) as LocalIndex; }
