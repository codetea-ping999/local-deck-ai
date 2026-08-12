export { OllamaClient } from "./llm/ollama.js";
export { buildPresentationPrompt } from "./llm/prompts.js";
export { readDocument, chunkDocument, DocumentError } from "./parser/readDocument.js";
export { generatePresentation } from "./pipeline/generatePresentation.js";
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
export { loadTheme, validateTheme, defaultTheme } from "./theme/theme.js";
export { createLocalIndex, searchLocalIndex, saveLocalIndex, loadLocalIndex } from "./rag/localIndex.js";
export { convertPptxToPdf } from "./renderer/export.js";
