import { buildPresentationPrompt } from "../llm/prompts.js";
import type { OllamaClient } from "../llm/ollama.js";
import type { SourceDocument } from "../parser/readDocument.js";
import { PresentationSchema, type Presentation } from "../schemas/presentation.js";
import { extractJsonObject } from "../utils/json.js";

export type GeneratePresentationOptions = {
  document: SourceDocument;
  client: OllamaClient;
  model: string;
  targetSlideCount: number;
};

export async function generatePresentation(
  options: GeneratePresentationOptions
): Promise<Presentation> {
  const prompt = buildPresentationPrompt({
    document: options.document,
    targetSlideCount: options.targetSlideCount
  });

  const rawOutput = await options.client.generate({
    model: options.model,
    prompt,
    temperature: 0.2
  });

  const parsedJson = extractJsonObject(rawOutput);
  const result = PresentationSchema.safeParse(parsedJson);

  if (!result.success) {
    throw new Error(
      `The LLM returned JSON, but it did not match the presentation schema.\n${result.error.message}`
    );
  }

  return result.data;
}
