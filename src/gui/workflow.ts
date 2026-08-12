import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { PresentationSchema, type Presentation } from "../schemas/presentation.js";
import type { GenerateClient } from "../llm/ollama.js";
import { extractJsonObject } from "../utils/json.js";
import { SlideLayoutSchema } from "../schemas/presentation.js";
import { defaultTheme, type DeckTheme } from "../theme/theme.js";
import { assertPresentationQuality, autoAdjustPresentation } from "../pipeline/quality.js";

export async function exportPresentationJson(presentation: Presentation, path: string): Promise<void> { await mkdir(dirname(resolve(path)), { recursive: true }); await writeFile(path, JSON.stringify(presentation, null, 2) + "\n", "utf8"); }
export async function importPresentationJson(path: string): Promise<Presentation> { const value = JSON.parse(await readFile(path, "utf8")) as unknown; const result = PresentationSchema.safeParse(value); if (!result.success) throw new Error(`Invalid presentation JSON:\n${result.error.message}`); return result.data; }
export async function regenerateSlide(presentation: Presentation, slideIndex: number, client: GenerateClient, model: string, layout?: string): Promise<Presentation> {
  const slide = presentation.slides[slideIndex]; if (!slide) throw new Error(`Slide index ${slideIndex} is out of range.`);
  if (layout && !SlideLayoutSchema.safeParse(layout).success) throw new Error(`Unsupported slide layout: ${layout}`);
  const raw = await client.generate({ model, temperature: 0.2, prompt: `Rewrite only this slide as JSON. Keep the title intent, improve clarity, use layout ${layout ?? slide.layout}, and return {"title":"...","layout":"...","bullets":[],"speakerNotes":"..."}.\n${JSON.stringify(slide)}` });
  const parsed = extractJsonObject(raw); const next = PresentationSchema.shape.slides.element.safeParse(parsed); if (!next.success) throw new Error(`Regenerated slide is invalid:\n${next.error.message}`);
  const regenerated = { ...presentation, slides: presentation.slides.map((item, index) => index === slideIndex ? { ...next.data, ...(layout ? { layout: SlideLayoutSchema.parse(layout) } : {}) } : item) };
  const adjusted = autoAdjustPresentation(regenerated, { addAgenda: false });
  assertPresentationQuality(adjusted);
  return adjusted;
}
export function presentationToHtml(presentation: Presentation, theme: DeckTheme = defaultTheme): string {
  const slides = presentation.slides.map((slide, index) => {
    const body = slide.keyMessage ? `<p class="key">${escapeHtml(slide.keyMessage)}</p>` : slide.table ? `<table><thead><tr>${slide.table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${slide.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : slide.timeline ? `<ol class="timeline">${slide.timeline.map((item) => `<li><strong>${escapeHtml(item.date)} ${escapeHtml(item.label)}</strong>${item.description ? `<span>${escapeHtml(item.description)}</span>` : ""}</li>`).join("")}</ol>` : `<ul>${slide.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`;
    const notes = slide.citations?.length ? `<small class="sources">Sources: ${slide.citations.map((citation) => `${escapeHtml(citation.source)}${citation.page ? ` (p.${citation.page})` : ""}`).join(", ")}</small>` : "";
    return `<section data-slide="${index + 1}"><div class="eyebrow">${index + 1} / ${presentation.slides.length}</div><h2>${escapeHtml(slide.title)}</h2>${slide.subtitle ? `<p class="subtitle">${escapeHtml(slide.subtitle)}</p>` : ""}${body}${notes}<footer>${escapeHtml(theme.footer ?? presentation.title)}</footer></section>`;
  }).join("\n");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(presentation.title)}</title><style>:root{font-family:${escapeCss(theme.fontFace)};color:#${theme.colors.ink};background:#${theme.colors.canvas}}*{box-sizing:border-box}body{font:20px system-ui;background:#${theme.colors.surface};margin:0;padding:2rem}section{box-sizing:border-box;background:#${theme.colors.canvas};border-top:5px solid #${theme.colors.accent};margin:0 auto 2rem;padding:5vw;width:min(1100px,92vw);min-height:620px;page-break-after:always;position:relative}h1,h2{font-family:${escapeCss(theme.headingFontFace)};color:#${theme.colors.ink}}h2{font-size:2rem;border-bottom:1px solid #${theme.colors.line};padding-bottom:.6rem}.eyebrow{color:#${theme.colors.accent};font-weight:800;font-size:.75rem;letter-spacing:.12em}.subtitle{color:#${theme.colors.muted}}.key{font-size:2em;color:#${theme.colors.accent};font-weight:700;text-align:center;margin:6rem 0}li{margin:1em 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #${theme.colors.line};padding:.5rem;text-align:left}th{background:#${theme.colors.accent};color:#${theme.colors.canvas}}.timeline span{display:block;color:#${theme.colors.muted}}.sources{display:block;color:#${theme.colors.muted};margin-top:2rem}footer{position:absolute;bottom:1rem;left:5vw;color:#${theme.colors.muted};font-size:.7rem}@media print{body{background:white;padding:0}section{width:100%;margin:0;min-height:100vh}} </style></head><body><h1>${escapeHtml(presentation.title)}</h1>${slides}</body></html>`;
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c)); }
function escapeCss(value: string): string { return value.replace(/[{};<>]/g, ""); }
