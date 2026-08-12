import type { SourceDocument } from "../parser/readDocument.js";

export type PresentationPromptInput = {
  document: SourceDocument;
  targetSlideCount: number;
};

export function buildPresentationPrompt(input: PresentationPromptInput): string {
  return `You are a presentation architect. Choose the most readable layout for each message.

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
      "layout": "title | agenda | content | comparison | process | summary | table | timeline | key-message",
      "bullets": ["string"],
      "columns": [
        { "heading": "string", "items": ["string"] }
      ],
      "steps": ["string"],
      "table": {"headers": ["string"], "rows": [["string"]]},
      "timeline": [{"date": "string", "label": "string", "description": "string"}],
      "keyMessage": "string",
      "citations": [{"source": "string", "quote": "string", "page": 1}],
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
- Start with one title slide and add an agenda when the deck has 5 or more content slides.
- Use table for comparable structured values, timeline for dated events, and key-message for one decisive takeaway.
- Keep tables to 6 columns and 12 rows, timelines to 8 items, and cite the source filename (and PDF page when known).

Source file: ${input.document.name}
Source type: ${input.document.kind}

--- SOURCE START ---
${input.document.content}
--- SOURCE END ---`;
}
