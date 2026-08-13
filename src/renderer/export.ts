import { mkdir, rename, rm } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, parse } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import type { Presentation } from "../schemas/presentation.js";
import { renderPresentationToPptx } from "./pptx.js";
import { defaultTheme, type DeckTheme } from "../theme/theme.js";
import type { TemplateDefinition } from "../template/template.js";
import { validatePresentation, assertPresentationQuality } from "../pipeline/quality.js";
import { presentationToHtml } from "../gui/workflow.js";

export type RenderFormat = "pptx" | "html" | "pdf";
export type RenderOptions = { presentation: Presentation; format: RenderFormat; outputPath: string; theme?: DeckTheme; template?: TemplateDefinition; onProgress?: (message: string, percent: number) => void };

export async function renderPresentationToHtml(presentation: Presentation, outputPath: string, theme: DeckTheme = defaultTheme): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const validated = validatePresentation(presentation);
  assertPresentationQuality(validated);
  await writeFile(outputPath, presentationToHtml(validated, theme), "utf8");
}

export async function renderPresentation(options: RenderOptions): Promise<string> {
  const presentation = validatePresentation(options.presentation);
  assertPresentationQuality(presentation);
  const theme = options.theme ?? defaultTheme;
  await mkdir(dirname(options.outputPath), { recursive: true });
  if (options.format === "pptx") {
    await renderPresentationToPptx(presentation, options.outputPath, options.onProgress, theme, options.template);
    return options.outputPath;
  }
  if (options.format === "html") {
    const html = presentationToHtml(presentation, theme);
    await writeFile(options.outputPath, html, "utf8");
    options.onProgress?.("HTMLファイルを書き出しました", 100);
    return options.outputPath;
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "local-deck-ai-pdf-"));
  const temporaryPptx = join(temporaryDirectory, `${parse(options.outputPath).name}.pptx`);
  try {
    await renderPresentationToPptx(presentation, temporaryPptx, options.onProgress, theme, options.template);
    const convertedPdf = await convertPptxToPdf(temporaryPptx, temporaryDirectory);
    await rename(convertedPdf, options.outputPath);
    options.onProgress?.("PDFファイルを書き出しました", 100);
    return options.outputPath;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function convertPptxToPdf(pptxPath: string, outputDir = dirname(pptxPath)): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  return await new Promise((resolve, reject) => {
    const child = spawn("soffice", ["--headless", "--convert-to", "pdf", "--outdir", outputDir, pptxPath], { stdio: "ignore" });
    child.on("error", () => reject(new Error("PDF export requires LibreOffice (soffice) on PATH. Install LibreOffice and retry.")));
    child.on("exit", (code: number | null) => code === 0 ? resolve(pptxPath.replace(/\.pptx$/i, ".pdf")) : reject(new Error(`LibreOffice PDF export failed with exit code ${code ?? "unknown"}.`)));
  });
}
