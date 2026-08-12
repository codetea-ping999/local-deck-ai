import { PresentationSchema, type Presentation, type Slide } from "../schemas/presentation.js";

export type QualitySeverity = "error" | "warning";
export type QualityIssue = {
  severity: QualitySeverity;
  code: string;
  message: string;
  slideIndex?: number;
};

export type PresentationQualityReport = {
  valid: boolean;
  errors: QualityIssue[];
  warnings: QualityIssue[];
  issues: QualityIssue[];
};

export const QUALITY_LIMITS = {
  title: 80,
  subtitle: 140,
  bullets: 6,
  bullet: 100,
  slideCharacters: 520,
  tableColumns: 6,
  tableRows: 12,
  timelineItems: 8
} as const;

/** Validate readability constraints after schema validation. */
export function validatePresentationQuality(presentation: Presentation): PresentationQualityReport {
  const issues: QualityIssue[] = [];
  const add = (severity: QualitySeverity, code: string, message: string, slideIndex?: number) => {
    issues.push({ severity, code, message, ...(slideIndex === undefined ? {} : { slideIndex }) });
  };

  if (presentation.title.length > QUALITY_LIMITS.title) {
    add("warning", "TITLE_TOO_LONG", `Presentation title exceeds ${QUALITY_LIMITS.title} characters.`);
  }
  if (presentation.subtitle && presentation.subtitle.length > QUALITY_LIMITS.subtitle) {
    add("warning", "SUBTITLE_TOO_LONG", `Presentation subtitle exceeds ${QUALITY_LIMITS.subtitle} characters.`);
  }

  presentation.slides.forEach((slide, slideIndex) => {
    if (slide.title.length > QUALITY_LIMITS.title) add("warning", "SLIDE_TITLE_TOO_LONG", `Slide title exceeds ${QUALITY_LIMITS.title} characters.`, slideIndex);
    if (slide.subtitle && slide.subtitle.length > QUALITY_LIMITS.subtitle) add("warning", "SLIDE_SUBTITLE_TOO_LONG", `Slide subtitle exceeds ${QUALITY_LIMITS.subtitle} characters.`, slideIndex);
    if (slide.bullets.length > QUALITY_LIMITS.bullets) add("error", "TOO_MANY_BULLETS", `Slide has ${slide.bullets.length} bullets; maximum is ${QUALITY_LIMITS.bullets}.`, slideIndex);
    slide.bullets.forEach((bullet, bulletIndex) => {
      if (bullet.length > QUALITY_LIMITS.bullet) add("warning", "BULLET_TOO_LONG", `Bullet ${bulletIndex + 1} exceeds ${QUALITY_LIMITS.bullet} characters.`, slideIndex);
    });
    if (slide.table) {
      if (slide.table.headers.length > QUALITY_LIMITS.tableColumns) add("error", "TOO_MANY_TABLE_COLUMNS", `Table has ${slide.table.headers.length} columns; maximum is ${QUALITY_LIMITS.tableColumns}.`, slideIndex);
      if (slide.table.rows.length > QUALITY_LIMITS.tableRows) add("error", "TOO_MANY_TABLE_ROWS", `Table has ${slide.table.rows.length} rows; maximum is ${QUALITY_LIMITS.tableRows}.`, slideIndex);
    }
    if (slide.timeline && slide.timeline.length > QUALITY_LIMITS.timelineItems) add("error", "TOO_MANY_TIMELINE_ITEMS", `Timeline has ${slide.timeline.length} items; maximum is ${QUALITY_LIMITS.timelineItems}.`, slideIndex);
    if (slideTextLength(slide) > QUALITY_LIMITS.slideCharacters) add("warning", "SLIDE_TOO_DENSE", `Slide contains more than ${QUALITY_LIMITS.slideCharacters} characters.`, slideIndex);
  });

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, errors, warnings, issues };
}

export class PresentationQualityError extends Error {
  constructor(readonly report: PresentationQualityReport) {
    super(formatQualityIssues(report));
    this.name = "PresentationQualityError";
  }
}

export type AutoAdjustOptions = { addAgenda?: boolean; splitDenseSlides?: boolean };

