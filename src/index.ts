export { OllamaClient } from "./llm/ollama.js";
export { buildPresentationPrompt } from "./llm/prompts.js";
export { readDocument, chunkDocument, chunkDocumentSegments, DocumentError, MAX_DOCUMENT_BYTES, type DocumentKind, type DocumentSegment, type SourceDocument } from "./parser/readDocument.js";
export { generatePresentation } from "./pipeline/generatePresentation.js";
export { assertPresentationQuality, autoAdjustPresentation, validatePresentationQuality, PresentationQualityError, QUALITY_LIMITS, type PresentationQualityReport, type QualityIssue } from "./pipeline/quality.js";
export { renderPresentationToPptx } from "./renderer/pptx.js";
export {
  PresentationSchema,
  SlideSchema,
  SlideLayoutSchema,
  type Presentation,
  type Slide,
  type SlideLayout
} from "./schemas/presentation.js";
export { exportPresentationJson, importPresentationJson, regenerateSlide, presentationToHtml } from "./gui/workflow.js";
export { loadTheme, resolveTheme, validateTheme, defaultTheme, DeckThemeSchema, type DeckTheme, type DeckThemeInput, type ResolvedTheme } from "./theme/theme.js";
export { createLocalIndex, createEmbeddingIndex, searchLocalIndex, searchEmbeddingIndex, searchByEmbedding, buildRetrievalContext, saveLocalIndex, loadLocalIndex } from "./rag/localIndex.js";
export { resolvePresentationCitations } from "./rag/citations.js";
export { convertPptxToPdf, renderPresentation, renderPresentationToHtml, type RenderFormat, type RenderOptions } from "./renderer/export.js";
export { loadTemplate, validateTemplateForPresentation, TemplateDefinitionSchema, type TemplateDefinition } from "./template/template.js";
