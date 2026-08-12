import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OllamaClient } from "../llm/ollama.js";
import { generatePresentation } from "../pipeline/generatePresentation.js";
import { renderPresentationToPptx } from "../renderer/pptx.js";
import type { SourceDocument } from "../parser/readDocument.js";
import { importPresentationJson, presentationToHtml } from "./workflow.js";
import { PresentationSchema } from "../schemas/presentation.js";

const publicDir = resolve(fileURLToPath(new URL("../../public", import.meta.url)));
const defaultPort = Number(process.env.LOCAL_DECK_PORT ?? 4173);
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export type GenerateRequest = {
  name?: string;
  content: string;
  model: string;
  host?: string;
  output?: string;
  slides?: number;
};

export function startGuiServer(port = defaultPort): void {
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
      const status = error instanceof RequestValidationError ? 400 : 500;
      sendJson(response, status, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`ポート ${port} はすでに使用中です。既存のGUIを http://127.0.0.1:${port} で開くか、別ポートで起動してください。例: npm run gui -- --port 4174`);
    } else {
      console.error(`GUIサーバーを起動できません: ${error.message}`);
    }
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Local Deck AI GUI: http://127.0.0.1:${port}`);
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname === "/api/models" && request.method === "GET") {
    const host = url.searchParams.get("host") ?? "http://localhost:11434";
    const models = await new OllamaClient(host).listModels();
    sendJson(response, 200, { models });
    return;
  }
  if (url.pathname === "/api/generate" && request.method === "POST") {
    await generateFromRequest(request, response);
    return;
  }
  if (url.pathname === "/api/validate-presentation" && request.method === "POST") {
    let body: unknown; try { body = JSON.parse(await readBody(request)); } catch { throw new RequestValidationError("JSONが不正です。"); }
    const value = body && typeof body === "object" && "path" in body ? await importPresentationJson(String((body as { path: unknown }).path)) : body;
    sendJson(response, 200, { presentation: value }); return;
  }
  if (url.pathname === "/api/export-html" && request.method === "POST") {
    let body: unknown; try { body = JSON.parse(await readBody(request)); } catch { throw new RequestValidationError("JSONが不正です。"); }
    const candidate = body && typeof body === "object" && "presentation" in body ? (body as { presentation: unknown }).presentation : body;
    const parsed = PresentationSchema.safeParse(candidate); if (!parsed.success) throw new RequestValidationError(`Presentation JSON is invalid:\n${parsed.error.message}`);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(presentationToHtml(parsed.data)); return;
  }
  await serveStatic(url.pathname, response);
}

async function generateFromRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(request)) as unknown;
  } catch {
    throw new RequestValidationError("リクエスト本文は有効なJSONである必要があります。");
  }
  const validated = validateGenerateRequest(body);
  const host = validated.host ?? "http://localhost:11434";
  const output = resolve(validated.output ?? "output/deck.pptx");
  const document: SourceDocument = { path: validated.name ?? "ブラウザ入力", name: validated.name ?? "ブラウザ入力", kind: "markdown", content: validated.content };
  response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" });
  const progress = (message: string, percent: number) => response.write(`${JSON.stringify({ type: "progress", message, percent })}\n`);
  try {
    progress("文書を読み込みました", 5);
    const presentation = await generatePresentation({ document, client: new OllamaClient(host), model: validated.model, targetSlideCount: validated.slides ?? 8, onProgress: progress });
    await renderPresentationToPptx(presentation, output, progress);
    response.write(`${JSON.stringify({ type: "done", output, title: presentation.title, slides: presentation.slides.length })}\n`);
  } catch (error: unknown) {
    response.write(`${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : String(error), hint: (error as { hint?: string }).hint })}\n`);
  } finally {
    response.end();
  }
}

export function validateGenerateRequest(value: unknown): GenerateRequest {
  if (!value || typeof value !== "object") throw new RequestValidationError("リクエスト本文はJSONオブジェクトである必要があります。");
  const body = value as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content : "";
  const model = typeof body.model === "string" ? body.model : "";
  if (!content.trim()) throw new RequestValidationError("文書内容を指定してください。");
  if (!model.trim()) throw new RequestValidationError("モデルを指定してください。");
  if (body.slides !== undefined && (!Number.isInteger(body.slides) || Number(body.slides) < 1 || Number(body.slides) > 40)) {
    throw new RequestValidationError("slidesは1から40までの整数で指定してください。");
  }
  if (body.output !== undefined && (typeof body.output !== "string" || !body.output.trim())) {
    throw new RequestValidationError("outputは空にできません。");
  }
  if (typeof body.output === "string" && !isAbsolute(body.output)) {
    throw new RequestValidationError("outputは絶対パスで指定してください。");
  }
  return {
    name: typeof body.name === "string" ? body.name : undefined,
    content,
    model,
    host: typeof body.host === "string" && body.host.trim() ? body.host : undefined,
    output: typeof body.output === "string" ? body.output : undefined,
    slides: typeof body.slides === "number" ? body.slides : undefined
  };
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(publicDir, `.${safePath}`);
  const pathFromPublic = relative(publicDir, filePath);
  if (pathFromPublic.startsWith("..") || isAbsolute(pathFromPublic)) { sendJson(response, 403, { error: "Forbidden" }); return; }
  try {
    const content = await readFile(filePath);
    const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
    response.writeHead(200, {
      "content-type": types[extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(content);
  } catch { sendJson(response, 404, { error: "Not found" }); }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = "";
    let size = 0;
    let rejected = false;
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      if (rejected) return;
      size += Buffer.byteLength(chunk, "utf8");
      if (size > MAX_REQUEST_BYTES) {
        rejected = true;
        reject(new RequestValidationError(`リクエスト本文が大きすぎます。上限は${MAX_REQUEST_BYTES}バイトです。`));
        return;
      }
      body += chunk;
    });
    request.on("end", () => { if (!rejected) resolveBody(body); });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}
