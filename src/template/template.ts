import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { SlideLayoutSchema, type Presentation } from "../schemas/presentation.js";

const PlaceholderSchema = z.object({ x: z.number().min(0).optional(), y: z.number().min(0).optional(), w: z.number().positive().optional(), h: z.number().positive().optional() }).default({});
const TemplateLayoutSchema = z.object({ templateLayout: z.union([z.string(), z.number()]).optional(), placeholders: z.object({ title: PlaceholderSchema.optional(), subtitle: PlaceholderSchema.optional(), body: PlaceholderSchema.optional(), notes: PlaceholderSchema.optional() }).default({}) });
export const TemplateDefinitionSchema = z.object({
  templatePath: z.string().optional(),
  layouts: z.record(SlideLayoutSchema, TemplateLayoutSchema).optional(),
  slideTypes: z.record(SlideLayoutSchema, TemplateLayoutSchema).optional()
});
export type TemplateLayout = z.infer<typeof TemplateLayoutSchema>;
export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema> & { templatePath: string };

export async function loadTemplate(templatePath: string): Promise<TemplateDefinition> {
  if (!isAbsolute(templatePath)) throw new Error("Template path must be absolute.");
  if (!existsSync(templatePath)) throw new Error(`Template PPTX does not exist: ${templatePath}`);
  const sidecarPath = templatePath.replace(/\.pptx$/i, ".template.json");
  if (!existsSync(sidecarPath)) throw new Error(`Template definition is required next to the PPTX: ${sidecarPath}`);
  const raw = JSON.parse(await readFile(sidecarPath, "utf8")) as unknown;
  const parsed = TemplateDefinitionSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid template definition "${sidecarPath}":\n${parsed.error.message}`);
  const layouts = parsed.data.layouts ?? parsed.data.slideTypes;
  if (!layouts || Object.keys(layouts).length === 0) throw new Error(`Template definition must declare layouts: ${sidecarPath}`);
  return { ...parsed.data, templatePath, layouts };
}

export function validateTemplateForPresentation(template: TemplateDefinition, presentation: Presentation): string[] {
  const errors: string[] = [];
  if (!existsSync(template.templatePath)) errors.push(`Template PPTX does not exist: ${template.templatePath}`);
  const layouts = template.layouts ?? template.slideTypes ?? {};
  for (const [index, slide] of presentation.slides.entries()) if (!layouts[slide.layout]) errors.push(`Template layout mapping is missing for "${slide.layout}" (slide ${index + 1}).`);
  return errors;
}

export function resolveTemplatePath(templatePath: string, sidecarValue: string): string {
  return isAbsolute(sidecarValue) ? sidecarValue : resolve(dirname(templatePath), sidecarValue);
}
