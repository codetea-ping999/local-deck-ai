import { createReadStream } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OllamaClient, OllamaError } from "../llm/ollama.js";
import { generatePresentation } from "../pipeline/generatePresentation.js";
import { renderPresentation } from "../renderer/export.js";
import { DocumentError, MAX_DOCUMENT_BYTES, readDocument, type SourceDocument } from "../parser/readDocument.js";
import { presentationToHtml, regenerateSlide } from "./workflow.js";
import { PresentationSchema, type Presentation } from "../schemas/presentation.js";
import { loadLocalIndex, createEmbeddingIndex, buildRetrievalContext, searchEmbeddingIndex, saveLocalIndex } from "../rag/localIndex.js";
import { resolveTheme, type DeckThemeInput } from "../theme/theme.js";
import { assertPresentationQuality, validatePresentationQuality } from "../pipeline/quality.js";
import { loadTemplate } from "../template/template.js";

const publicDir = resolve(fileURLToPath(new URL("../../public", import.meta.url)));
const defaultPort = Number(process.env.LOCAL_DECK_PORT ?? 4173);
const DEFAULT_OUTPUT_ROOT = resolve(process.env.LOCAL_DECK_OUTPUT_ROOT ?? join(process.cwd(), "output"));
const UPLOAD_ROOT = resolve(process.env.LOCAL_DECK_UPLOAD_ROOT ?? join(process.cwd(), ".local-deck", "uploads"));
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const artifacts = new Map<string, { path: string; format: "pptx" | "html" | "pdf" | "json"; filename: string }>();

class RequestValidationError extends Error { constructor(message: string) { super(message); this.name = "RequestValidationError"; } }
export type GenerateRequest = { name?: string; content: string; model: string; host?: string; output?: string; slides?: number; format?: "pptx" | "html" | "pdf"; render?: boolean; strictQuality?: boolean; theme?: DeckThemeInput };
export type OutlineRequest = { documentIds: string[]; query?: string; model: string; host?: string; slides?: number; embeddingModel?: string; topK?: number; strictQuality?: boolean };

