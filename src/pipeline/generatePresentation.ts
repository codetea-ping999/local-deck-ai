import { buildPresentationPrompt } from "../llm/prompts.js";
import type { GenerateClient } from "../llm/ollama.js";
import { chunkDocument, type SourceDocument } from "../parser/readDocument.js";
import { PresentationSchema, type Presentation } from "../schemas/presentation.js";
import { extractJsonObject } from "../utils/json.js";
import { assertPresentationQuality, autoAdjustPresentation, type PresentationQualityReport } from "./quality.js";
import { resolvePresentationCitations, type RetrievedSource } from "../rag/citations.js";

export type GeneratePresentationOptions = {
  document: SourceDocument;
  client: GenerateClient;
  model: string;
  targetSlideCount: number;
  onProgress?: (message: string, percent: number) => void;
  chunkSize?: number;
  strictQuality?: boolean;
  autoAdjust?: boolean;
  retrievalContext?: string;
  retrievedSources?: RetrievedSource[];
};

export async function summarizeChunks(options: Pick<GeneratePresentationOptions, "document" | "client" | "model" | "onProgress"> & { chunkSize?: number }): Promise<string> {
  const chunks = chunkDocument(options.document.content, options.chunkSize ?? 12_000);
  if (chunks.length === 1) return options.document.content;
  const summaries: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    options.onProgress?.(`文書を要約しています (${index + 1}/${chunks.length})`, 10 + Math.round((index / chunks.length) * 25));
    let result: string;
    try {
      result = await options.client.generate({ model: options.model, temperature: 0.1, prompt: `Summarize this source chunk into factual slide-ready notes. Preserve names, numbers, dates, and decisions. Return plain text.\n\n${chunk.text}` });
    } catch (error) {
      throw new Error(`Document chunk ${index + 1}/${chunks.length} summarization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const summary = result.trim();
    if (!summary) throw new Error(`Document chunk ${index + 1}/${chunks.length} summarization returned an empty response.`);
    summaries.push(summary);
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
    targetSlideCount: options.targetSlideCount,
    retrievalContext: options.retrievalContext
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

  const cited = options.retrievedSources ? resolvePresentationCitations(result.data, options.retrievedSources) : result.data;
  const adjusted = options.autoAdjust === false ? cited : autoAdjustPresentation(cited);
  const quality = assertPresentationQuality(adjusted, options.strictQuality ?? false);
  options.onProgress?.(quality.warnings.length > 0 ? `品質警告 ${quality.warnings.length}件を確認しました` : "品質検証を完了しました", 84);
  options.onProgress?.(`${adjusted.slides.length}枚のスライド内容を作成しました`, 86);
  return adjusted;
}

export type GeneratedPresentation = Presentation & { qualityReport?: PresentationQualityReport };
