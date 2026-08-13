import type { Presentation, Citation } from "../schemas/presentation.js";

export type RetrievedSource = {
  id: string;
  source: string;
  text: string;
  pageStart?: number;
  pageEnd?: number;
};

export function resolvePresentationCitations(presentation: Presentation, sources: RetrievedSource[]): Presentation {
  if (sources.length === 0) return presentation;
  const byId = new Map(sources.map((source) => [source.id.toLowerCase(), source]));
  const bySource = new Map(sources.map((source) => [source.source.toLowerCase(), source]));
  return {
    ...presentation,
    slides: presentation.slides.map((slide) => {
      if (!slide.citations?.length) return slide;
      const resolved = slide.citations.map((citation) => resolveCitation(citation, byId, bySource));
      const sourceNotes = resolved.map((citation) => `- ${citation.source}${citation.page ? ` (p.${citation.page})` : ""}`).join("\n");
      const notes = [slide.speakerNotes?.trim(), `Sources:\n${sourceNotes}`].filter(Boolean).join("\n\n");
      return { ...slide, citations: resolved, speakerNotes: notes };
    })
  };
}

function resolveCitation(citation: Citation, byId: Map<string, RetrievedSource>, bySource: Map<string, RetrievedSource>): Citation {
  const normalized = citation.source.match(/^\[?(s\d+)\]?$/i)?.[1] ?? citation.source;
  const found = byId.get(normalized.toLowerCase()) ?? bySource.get(citation.source.toLowerCase());
  if (!found) throw new Error(`Unknown citation source "${citation.source}". Use one of the retrieved source IDs.`);
  return { ...citation, source: found.source, ...(citation.page ?? found.pageStart ? { page: citation.page ?? found.pageStart } : {}) };
}