export function startGuiServer(port = defaultPort): Server {
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
      const status = error instanceof RequestValidationError || error instanceof DocumentError ? 400 : 500;
      sendJson(response, status, { error: error instanceof Error ? error.message : String(error), ...(error instanceof OllamaError && error.hint ? { hint: error.hint } : {}) });
    });
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") console.error(`ポート ${port} はすでに使用中です。別ポートで起動してください。`);
    else console.error(`GUIサーバーを起動できません: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => console.log(`Local Deck AI GUI: http://127.0.0.1:${port}`));
  return server;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname === "/api/models" && request.method === "GET") { const models = await new OllamaClient(url.searchParams.get("host") ?? "http://localhost:11434").listModels(); sendJson(response, 200, { models }); return; }
  if (url.pathname === "/api/documents" && request.method === "POST") { sendJson(response, 201, await uploadDocument(request)); return; }
  if (url.pathname.startsWith("/api/documents/") && request.method === "DELETE") { await deleteDocument(decodeURIComponent(url.pathname.slice("/api/documents/".length))); response.writeHead(204); response.end(); return; }
  if (url.pathname.startsWith("/api/artifacts/") && request.method === "GET") { await streamArtifact(decodeURIComponent(url.pathname.slice("/api/artifacts/".length)), response); return; }
  if (url.pathname === "/api/generate" && request.method === "POST") { await generateFromRequest(request, response); return; }
  if (url.pathname === "/api/outline" && request.method === "POST") { sendJson(response, 200, { presentation: await createOutline(request) }); return; }
  if (url.pathname === "/api/slides/regenerate" && request.method === "POST") { sendJson(response, 200, { presentation: await regenerateFromRequest(request) }); return; }
  if (url.pathname === "/api/index" && request.method === "POST") { sendJson(response, 201, await createIndexFromRequest(request)); return; }
  if (url.pathname === "/api/render" && request.method === "POST") { sendJson(response, 200, await renderFromRequest(request)); return; }
  if (url.pathname === "/api/validate-presentation" && request.method === "POST") { const value = await readJson(request); const parsed = PresentationSchema.safeParse(value && typeof value === "object" && "presentation" in value ? (value as { presentation: unknown }).presentation : value); if (!parsed.success) throw new RequestValidationError(`Presentation JSON is invalid:\n${parsed.error.message}`); const quality = validatePresentationQuality(parsed.data); sendJson(response, 200, { presentation: parsed.data, quality }); return; }
  if (url.pathname === "/api/export-html" && request.method === "POST") { const value = await readJson(request); const candidate = value && typeof value === "object" && "presentation" in value ? (value as { presentation: unknown }).presentation : value; const parsed = PresentationSchema.safeParse(candidate); if (!parsed.success) throw new RequestValidationError(`Presentation JSON is invalid:\n${parsed.error.message}`); assertPresentationQuality(parsed.data); const theme = value && typeof value === "object" && "theme" in value && (value as { theme: unknown }).theme && typeof (value as { theme: unknown }).theme === "object" ? resolveTheme((value as { theme: DeckThemeInput }).theme) : undefined; response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(presentationToHtml(parsed.data, theme)); return; }
  if (url.pathname === "/api/export-json" && request.method === "POST") { const value = await readJson(request); const candidate = value && typeof value === "object" && "presentation" in value ? (value as { presentation: unknown }).presentation : value; const parsed = PresentationSchema.safeParse(candidate); if (!parsed.success) throw new RequestValidationError(`Presentation JSON is invalid:\n${parsed.error.message}`); assertPresentationQuality(parsed.data); response.writeHead(200, { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=presentation.json" }); response.end(JSON.stringify(parsed.data, null, 2)); return; }
  await serveStatic(url.pathname, response);
}

async function uploadDocument(request: IncomingMessage): Promise<{ id: string; name: string; kind: string; bytes: number; segments: SourceDocument["segments"] }> {
  const contentType = request.headers["content-type"] ?? "";
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[1] ?? /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[2];
  if (!contentType.startsWith("multipart/form-data") || !boundary) throw new RequestValidationError("/api/documents requires multipart/form-data.");
  const parts = parseMultipart(await readRawBody(request, MAX_REQUEST_BYTES), boundary);
  const file = parts.find((part) => part.filename && part.name === "file") ?? parts.find((part) => part.filename);
  if (!file?.filename) throw new RequestValidationError("ファイルを指定してください。");
  if (file.data.length > MAX_DOCUMENT_BYTES) throw new DocumentError(`Input document is too large (${file.data.length} bytes). Maximum is ${MAX_DOCUMENT_BYTES} bytes.`, "TOO_LARGE");
  const extension = extname(file.filename).toLowerCase();
  if (![".md", ".markdown", ".mdx", ".txt", ".text", ".pdf", ".docx"].includes(extension)) throw new RequestValidationError("Supported upload formats are PDF, DOCX, Markdown, and TXT.");
  const id = randomUUID();
  await mkdir(UPLOAD_ROOT, { recursive: true });
  const storedPath = join(UPLOAD_ROOT, `${id}${extension}`);
  await writeFile(storedPath, file.data, { flag: "wx" });
  try {
    const document = await readDocument(storedPath);
    return { id, name: file.filename, kind: document.kind, bytes: file.data.length, segments: document.segments ?? [{ text: document.content }] };
  } catch (error) { await import("node:fs/promises").then(({ rm }) => rm(storedPath, { force: true })); throw error; }
}

async function createOutline(request: IncomingMessage): Promise<Presentation> {
  const body = validateOutlineRequest(await readJson(request));
  const documents = await loadDocuments(body.documentIds);
  const client = new OllamaClient(body.host ?? "http://localhost:11434");
  let retrievalContext: string | undefined;
  let retrievedSources: Array<{ id: string; source: string; text: string; pageStart?: number; pageEnd?: number }> | undefined;
  if (body.query?.trim()) {
    const indexPath = resolve(process.env.LOCAL_DECK_INDEX_PATH ?? join(process.cwd(), ".local-deck", "index.json"));
    try { const index = await loadLocalIndex(indexPath); const hits = await searchEmbeddingIndex(index, body.query, client, body.topK ?? 5); retrievalContext = buildRetrievalContext(hits); retrievedSources = hits.map((hit, index) => ({ id: `S${index + 1}`, source: hit.source, text: hit.text, pageStart: hit.pageStart, pageEnd: hit.pageEnd })); } catch { /* outline still works from uploaded documents when no index exists */ }
  }
  const source = documents.map((document) => `# ${document.name}\n${document.content}`).join("\n\n");
  return generatePresentation({ document: { path: documents.map((document) => document.path).join(","), name: documents.map((document) => document.name).join(", "), kind: "text", content: source }, client, model: body.model, targetSlideCount: body.slides ?? 8, strictQuality: body.strictQuality, retrievalContext, retrievedSources });
}

async function regenerateFromRequest(request: IncomingMessage): Promise<unknown> {
  const body = await readJson(request);
  if (!body || typeof body !== "object") throw new RequestValidationError("リクエスト本文はJSONオブジェクトである必要があります。");
  const value = body as Record<string, unknown>;
  const presentation = PresentationSchema.safeParse(value.presentation); if (!presentation.success) throw new RequestValidationError(`Presentation JSON is invalid:\n${presentation.error.message}`);
  if (!Number.isInteger(value.slideIndex) || Number(value.slideIndex) < 0 || Number(value.slideIndex) >= presentation.data.slides.length) throw new RequestValidationError("slideIndex is out of range.");
  if (value.layout !== undefined && typeof value.layout !== "string") throw new RequestValidationError("layout must be a string.");
  if (typeof value.model !== "string" || !value.model.trim()) throw new RequestValidationError("model is required.");
  return regenerateSlide(presentation.data, Number(value.slideIndex), new OllamaClient(typeof value.host === "string" ? value.host : undefined), value.model, typeof value.layout === "string" ? value.layout : undefined);
}

async function createIndexFromRequest(request: IncomingMessage): Promise<unknown> {
  const body = await readJson(request);
  if (!body || typeof body !== "object") throw new RequestValidationError("リクエスト本文はJSONオブジェクトである必要があります。");
  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.documentIds) || value.documentIds.length === 0 || value.documentIds.some((id) => typeof id !== "string")) throw new RequestValidationError("documentIds must contain at least one uploaded document ID.");
  const documents = await loadDocuments(value.documentIds as string[]);
  const index = await createEmbeddingIndex(documents, { client: new OllamaClient(typeof value.host === "string" ? value.host : undefined), model: typeof value.embeddingModel === "string" && value.embeddingModel.trim() ? value.embeddingModel : "nomic-embed-text" });
  const indexPath = safeLocalDeckPath(typeof value.indexPath === "string" ? value.indexPath : ".local-deck/index.json", ".local-deck/index.json");
  await saveLocalIndex(index, indexPath);
  return { indexPath, chunks: index.chunks.length, embeddingModel: index.embeddingModel, dimensions: index.dimensions };
}

