import { buildPresentationPrompt } from "../llm/prompts.js";
import type { GenerateClient } from "../llm/ollama.js";
import { chunkDocument, type SourceDocument } from "../parser/readDocument.js";
import { PresentationSchema, type Presentation } from "../schemas/presentation.js";
import { extractJsonObject } from "../utils/json.js";

export type GeneratePresentationOptions = {
  document: SourceDocument;
  client: GenerateClient;
  model: string;
  targetSlideCount: number;
  onProgress?: (message: string, percent: number) => void;
  chunkSize?: number;
};

export async function summarizeChunks(options: Pick<GeneratePresentationOptions, "document" | "client" | "model" | "onProgress"> & { chunkSize?: number }): Promise<string> {
  const chunks = chunkDocument(options.document.content, options.chunkSize ?? 12_000);
  if (chunks.length === 1) return options.document.content;
  const summaries: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    options.onProgress?.(`文書を要約しています (${index + 1}/${chunks.length})`, 10 + Math.round((index / chunks.length) * 25));
    const result = await options.client.generate({ model: options.model, temperature: 0.1, prompt: `Summarize this source chunk into factual slide-ready notes. Preserve names, numbers, dates, and decisions. Return plain text.\n\n${chunk.text}` });
    summaries.push(result.trim());
  }
  return summaries.join("\n\n");
}

export async function generatePresentation(
  options: GeneratePresentationOptions
): Promise<Presentation> {
  options.onProgress?.("プロンプトを準備しています", 10);
  const summarizedContent = await summarizeChunks(options);
  const prompt = buildPresentationPrompt({
    document: { ...options.document, content: summarizedContent },
    targetSlideCount: options.targetSlideCount
  });

  options.onProgress?.(`${options.model} でスライド内容を生成しています`, 25);
  let rawOutput = await options.client.generate({
    model: options.model,
    prompt,
    temperature: 0.2
  });

  options.onProgress?.("生成結果を検証しています", 72);
  let parsedJson: unknown;
  try {
    parsedJson = extractJsonObject(rawOutput);
  } catch (initialError) {
    options.onProgress?.("JSON形式で再生成しています", 76);
    rawOutput = await options.client.generate({
      model: options.model,
      prompt: `${prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return exactly one valid JSON object matching the schema. Do not include thinking, Markdown, or any text before or after the JSON.`,
      temperature: 0
    });
    try {
      parsedJson = extractJsonObject(rawOutput);
    } catch (retryError) {
      throw new Error(
        `Initial JSON parse failed: ${initialError instanceof Error ? initialError.message : String(initialError)}\n` +
        `Retry JSON parse failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`
      );
    }
  }
  const result = PresentationSchema.safeParse(parsedJson);

  if (!result.success) {
    throw new Error(`The LLM returned JSON, but it did not match the presentation schema.\n${result.error.message}`);
  }

  options.onProgress?.(`${result.data.slides.length}枚のスライド内容を作成しました`, 82);
  return result.data;
}
