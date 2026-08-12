import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { PresentationSchema, type Presentation } from "../schemas/presentation.js";
import type { GenerateClient } from "../llm/ollama.js";
import { extractJsonObject } from "../utils/json.js";

export async function exportPresentationJson(presentation: Presentation, path: string): Promise<void> { await mkdir(dirname(resolve(path)), { recursive: true }); await writeFile(path, JSON.stringify(presentation, null, 2) + "\n", "utf8"); }
export async function importPresentationJson(path: string): Promise<Presentation> { const value = JSON.parse(await readFile(path, "utf8")) as unknown; const result = PresentationSchema.safeParse(value); if (!result.success) throw new Error(`Invalid presentation JSON:\n${result.error.message}`); return result.data; }
export async function regenerateSlide(presentation: Presentation, slideIndex: number, client: GenerateClient, model: string, layout?: string): Promise<Presentation> {
  const slide = presentation.slides[slideIndex]; if (!slide) throw new Error(`Slide index ${slideIndex} is out of range.`);
  const raw = await client.generate({ model, temperature: 0.2, prompt: `Rewrite only this slide as JSON. Keep the title intent, improve clarity, use layout ${layout ?? slide.layout}, and return {"title":"...","layout":"...","bullets":[],"speakerNotes":"..."}.\n${JSON.stringify(slide)}` });
  const parsed = extractJsonObject(raw); const next = PresentationSchema.shape.slides.element.safeParse(parsed); if (!next.success) throw new Error(`Regenerated slide is invalid:\n${next.error.message}`);
  return { ...presentation, slides: presentation.slides.map((item, index) => index === slideIndex ? next.data : item) };
}
export function presentationToHtml(presentation: Presentation): string {
  const slides = presentation.slides.map((slide) => `<section><h2>${escapeHtml(slide.title)}</h2>${slide.keyMessage ? `<p class="key">${escapeHtml(slide.keyMessage)}</p>` : `<ul>${slide.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`}</section>`).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(presentation.title)}</title><style>body{font:20px system-ui;background:#eee;margin:0}section{box-sizing:border-box;background:white;margin:5vh auto;padding:8vw;width:min(1100px,90vw);min-height:55vh;page-break-after:always}h1,h2{color:#111827}.key{font-size:2em;color:#2563eb;font-weight:700}li{margin:1em}</style><h1>${escapeHtml(presentation.title)}</h1>${slides}`;
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c)); }
