#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OllamaClient, OllamaError } from "../llm/ollama.js";
import { readDocument, type SourceDocument } from "../parser/readDocument.js";
import { generatePresentation } from "../pipeline/generatePresentation.js";
import { renderPresentationToPptx } from "../renderer/pptx.js";
import { renderPresentation } from "../renderer/export.js";
import { startGuiServer } from "../gui/server.js";
import { loadTheme } from "../theme/theme.js";
import { importPresentationJson } from "../gui/workflow.js";
import { createEmbeddingIndex, buildRetrievalContext, loadLocalIndex, saveLocalIndex, searchEmbeddingIndex } from "../rag/localIndex.js";
import { loadTemplate } from "../template/template.js";

export type CliOptions = {
  command?: string;
  input?: string;
  inputs: string[];
  query?: string;
  model: string;
  embeddingModel: string;
  output: string;
  host: string;
  slides: number;
  topK: number;
  port: number;
  format: "pptx" | "html" | "pdf";
  index?: string;
  theme?: string;
  template?: string;
  strictQuality: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "gui") { startGuiServer(options.port); return; }
  if (options.command === "models") {
    const models = await new OllamaClient(options.host).listModels();
    if (models.length === 0) console.log("モデルが見つかりません。ollama pull <model> で追加してください。"); else models.forEach((model) => console.log(model.name));
    return;
  }
  if (options.command === "index") { await indexDocuments(options); return; }
  if (options.command === "search") { await searchDocuments(options); return; }
  if (options.command === "render") { await renderJson(options); return; }
  if (options.command !== "generate" || (!options.input && !options.index)) { printHelp(); process.exit(options.command ? 1 : 0); }

  const client = new OllamaClient(options.host);
  let document: SourceDocument;
  let retrievalContext: string | undefined;
  let retrievedSources: Array<{ id: string; source: string; text: string; pageStart?: number; pageEnd?: number }> | undefined;
  if (options.index) {
    if (!options.query?.trim()) throw new Error("generate --index requires --query <text>.");
    const index = await loadLocalIndex(resolve(options.index));
    const hits = await searchEmbeddingIndex(index, options.query, client, options.topK);
    retrievalContext = buildRetrievalContext(hits);
    retrievedSources = hits.map((hit, index) => ({ id: `S${index + 1}`, source: hit.source, text: hit.text, pageStart: hit.pageStart, pageEnd: hit.pageEnd }));
    document = { path: resolve(options.index), name: "Retrieved context", kind: "text", content: options.query };
    console.log(`• Retrieved ${hits.length} source chunks from: ${resolve(options.index)}`);
  } else {
    const inputPath = resolve(options.input as string);
    console.log(`• Loading document: ${inputPath}`);
    document = await readDocument(inputPath);
  }

  console.log(`• Generating deck with Ollama model: ${options.model}`);
  const presentation = await generatePresentation({ document, client, model: options.model, targetSlideCount: options.slides, strictQuality: options.strictQuality, retrievalContext, retrievedSources, onProgress: (message, percent) => console.log(`  [${percent}%] ${message}`) });
  const outputPath = resolve(options.output);
  const theme = await loadTheme(options.theme);
  const template = options.template ? await loadTemplate(resolve(options.template)) : undefined;
  if (options.format === "pptx") {
    console.log(`• Rendering ${presentation.slides.length} slides to: ${outputPath}`);
    await renderPresentationToPptx(presentation, outputPath, (message, percent) => console.log(`  [${percent}%] ${message}`), theme, template);
  } else {
    console.log(`• Rendering ${presentation.slides.length} slides as ${options.format}: ${outputPath}`);
    await renderPresentation({ presentation, format: options.format, outputPath, theme, template, onProgress: (message, percent) => console.log(`  [${percent}%] ${message}`) });
  }
  console.log("✓ Done");
}

async function indexDocuments(options: CliOptions): Promise<void> {
  if (options.inputs.length === 0) throw new Error("index requires one or more input files.");
  const documents = await Promise.all(options.inputs.map((input) => readDocument(resolve(input))));
  console.log(`• Embedding ${documents.length} documents with ${options.embeddingModel}`);
  const index = await createEmbeddingIndex(documents, { client: new OllamaClient(options.host), model: options.embeddingModel });
  const path = resolve(options.index ?? ".local-deck/index.json");
  await saveLocalIndex(index, path);
  console.log(`✓ Index saved: ${path} (${index.chunks.length} chunks, ${index.dimensions} dimensions)`);
}

