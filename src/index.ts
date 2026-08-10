export { OllamaClient } from "./llm/ollama.js";
export { buildPresentationPrompt } from "./llm/prompts.js";
export { readDocument } from "./parser/readDocument.js";
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