/** Add structural slides and split only content slides that exceed hard density limits. */
export function autoAdjustPresentation(presentation: Presentation, options: AutoAdjustOptions = {}): Presentation {
  const addAgenda = options.addAgenda ?? true;
  const splitDenseSlides = options.splitDenseSlides ?? true;
  let slides = presentation.slides.flatMap((slide) => splitDenseSlides ? splitContentSlide(slide) : [slide]);

  if (!slides.some((slide) => slide.layout === "title")) {
    slides = [{ title: presentation.title, subtitle: presentation.subtitle, layout: "title", bullets: [] }, ...slides];
  } else if (slides[0]?.layout !== "title") {
    const titleIndex = slides.findIndex((slide) => slide.layout === "title");
    const [titleSlide] = slides.splice(titleIndex, 1);
    if (titleSlide) slides.unshift(titleSlide);
  }

  const hasAgenda = slides.some((slide) => slide.layout === "agenda");
  if (addAgenda && !hasAgenda && slides.length >= 5) {
    const titleSlide = slides[0];
    const contentSlides = slides.slice(1);
    const agenda: Slide = {
      title: "Agenda",
      layout: "agenda",
      bullets: contentSlides.slice(0, 8).map((slide) => slide.title),
      speakerNotes: "Automatically generated from slide titles."
    };
    slides = titleSlide ? [titleSlide, agenda, ...contentSlides] : [agenda, ...contentSlides];
  }

  return { ...presentation, slides: slides.slice(0, 40) };
}

export function validatePresentation(value: unknown): Presentation {
  const parsed = PresentationSchema.safeParse(value);
  if (!parsed.success) throw new Error(`The presentation does not match the schema.\n${parsed.error.message}`);
  return parsed.data;
}

export function assertPresentationQuality(presentation: Presentation, strict = false): PresentationQualityReport {
  const report = validatePresentationQuality(presentation);
  if (report.errors.length > 0 || (strict && report.warnings.length > 0)) throw new PresentationQualityError(report);
  return report;
}

function splitContentSlide(slide: Slide): Slide[] {
  if (slide.layout !== "content" || slide.bullets.length <= QUALITY_LIMITS.bullets && slideTextLength(slide) <= QUALITY_LIMITS.slideCharacters) return [slide];
  if (slide.bullets.length === 0) return [slide];

  const parts: Slide[] = [];
  let bullets: string[] = [];
  let characters = baseSlideTextLength(slide);
  for (const bullet of slide.bullets) {
    const wouldOverflow = bullets.length >= QUALITY_LIMITS.bullets || characters + bullet.length > QUALITY_LIMITS.slideCharacters;
    if (wouldOverflow && bullets.length > 0) {
      parts.push({ ...slide, bullets });
      bullets = [];
      characters = baseSlideTextLength(slide);
    }
    bullets.push(bullet);
    characters += bullet.length;
  }
  if (bullets.length > 0) parts.push({ ...slide, bullets });
  if (parts.length <= 1) return [slide];
  return parts.map((part, index) => ({ ...part, title: index === 0 ? slide.title : `${slide.title} (${index + 1})` }));
}

function baseSlideTextLength(slide: Slide): number {
  return slide.title.length + (slide.subtitle?.length ?? 0) + (slide.keyMessage?.length ?? 0) + (slide.speakerNotes?.length ?? 0);
}

function slideTextLength(slide: Slide): number {
  const tableText = slide.table ? [...slide.table.headers, ...slide.table.rows.flat()].join("") : "";
  const timelineText = slide.timeline?.map((item) => `${item.date}${item.label}${item.description ?? ""}`).join("") ?? "";
  const columnText = slide.columns?.map((column) => `${column.heading}${column.items.join("")}`).join("") ?? "";
  return baseSlideTextLength(slide) + slide.bullets.join("").length + (slide.steps?.join("").length ?? 0) + tableText.length + timelineText.length + columnText.length;
}

function formatQualityIssues(report: PresentationQualityReport): string {
  return report.issues.map((issue) => `${issue.severity.toUpperCase()} ${issue.code}${issue.slideIndex === undefined ? "" : ` (slide ${issue.slideIndex + 1})`}: ${issue.message}`).join("\n");
}
