/** @typedef {{ title: string, subtitle?: string, layout: string, bullets: string[], columns?: Array<{ heading: string, items: string[] }>, steps?: string[], table?: { headers: string[], rows: string[][] }, timeline?: Array<{ date: string, label: string, description?: string }>, keyMessage?: string, citations?: Array<{ source: string, quote?: string, page?: number }>, speakerNotes?: string }} Slide */
/** @typedef {{ title: string, subtitle?: string, audience?: string, sourceSummary?: string, slides: Slide[] }} Presentation */

export function createInitialState() {
  return {
    documents: [],
    presentation: null,
    selectedSlide: 0,
    dirty: false,
    quality: null,
    theme: null,
    themeSource: null,
    themeWarnings: [],
    busy: false,
    generation: { phase: 'idle', percent: 0, logs: [], error: null },
    models: [],
    settings: {
      host: 'http://localhost:11434',
      model: '',
      slides: 8,
      query: '',
      embeddingModel: 'nomic-embed-text',
      format: 'pptx',
      output: 'deck.pptx',
      strictQuality: false
    }
  };
}

export function clonePresentation(presentation) {
  return presentation ? JSON.parse(JSON.stringify(presentation)) : null;
}

export function isPresentationLike(value) {
  return Boolean(value && typeof value === 'object' && typeof value.title === 'string' && Array.isArray(value.slides) && value.slides.length > 0);
}

export function replacePresentation(state, presentation, { dirty = false } = {}) {
  state.presentation = clonePresentation(presentation);
  state.selectedSlide = Math.min(state.selectedSlide, Math.max(0, (state.presentation?.slides.length ?? 1) - 1));
  state.dirty = dirty;
  state.quality = null;
  return state.presentation;
}

export function updateSlide(state, slideIndex, changes) {
  if (!state.presentation?.slides[slideIndex]) return false;
  state.presentation.slides[slideIndex] = { ...state.presentation.slides[slideIndex], ...changes };
  state.dirty = true;
  return true;
}

export function addSlide(state, slide = createBlankSlide(), afterIndex = state.selectedSlide) {
  if (!state.presentation) return false;
  const index = Math.max(-1, Math.min(afterIndex, state.presentation.slides.length - 1)) + 1;
  state.presentation.slides.splice(index, 0, slide);
  state.selectedSlide = index;
  state.dirty = true;
  return true;
}

export function duplicateSlide(state, slideIndex = state.selectedSlide) {
  const slide = state.presentation?.slides[slideIndex];
  return slide ? addSlide(state, clonePresentation({ slides: [slide] }).slides[0], slideIndex) : false;
}

export function removeSlide(state, slideIndex = state.selectedSlide) {
  if (!state.presentation || state.presentation.slides.length <= 1 || !state.presentation.slides[slideIndex]) return false;
  state.presentation.slides.splice(slideIndex, 1);
  state.selectedSlide = Math.min(slideIndex, state.presentation.slides.length - 1);
  state.dirty = true;
  return true;
}

export function moveSlide(state, slideIndex, direction) {
  if (!state.presentation) return false;
  const target = slideIndex + direction;
  if (slideIndex < 0 || target < 0 || target >= state.presentation.slides.length) return false;
  const slides = state.presentation.slides;
  [slides[slideIndex], slides[target]] = [slides[target], slides[slideIndex]];
  state.selectedSlide = target;
  state.dirty = true;
  return true;
}

export function createBlankSlide() {
  return { title: '新しいスライド', layout: 'content', bullets: ['要点を入力してください'] };
}

export function parseBulletText(value) {
  return String(value ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function serializePresentation(presentation) {
  return JSON.stringify(presentation ?? {}, null, 2);
}

