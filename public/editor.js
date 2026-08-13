import { LAYOUTS } from './types.js';
import { escapeHtml, parseJson } from './utils.js';
import { parseBulletText } from './state.js';

function inputField(label, id, value = '', hint = '') {
  return `<label class="field"><span>${escapeHtml(label)}</span><input id="${id}" value="${escapeHtml(value)}">${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</label>`;
}

function textField(label, id, value = '', className = '', hint = '') {
  return `<label class="field"><span>${escapeHtml(label)}</span><textarea id="${id}" class="${className}">${escapeHtml(value)}</textarea>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</label>`;
}

function jsonField(label, id, value, hint) {
  return textField(label, id, value ? JSON.stringify(value, null, 2) : '', 'code-field', hint);
}

export function renderInspector(slide) {
  if (!slide) return '<div class="empty inspector-empty"><strong>スライドを選択してください</strong><span>中央のサムネイルから編集対象を選べます。</span></div>';
  const layout = slide.layout ?? 'content';
  const advanced = [];
  if (layout === 'comparison') advanced.push(jsonField('比較カラム', 'inspector-columns', slide.columns, '例: [{"heading":"Before","items":["..."]}]'));
  if (layout === 'process') advanced.push(textField('プロセスステップ', 'inspector-steps', (slide.steps ?? []).join('\n'), 'compact', '1行に1ステップ'));
  if (layout === 'table') advanced.push(jsonField('テーブル', 'inspector-table', slide.table, 'headers と rows を持つJSON'));
  if (layout === 'timeline') advanced.push(jsonField('タイムライン', 'inspector-timeline', slide.timeline, 'date、label、description を持つ配列'));
  if (layout === 'key-message') advanced.push(inputField('キーメッセージ', 'inspector-key-message', slide.keyMessage ?? ''));
  if (slide.citations?.length || layout === 'content' || layout === 'summary') advanced.push(jsonField('出典', 'inspector-citations', slide.citations, 'source、quote、page を持つ配列'));

  return `<div class="inspector-form">
    ${inputField('タイトル', 'inspector-title', slide.title)}
    ${inputField('サブタイトル', 'inspector-subtitle', slide.subtitle ?? '')}
    <label class="field"><span>レイアウト</span><select id="inspector-layout">${LAYOUTS.map((item) => `<option value="${item}"${item === layout ? ' selected' : ''}>${item}</option>`).join('')}</select></label>
    ${textField('本文（1行1箇条書き）', 'inspector-bullets', (slide.bullets ?? []).join('\n'), 'compact', '最大6項目を推奨')}
    ${advanced.join('')}
    ${textField('話者ノート', 'inspector-notes', slide.speakerNotes ?? '', 'compact')}
    <div class="inspector-actions"><button data-action="save-slide">スライドを保存</button><button class="secondary" data-action="regenerate-slide">AIで再生成</button></div>
  </div>`;
}

function readOptionalText(id) {
  const value = document.getElementById(id)?.value.trim() ?? '';
  return value || undefined;
}

function readOptionalJson(id, label) {
  const value = document.getElementById(id)?.value.trim() ?? '';
  return value ? parseJson(value, label) : undefined;
}

export function readInspector(slide) {
  if (!slide) throw new Error('編集するスライドを選択してください。');
  const title = document.getElementById('inspector-title')?.value.trim() ?? '';
  if (!title) throw new Error('スライドタイトルを入力してください。');
  const next = {
    ...slide,
    title,
    layout: document.getElementById('inspector-layout')?.value || slide.layout || 'content',
    bullets: parseBulletText(document.getElementById('inspector-bullets')?.value ?? ''),
    subtitle: readOptionalText('inspector-subtitle'),
    speakerNotes: readOptionalText('inspector-notes')
  };
  const optionalJsonFields = [
    ['inspector-columns', '比較カラム'],
    ['inspector-table', 'テーブル'],
    ['inspector-timeline', 'タイムライン'],
    ['inspector-citations', '出典']
  ];
  for (const [id, label] of optionalJsonFields) {
    if (document.getElementById(id)) {
      const key = id.replace('inspector-', '').replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      const value = readOptionalJson(id, label);
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
  }
  if (document.getElementById('inspector-steps')) {
    const value = parseBulletText(document.getElementById('inspector-steps').value);
    if (value.length) next.steps = value; else delete next.steps;
  }
  if (document.getElementById('inspector-key-message')) {
    const value = readOptionalText('inspector-key-message');
    if (value) next.keyMessage = value; else delete next.keyMessage;
  }
  return next;
}

const DEFAULT_SLIDE = Object.freeze({ title: '新しいスライド', layout: 'content', bullets: [] });
export const EDITOR_HISTORY_LIMIT = 50;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertPresentation(presentation) {
  if (!presentation || typeof presentation !== 'object' || !Array.isArray(presentation.slides)) throw new TypeError('Presentation must contain a slides array.');
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createDefaultSlide() {
  return clone(DEFAULT_SLIDE);
}

export function addSlide(presentation, index = presentation?.slides?.length ?? 0, slide = createDefaultSlide()) {
  assertPresentation(presentation);
  const next = clone(presentation);
  const insertionIndex = clamp(Number.isInteger(index) ? index : next.slides.length, 0, next.slides.length);
  next.slides.splice(insertionIndex, 0, clone(slide));
  return next;
}

export function duplicateSlide(presentation, index) {
  assertPresentation(presentation);
  if (!Number.isInteger(index) || index < 0 || index >= presentation.slides.length) return clone(presentation);
  return addSlide(presentation, index + 1, presentation.slides[index]);
}

export function deleteSlide(presentation, index) {
  assertPresentation(presentation);
  if (presentation.slides.length <= 1 || !Number.isInteger(index) || index < 0 || index >= presentation.slides.length) return clone(presentation);
  const next = clone(presentation);
  next.slides.splice(index, 1);
  return next;
}

export function moveSlide(presentation, index, offset) {
  assertPresentation(presentation);
  if (!Number.isInteger(index) || !Number.isInteger(offset) || offset === 0 || index < 0 || index >= presentation.slides.length) return clone(presentation);
  const targetIndex = index + offset;
  if (targetIndex < 0 || targetIndex >= presentation.slides.length) return clone(presentation);
  const next = clone(presentation);
  const [slide] = next.slides.splice(index, 1);
  next.slides.splice(targetIndex, 0, slide);
  return next;
}

export function createEditorHistory(initialPresentation, limit = EDITOR_HISTORY_LIMIT) {
  assertPresentation(initialPresentation);
  const historyLimit = Number.isInteger(limit) && limit > 0 ? limit : EDITOR_HISTORY_LIMIT;
  let current = clone(initialPresentation);
  let past = [];
  let future = [];
  return {
    current: () => clone(current),
    commit(nextPresentation) {
      assertPresentation(nextPresentation);
      if (sameSnapshot(current, nextPresentation)) return clone(current);
      past.push(clone(current));
      if (past.length > historyLimit) past.shift();
      current = clone(nextPresentation);
      future = [];
      return clone(current);
    },
    undo() {
      if (!past.length) return clone(current);
      future.push(clone(current));
      current = past.pop();
      return clone(current);
    },
    redo() {
      if (!future.length) return clone(current);
      past.push(clone(current));
      if (past.length > historyLimit) past.shift();
      current = future.pop();
      return clone(current);
    },
    reset(nextPresentation) {
      assertPresentation(nextPresentation);
      current = clone(nextPresentation);
      past = [];
      future = [];
      return clone(current);
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    pastLength: () => past.length,
    futureLength: () => future.length
  };
}