async function searchDocuments(options: CliOptions): Promise<void> {
  if (!options.index) throw new Error("search requires --index <path>.");
  if (!options.query?.trim()) throw new Error("search requires a query.");
  const index = await loadLocalIndex(resolve(options.index));
  const hits = await searchEmbeddingIndex(index, options.query, new OllamaClient(options.host), options.topK);
  if (hits.length === 0) { console.log("No matching source chunks."); return; }
  hits.forEach((hit, index) => console.log(`[S${index + 1}] ${hit.source}${hit.pageStart ? ` p.${hit.pageStart}` : ""} (${hit.score.toFixed(4)})\n${hit.text}\n`));
}

async function renderJson(options: CliOptions): Promise<void> {
  if (!options.input) throw new Error("render requires a presentation JSON path.");
  const presentation = await importPresentationJson(resolve(options.input));
  const theme = await loadTheme(options.theme);
  const template = options.template ? await loadTemplate(resolve(options.template)) : undefined;
  await renderPresentation({ presentation, format: options.format, outputPath: resolve(options.output), theme, template, onProgress: (message, percent) => console.log(`  [${percent}%] ${message}`) });
  console.log(`✓ Rendered: ${resolve(options.output)}`);
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { inputs: [], model: "qwen3:8b", embeddingModel: "nomic-embed-text", output: "output/deck.pptx", host: "http://localhost:11434", slides: 8, topK: 5, port: 4173, format: "pptx", strictQuality: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[index + 1];
      const value = next && !next.startsWith("--") ? next : "true";
      if (value !== "true") index += 1;
      applyOption(options, key, value);
      continue;
    }
    if (!options.command) { options.command = arg; continue; }
    if (!options.input) options.input = arg;
    options.inputs.push(arg);
  }
  if (options.command === "search" && options.input && !options.query) options.query = options.input;
  if (options.format !== "pptx" && options.output === "output/deck.pptx") options.output = `output/deck.${options.format}`;
  return options;
}

function applyOption(options: CliOptions, key: string, value: string): void {
  switch (key) {
    case "model": options.model = value; break;
    case "embedding-model": options.embeddingModel = value; break;
    case "output": options.output = value; break;
    case "host": options.host = value; break;
    case "index": options.index = value; break;
    case "query": options.query = value; break;
    case "theme": options.theme = value; break;
    case "template": options.template = value; break;
    case "format": if (value !== "pptx" && value !== "html" && value !== "pdf") throw new Error("--format must be pptx, html, or pdf."); options.format = value; break;
    case "strict-quality": options.strictQuality = value === "true" || value === "1"; break;
    case "top-k": options.topK = parseBoundedNumber(value, 1, 100, "--top-k"); break;
    case "slides": options.slides = parseBoundedNumber(value, 1, 40, "--slides"); break;
    case "port": options.port = parseBoundedNumber(value, 1, 65535, "--port"); break;
    case "help": case "h": printHelp(); process.exit(0); break;
    default: throw new Error(`Unknown option: --${key}`);
  }
}

function parseBoundedNumber(value: string, min: number, max: number, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be a number between ${min} and ${max}.`);
  return parsed;
}

function printHelp(): void {
  console.log(`Local Deck AI

Usage:
  local-deck-ai generate <input-file> [options]
  local-deck-ai generate --index <path> --query <text> [options]
  local-deck-ai index <files...> [options]
  local-deck-ai search <query> --index <path> [options]
  local-deck-ai render <presentation.json> [options]
  local-deck-ai models [--host <url>]
  local-deck-ai gui

Options:
  --model <name>             Ollama generation model. Default: qwen3:8b
  --embedding-model <name>   Ollama embedding model. Default: nomic-embed-text
  --index <path>             Index path. Default: .local-deck/index.json
  --query <text>             Search query for RAG generation
  --top-k <number>           Number of retrieved chunks. Default: 5
  --format pptx|html|pdf     Output format. Default: pptx
  --output <path>            Output path
  --host <url>               Ollama host. Default: http://localhost:11434
  --slides <number>          Target slide count. Default: 8
  --theme <path>             Theme JSON path
  --template <path>          Template PPTX path with .template.json sidecar
  --strict-quality           Treat quality warnings as errors
  --port <number>             GUI port. Default: 4173
`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    if (error instanceof OllamaError && error.hint) console.error(`${error.message}\nヒント: ${error.hint}`);
    else console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
