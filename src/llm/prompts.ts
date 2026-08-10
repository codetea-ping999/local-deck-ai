import type { SourceDocument } from "../parser/readDocument.js";

export type PresentationPromptInput = {
  document: SourceDocument;
  targetSlideCount: number;
};

export function buildPresentationPrompt(input: PresentationPromptInput): string {
  return `You are a presentation architect.

Create a concise, useful slide deck from the source document below.

Return JSON only. Do not use Markdown fences. Do not add commentary outside JSON.

Output schema:
{
  "title": "string",
  "subtitle": "string optional",
  "audience": "string optional",
  "sourceSummary": "string optional",
  "slides": [
    {
      "title": "string",
      "subtitle": "string optional",
      "layout": "title | agenda | content | comparison | process | summary",
      "bullets": ["string"],
      "columns": [
        { "heading": "string", "items": ["string"] }
      ],
      "steps": ["string"],
      "speakerNotes": "string optional"
    }
  ]
}

Rules:
- Target slide count: ${input.targetSlideCount}
- Use the same language as the source document unless the source clearly requests otherwise.
- Keep each slide focused on one message.
- Use at most 4 bullets per slide.
- Keep each bullet short and concrete.
- Prefer practical examples over abstract explanation.
- Use comparison layout only when there are clear two-sided contrasts.
- Use process layout when there is a sequence or workflow.
- Include speakerNotes when useful for explaining the slide.

Source file: ${input.document.name}
Source type: ${input.document.kind}

--- SOURCE START ---
${input.document.content}
--- SOURCE END ---`;
}
