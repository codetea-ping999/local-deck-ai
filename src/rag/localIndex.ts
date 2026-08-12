import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { chunkDocumentSegments, type SourceDocument } from "../parser/readDocument.js";
import type { EmbedClient } from "../llm/ollama.js";

export type IndexedChunk = {
  id: string;
  documentId?: string;
  source: string;
  chunkId?: string;
  text: string;
  pageStart?: number;
  pageEnd?: number;
  embedding?: number[];
  embeddingModel?: string;
  terms: Record<string, number>;
};
export type SearchHit = {
  id?: string;
  documentId?: string;
  chunkId?: string;
  source: string;
  text: string;
  score: number;
  pageStart?: number;
  pageEnd?: number;
};
export type LocalIndex = { version: 1 | 2; embeddingModel?: string; dimensions?: number; chunks: IndexedChunk[] };
export type EmbeddingIndexOptions = { client: EmbedClient; model: string; chunkSize?: number; overlap?: number };

const tokenize = (text: string) => text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1);

export function createLocalIndex(documents: Array<{ source: string; content: string }>, chunkSize = 1_200): LocalIndex {
  const chunks: IndexedChunk[] = [];
  for (const document of documents) {
    const sourceId = document.source;
    for (let start = 0, n = 0; start < document.content.length; start += chunkSize, n += 1) {
      const text = document.content.slice(start, start + chunkSize);
      chunks.push(makeChunk({ documentId: sourceId, source: document.source, chunkId: String(n), text }));
    }
  }
  return { version: 1, chunks };
}

export async function createEmbeddingIndex(documents: SourceDocument[], options: EmbeddingIndexOptions): Promise<LocalIndex> {
  if (!options.model.trim()) throw new Error("Embedding model must not be empty.");
  const pending = documents.flatMap((document) => chunkDocumentSegments(document, options.chunkSize ?? 1_200, options.overlap ?? 120).map((chunk) => ({ document, chunk })));
  if (pending.length === 0) throw new Error("Cannot create an index from empty documents.");
  const embeddings = await options.client.embed({ model: options.model, input: pending.map(({ chunk }) => chunk.text) });
  if (embeddings.length !== pending.length) throw new Error(`Embedding count mismatch: expected ${pending.length}, received ${embeddings.length}.`);
  const dimensions = embeddings[0]?.length ?? 0;
  if (dimensions === 0) throw new Error("Embedding response contained an empty vector.");
  if (embeddings.some((embedding) => embedding.length !== dimensions)) throw new Error("Embedding dimension mismatch in response.");

  const chunks = pending.map(({ document, chunk }, index) => makeChunk({
    documentId: document.id ?? document.name,
    source: document.name,
    chunkId: String(chunk.index),
    text: chunk.text,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    embedding: embeddings[index],
    embeddingModel: options.model
  }));
  return { version: 2, embeddingModel: options.model, dimensions, chunks };
}

export function searchLocalIndex(index: LocalIndex, query: string, limit?: number): SearchHit[];
export function searchLocalIndex(index: LocalIndex, query: string, client: EmbedClient, limit?: number): Promise<SearchHit[]>;
export function searchLocalIndex(index: LocalIndex, query: string, limitOrClient: number | EmbedClient = 5, maybeLimit = 5): SearchHit[] | Promise<SearchHit[]> {
  if (typeof limitOrClient === "number") return keywordSearch(index, query, limitOrClient);
  return searchEmbeddingIndex(index, query, limitOrClient, maybeLimit);
}

export async function searchEmbeddingIndex(index: LocalIndex, query: string, client: EmbedClient, topK = 5): Promise<SearchHit[]> {
  const queryEmbedding = (await client.embed({ model: index.embeddingModel ?? "nomic-embed-text", input: query }))[0];
  if (!queryEmbedding || queryEmbedding.length === 0) throw new Error("Query embedding is empty.");
  return searchByEmbedding(index, queryEmbedding, topK);
}

