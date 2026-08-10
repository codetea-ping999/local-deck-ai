import { z } from "zod";

export const SlideLayoutSchema = z.enum([
  "title",
  "agenda",
  "content",
  "comparison",
  "process",
  "summary"
]);

export const SlideColumnSchema = z.object({
  heading: z.string().min(1),
  items: z.array(z.string().min(1)).default([])
});

export const SlideSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  layout: SlideLayoutSchema.default("content"),
  bullets: z.array(z.string().min(1)).default([]),
  columns: z.array(SlideColumnSchema).optional(),
  steps: z.array(z.string().min(1)).optional(),
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
export type Slide = z.infer<typeof SlideSchema>;
export type Presentation = z.infer<typeof PresentationSchema>;