async function renderFromRequest(request: IncomingMessage): Promise<{ outputPath: string; format: string; artifactId: string; downloadUrl: string }> {
  const body = await readJson(request);
  if (!body || typeof body !== "object") throw new RequestValidationError("リクエスト本文はJSONオブジェクトである必要があります。");
  const value = body as Record<string, unknown>;
  const parsed = PresentationSchema.safeParse(value.presentation); if (!parsed.success) throw new RequestValidationError(`Presentation JSON is invalid:\n${parsed.error.message}`);
  const format = value.format === "html" || value.format === "pdf" || value.format === "pptx" || value.format === "json" ? value.format : undefined;
  if (!format) throw new RequestValidationError("format must be pptx, html, pdf, or json.");
  const outputPath = safeOutputPath(typeof value.outputPath === "string" ? value.outputPath : undefined, format);
  const theme = value.theme && typeof value.theme === "object" ? resolveTheme(value.theme as DeckThemeInput) : undefined;
  const template = typeof value.template === "string" ? await loadTemplate(resolve(value.template)) : undefined;
  if (format === "json") await writeFile(outputPath, JSON.stringify(parsed.data, null, 2) + "\n", "utf8");
  else await renderPresentation({ presentation: parsed.data, format, outputPath, theme, template });
  return registerArtifact(outputPath, format);
}

async function generateFromRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = validateGenerateRequest(await readJson(request));
  const host = body.host ?? "http://localhost:11434";
  const format = body.format ?? "pptx";
  const shouldRender = body.render !== false;
  const output = shouldRender ? safeOutputPath(body.output, format) : undefined;
  const document: SourceDocument = { path: body.name ?? "browser-input", name: body.name ?? "browser-input", kind: "markdown", content: body.content };
  response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" });
  const progress = (message: string, percent: number) => response.write(`${JSON.stringify({ type: "progress", message, percent })}\n`);
  try {
    progress("文書を読み込みました", 5);
    const presentation = await generatePresentation({ document, client: new OllamaClient(host), model: body.model, targetSlideCount: body.slides ?? 8, strictQuality: body.strictQuality, onProgress: progress });
    const artifact = shouldRender && output ? await renderPresentation({ presentation, format, outputPath: output, theme: body.theme ? resolveTheme(body.theme) : undefined, onProgress: progress }).then(() => registerArtifact(output, format)) : undefined;
    response.write(`${JSON.stringify({ type: "done", ...(artifact ? { output: artifact.outputPath, artifactId: artifact.artifactId, downloadUrl: artifact.downloadUrl, format } : {}), title: presentation.title, slides: presentation.slides.length, presentation })}\n`);
  } catch (error: unknown) { response.write(`${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : String(error), hint: (error as { hint?: string }).hint })}\n`); }
  finally { response.end(); }
}