export function searchByEmbedding(index: LocalIndex, queryEmbedding: number[], topK = 5): SearchHit[] {
  if (queryEmbedding.length === 0) throw new Error("Query embedding is empty.");
  const dimensions = index.dimensions ?? index.chunks.find((chunk) => chunk.embedding)?.embedding?.length;
  if (dimensions !== undefined && queryEmbedding.length !== dimensions) throw new Error(`Embedding dimension mismatch: expected ${dimensions}, received ${queryEmbedding.length}.`);
  return index.chunks
    .filter((chunk): chunk is IndexedChunk & { embedding: number[] } => Array.isArray(chunk.embedding) && chunk.embedding.length === queryEmbedding.length)
    .map((chunk) => ({ ...toHit(chunk), score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, topK));
}

export function buildRetrievalContext(hits: SearchHit[]): string {
  return hits.map((hit, index) => `[S${index + 1}] source=${hit.source}${hit.pageStart ? ` page=${hit.pageStart}${hit.pageEnd && hit.pageEnd !== hit.pageStart ? `-${hit.pageEnd}` : ""}` : ""}\n${hit.text}`).join("\n\n");
}

export async function saveLocalIndex(index: LocalIndex, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(index, null, 2) + "\n", "utf8");
}

export async function loadLocalIndex(path: string): Promise<LocalIndex> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { chunks?: unknown }).chunks)) throw new Error(`Invalid local index: ${path}`);
  const raw = parsed as { version?: unknown; embeddingModel?: unknown; dimensions?: unknown; chunks: unknown[] };
  const chunks = raw.chunks.map((value, index) => {
    if (!value || typeof value !== "object") throw new Error(`Invalid local index chunk at ${index}.`);
    const chunk = value as Partial<IndexedChunk>;
    if (typeof chunk.source !== "string" || typeof chunk.text !== "string") throw new Error(`Invalid local index chunk at ${index}.`);
    return makeChunk({
      id: typeof chunk.id === "string" ? chunk.id : undefined,
      documentId: typeof chunk.documentId === "string" ? chunk.documentId : chunk.source,
      source: chunk.source,
      chunkId: typeof chunk.chunkId === "string" ? chunk.chunkId : String(index),
      text: chunk.text,
      pageStart: typeof chunk.pageStart === "number" ? chunk.pageStart : undefined,
      pageEnd: typeof chunk.pageEnd === "number" ? chunk.pageEnd : undefined,
      embedding: Array.isArray(chunk.embedding) ? chunk.embedding.filter((component): component is number => typeof component === "number") : undefined,
      embeddingModel: typeof chunk.embeddingModel === "string" ? chunk.embeddingModel : undefined,
      terms: chunk.terms
    });
  });
  return { version: raw.version === 1 ? 1 : 2, embeddingModel: typeof raw.embeddingModel === "string" ? raw.embeddingModel : undefined, dimensions: typeof raw.dimensions === "number" ? raw.dimensions : chunks.find((chunk) => chunk.embedding)?.embedding?.length, chunks };
}

function keywordSearch(index: LocalIndex, query: string, limit: number): SearchHit[] {
  const terms = new Set(tokenize(query));
  return index.chunks.map((chunk) => ({ ...toHit(chunk), score: [...terms].reduce((sum, term) => sum + (chunk.terms[term] ?? 0), 0) })).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(0, limit));
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    aMagnitude += left * left;
    bMagnitude += right * right;
  }
  return aMagnitude === 0 || bMagnitude === 0 ? 0 : dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

function makeChunk(input: {
  id?: string;
  documentId: string;
  source: string;
  chunkId: string;
  text: string;
  pageStart?: number;
  pageEnd?: number;
  embedding?: number[];
  embeddingModel?: string;
  terms?: Record<string, number>;
}): IndexedChunk {
  const terms = input.terms ?? {};
  if (!input.terms) for (const term of tokenize(input.text)) terms[term] = (terms[term] ?? 0) + 1;
  return { id: input.id ?? `${input.source}:${input.chunkId}`, documentId: input.documentId, source: input.source, chunkId: input.chunkId, text: input.text, ...(input.pageStart === undefined ? {} : { pageStart: input.pageStart }), ...(input.pageEnd === undefined ? {} : { pageEnd: input.pageEnd }), ...(input.embedding ? { embedding: input.embedding } : {}), ...(input.embeddingModel ? { embeddingModel: input.embeddingModel } : {}), terms };
}

function toHit(chunk: IndexedChunk): SearchHit {
  return { id: chunk.id, documentId: chunk.documentId, chunkId: chunk.chunkId, source: chunk.source, text: chunk.text, ...(chunk.pageStart === undefined ? {} : { pageStart: chunk.pageStart }), ...(chunk.pageEnd === undefined ? {} : { pageEnd: chunk.pageEnd }), score: 0 };
}
