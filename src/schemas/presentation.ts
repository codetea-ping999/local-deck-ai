import { z } from "zod";

export const SlideLayoutSchema = z.enum([
  "title",
  "agenda",
  "content",
  "comparison",
  "process",
  "summary",
  "table",
  "timeline",
  "key-message"
]);

export const SlideColumnSchema = z.object({
  heading: z.string().min(1),
  items: z.array(z.string().min(1)).default([])
});
export const SlideTableSchema = z.object({ headers: z.array(z.string().min(1)).min(1).max(6), rows: z.array(z.array(z.string())).max(12) });
export const SlideTimelineItemSchema = z.object({ date: z.string().min(1), label: z.string().min(1), description: z.string().optional() });
export const CitationSchema = z.object({ source: z.string().min(1), quote: z.string().optional(), page: z.number().int().positive().optional() });

export const SlideSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  layout: SlideLayoutSchema.default("content"),
  bullets: z.array(z.string().min(1)).default([]),
  columns: z.array(SlideColumnSchema).optional(),
  steps: z.array(z.string().min(1)).optional(),
  table: SlideTableSchema.optional(),
  timeline: z.array(SlideTimelineItemSchema).max(8).optional(),
  keyMessage: z.string().min(1).optional(),
  citations: z.array(CitationSchema).max(12).optional(),
  speakerNotes: z.string().optional()
});

export const PresentationSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  audience: z.string().optional(),
  sourceSummary: z.string().optional(),
  slides: z.array(SlideSchema).min(1).max(40)
});

export type SlideLayout = z.infer<typeof SlideLayoutSchema>;
export type SlideColumn = z.infer<typeof SlideColumnSchema>;
export type SlideTable = z.infer<typeof SlideTableSchema>;
export type SlideTimelineItem = z.infer<typeof SlideTimelineItemSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Presentation = z.infer<typeof PresentationSchema>;