export function validateGenerateRequest(value: unknown): GenerateRequest {
  if (!value || typeof value !== "object") throw new RequestValidationError("リクエスト本文はJSONオブジェクトである必要があります。");
  const body = value as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content : "";
  const model = typeof body.model === "string" ? body.model : "";
  if (!content.trim()) throw new RequestValidationError("文書内容を指定してください。");
  if (!model.trim()) throw new RequestValidationError("モデルを指定してください。");
  if (body.slides !== undefined && (!Number.isInteger(body.slides) || Number(body.slides) < 1 || Number(body.slides) > 40)) throw new RequestValidationError("slidesは1から40までの整数で指定してください。");
  if (body.output !== undefined && (typeof body.output !== "string" || !body.output.trim())) throw new RequestValidationError("outputは空にできません。");
  if (typeof body.output === "string" && !isAbsolute(body.output) && !/^output[\\/]/i.test(body.output)) throw new RequestValidationError("outputは絶対パスまたはoutput/配下で指定してください。");
  if (body.format !== undefined && body.format !== "pptx" && body.format !== "html" && body.format !== "pdf") throw new RequestValidationError("format must be pptx, html, or pdf.");
  if (body.render !== undefined && typeof body.render !== "boolean") throw new RequestValidationError("render must be a boolean.");
  if (body.theme !== undefined && (!body.theme || typeof body.theme !== "object" || Array.isArray(body.theme))) throw new RequestValidationError("theme must be an object.");
  return { name: typeof body.name === "string" ? body.name : undefined, content, model, host: typeof body.host === "string" && body.host.trim() ? body.host : undefined, output: typeof body.output === "string" ? body.output : undefined, slides: typeof body.slides === "number" ? body.slides : undefined, format: body.format as GenerateRequest["format"], render: typeof body.render === "boolean" ? body.render : undefined, strictQuality: body.strictQuality === true, theme: body.theme as DeckThemeInput | undefined };
}

async function loadDocuments(ids: string[]): Promise<SourceDocument[]> {
  if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new RequestValidationError("documentIds contain an invalid upload ID.");
  const files = await import("node:fs/promises").then(({ readdir }) => readdir(UPLOAD_ROOT));
  return Promise.all(ids.map(async (id) => {
    const filename = files.find((file) => file.startsWith(`${id}.`));
    if (!filename) throw new RequestValidationError(`Uploaded document not found: ${id}`);
    const document = await readDocument(join(UPLOAD_ROOT, filename));
    return { ...document, id };
  }));
}

function safeOutputPath(candidate: string | undefined, format: "pptx" | "html" | "pdf" | "json"): string {
  const extension = `.${format}`;
  const root = DEFAULT_OUTPUT_ROOT;
  const value = candidate?.trim() ? candidate : join(root, `deck${extension}`);
  const path = isAbsolute(value) ? resolve(value) : resolve(value.toLowerCase().startsWith("output\\") || value.toLowerCase().startsWith("output/") ? process.cwd() : root, value);
  const pathRelative = relative(root, path);
  if (pathRelative.startsWith("..") || isAbsolute(pathRelative)) throw new RequestValidationError(`outputPath must stay inside ${root}.`);
  if (extname(path).toLowerCase() !== extension) throw new RequestValidationError(`outputPath must use the .${format} extension.`);
  return path;
}

async function deleteDocument(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new RequestValidationError("document ID is invalid.");
  const files = await readdir(UPLOAD_ROOT).catch(() => [] as string[]);
  const filename = files.find((file) => file.startsWith(`${id}.`));
  if (!filename) throw new RequestValidationError(`Uploaded document not found: ${id}`);
  await rm(join(UPLOAD_ROOT, filename), { force: true });
}

function registerArtifact(outputPath: string, format: "pptx" | "html" | "pdf" | "json"): { outputPath: string; format: string; artifactId: string; downloadUrl: string } {
  const artifactId = randomUUID();
  const filename = outputPath.split(/[\\/]/).pop() ?? `deck.${format}`;
  artifacts.set(artifactId, { path: outputPath, format, filename });
  return { outputPath, format, artifactId, downloadUrl: `/api/artifacts/${artifactId}` };
}

