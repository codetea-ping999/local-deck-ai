import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
export async function convertPptxToPdf(pptxPath: string, outputDir = dirname(pptxPath)): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  return await new Promise((resolve, reject) => { const child = spawn("soffice", ["--headless", "--convert-to", "pdf", "--outdir", outputDir, pptxPath], { stdio: "ignore" }); child.on("error", () => reject(new Error("PDF export requires LibreOffice (soffice) on PATH."))); child.on("exit", (code) => code === 0 ? resolve(pptxPath.replace(/\.pptx$/i, ".pdf")) : reject(new Error(`LibreOffice PDF export failed with exit code ${code}.`))); });
}