async function streamArtifact(id: string, response: ServerResponse): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) { sendJson(response, 404, { error: "Artifact not found" }); return; }
  const artifact = artifacts.get(id);
  if (!artifact) { sendJson(response, 404, { error: "Artifact not found" }); return; }
  const details = await stat(artifact.path).catch(() => undefined);
  if (!details?.isFile()) { sendJson(response, 404, { error: "Artifact not found" }); return; }
  const contentTypes: Record<string, string> = { pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", html: "text/html; charset=utf-8", pdf: "application/pdf", json: "application/json; charset=utf-8" };
  response.writeHead(200, { "content-type": contentTypes[artifact.format], "content-length": details.size, "content-disposition": `attachment; filename="${artifact.filename.replace(/[\"\\\r\n]/g, "_")}"`, "cache-control": "no-store" });
  createReadStream(artifact.path).pipe(response);
}

function safeLocalDeckPath(candidate: string, fallback: string): string {
  const root = resolve(process.cwd());
  const value = candidate.trim() ? candidate : fallback;
  const path = resolve(root, value);
  const pathRelative = relative(root, path);
  if (pathRelative.startsWith("..") || isAbsolute(pathRelative)) throw new RequestValidationError("indexPath must stay inside the local workspace.");
  return path;
}

async function readJson(request: IncomingMessage): Promise<unknown> { try { return JSON.parse(await readBody(request)); } catch { throw new RequestValidationError("リクエスト本文は有効なJSONである必要があります。"); } }
function readBody(request: IncomingMessage): Promise<string> { return readRawBody(request, MAX_REQUEST_BYTES).then((body) => body.toString("utf8")); }
function readRawBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> { return new Promise((resolveBody, reject) => { const chunks: Buffer[] = []; let size = 0; let rejected = false; request.on("data", (chunk: Buffer | string) => { if (rejected) return; const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.length; if (size > maxBytes) { rejected = true; reject(new RequestValidationError(`リクエスト本文が大きすぎます。上限は${maxBytes}バイトです。`)); return; } chunks.push(value); }); request.on("end", () => { if (!rejected) resolveBody(Buffer.concat(chunks)); }); request.on("error", reject); }); }

type MultipartPart = { name?: string; filename?: string; data: Buffer };
function parseMultipart(body: Buffer, boundary: string): MultipartPart[] { const marker = Buffer.from(`--${boundary}`); return body.toString("binary").split(marker.toString("binary")).slice(1).map((part) => Buffer.from(part, "binary")).filter((part) => part.length > 4 && !part.toString("binary").startsWith("--")).map((part) => { const headerEnd = part.indexOf(Buffer.from("\r\n\r\n")); if (headerEnd < 0) return { data: Buffer.alloc(0) }; const headers = part.subarray(0, headerEnd).toString("utf8"); const bodyPart = part.subarray(headerEnd + 4, part.length - (part.subarray(part.length - 2).toString() === "\r\n" ? 2 : 0)); return { name: /name="([^"]+)"/i.exec(headers)?.[1], filename: /filename="([^"]*)"/i.exec(headers)?.[1], data: bodyPart }; }); }

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> { const safePath = pathname === "/" ? "/index.html" : pathname; const filePath = resolve(publicDir, `.${safePath}`); const pathFromPublic = relative(publicDir, filePath); if (pathFromPublic.startsWith("..") || isAbsolute(pathFromPublic)) { sendJson(response, 403, { error: "Forbidden" }); return; } try { const content = await readFile(filePath); const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" }; response.writeHead(200, { "content-type": types[extname(filePath)] ?? "application/octet-stream", "cache-control": "no-store" }); response.end(content); } catch { sendJson(response, 404, { error: "Not found" }); } }
function sendJson(response: ServerResponse, status: number, data: unknown): void { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(data)); }

function validateOutlineRequest(value: unknown): OutlineRequest {
  if (!value || typeof value !== "object") throw new RequestValidationError("リクエスト本文はJSONオブジェクトである必要があります。");
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.documentIds) || body.documentIds.length === 0 || body.documentIds.some((id) => typeof id !== "string")) throw new RequestValidationError("documentIds must contain at least one document ID.");
  if (typeof body.model !== "string" || !body.model.trim()) throw new RequestValidationError("model is required.");
  if (body.slides !== undefined && (!Number.isInteger(body.slides) || Number(body.slides) < 1 || Number(body.slides) > 40)) throw new RequestValidationError("slides must be between 1 and 40.");
  return { documentIds: body.documentIds as string[], query: typeof body.query === "string" ? body.query : undefined, model: body.model, host: typeof body.host === "string" ? body.host : undefined, slides: typeof body.slides === "number" ? body.slides : undefined, embeddingModel: typeof body.embeddingModel === "string" ? body.embeddingModel : undefined, topK: typeof body.topK === "number" ? body.topK : undefined, strictQuality: body.strictQuality === true };
}
