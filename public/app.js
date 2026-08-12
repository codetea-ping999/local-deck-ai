import { createOutline, deleteDocument, exportHtml, generatePresentation, loadModels, regenerateSlide as regenerateSlideRequest, renderPresentation, uploadDocument, validatePresentation } from './api.js';
import { createEditorHistory, addSlide, deleteSlide, duplicateSlide, moveSlide, readInspector, renderInspector } from './editor.js';
import { createInitialState, replacePresentation } from './state.js';
import { renderArtifact, renderCanvas, renderDocuments, renderProgress, renderQuality, renderSlideList, renderThemeStatus } from './render.js';
import { ensureOutputExtension, errorMessage, escapeHtml, loadStoredSettings, loadStoredTheme, mergeTheme, openBlob, parseJson, sanitizeThemeForServer, storeSettings, storeTheme, themeWarnings } from './utils.js';

const state = createInitialState();
state.history = null;
state.artifact = null;
const $ = (id) => document.getElementById(id);
const status = $('status');

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status${kind ? ` ${kind}` : ''}`;
}

function currentPresentation() {
  return state.history?.current() ?? state.presentation;
}

function clampSelectedSlide() {
  const count = state.presentation?.slides?.length ?? 0;
  state.selectedSlide = count ? Math.min(Math.max(state.selectedSlide, 0), count - 1) : 0;
}

function syncBusyControls() {
  document.querySelectorAll('[data-busy-control]').forEach((element) => { element.disabled = state.busy; });
}

function updateEditorControls() {
  const presentation = state.presentation;
  const count = presentation?.slides?.length ?? 0;
  const index = state.selectedSlide;
  document.querySelectorAll('[data-action="add-slide"]').forEach((element) => { element.disabled = state.busy || !presentation; });
  document.querySelectorAll('[data-action="duplicate-slide"]').forEach((element) => { element.disabled = state.busy || !presentation; });
  document.querySelectorAll('[data-action="delete-slide"]').forEach((element) => { element.disabled = state.busy || count <= 1; });
  document.querySelectorAll('[data-action="move-up"]').forEach((element) => { element.disabled = state.busy || !presentation || index <= 0; });
  document.querySelectorAll('[data-action="move-down"]').forEach((element) => { element.disabled = state.busy || !presentation || index >= count - 1; });
  document.querySelectorAll('[data-action="undo"]').forEach((element) => { element.disabled = state.busy || !state.history?.canUndo(); });
  document.querySelectorAll('[data-action="redo"]').forEach((element) => { element.disabled = state.busy || !state.history?.canRedo(); });
}

function renderAll({ writeJson = false } = {}) {
  clampSelectedSlide();
  renderDocuments($('document-list'), state.documents);
  renderSlideList($('slide-list'), state.presentation, state.selectedSlide);
  renderCanvas($('slide-canvas'), state.presentation, state.selectedSlide, state.theme);
  $('inspector').innerHTML = renderInspector(state.presentation?.slides?.[state.selectedSlide]);
  renderQuality($('quality'), state.quality);
  renderProgress($('progress'), state.generation);
  renderThemeStatus($('theme-status'), state.theme, state.themeSource, state.themeWarnings);
  renderArtifact($('artifact'), state.artifact);
  $('slide-count').textContent = `${state.presentation?.slides?.length ?? 0}枚${state.dirty ? ' · 未保存' : ''}`;
  if (writeJson) $('json').value = state.presentation ? JSON.stringify(state.presentation, null, 2) : '';
  syncBusyControls();
  updateEditorControls();
}

function resetPresentation(presentation, { selectedSlide = 0, dirty = false } = {}) {
  state.history = createEditorHistory(presentation);
  state.presentation = state.history.current();
  state.selectedSlide = selectedSlide;
  state.dirty = dirty;
  state.quality = null;
  state.artifact = null;
  renderAll({ writeJson: true });
}

function commitPresentation(presentation, selectedSlide = state.selectedSlide, message = '') {
  if (!state.history) state.history = createEditorHistory(presentation);
  state.presentation = state.history.commit(presentation);
  state.selectedSlide = selectedSlide;
  state.dirty = true;
  state.quality = null;
  state.artifact = null;
  renderAll({ writeJson: true });
  if (message) setStatus(message, 'success');
}

function undo() {
  if (!state.history?.canUndo()) return;
  state.presentation = state.history.undo();
  state.dirty = true;
  state.quality = null;
  clampSelectedSlide();
  renderAll({ writeJson: true });
  setStatus('Undoしました', 'success');
}

function redo() {
  if (!state.history?.canRedo()) return;
  state.presentation = state.history.redo();
  state.dirty = true;
  state.quality = null;
  clampSelectedSlide();
  renderAll({ writeJson: true });
  setStatus('Redoしました', 'success');
}

function setBusy(busy, message) {
  state.busy = busy;
  if (message) setStatus(message);
  syncBusyControls();
  updateEditorControls();
}

function settingsFromDom() {
  state.settings.host = $('host').value;
  state.settings.model = $('model').value;
  state.settings.slides = Number($('slides').value) || 8;
  state.settings.query = $('query').value;
  state.settings.embeddingModel = $('embedding-model').value;
  state.settings.strictQuality = $('strict-quality').checked;
  state.settings.format = $('format').value;
  state.settings.output = $('output').value;
  storeSettings(state.settings);
}

function applyStoredSettings() {
  const stored = { ...state.settings, ...loadStoredSettings() };
  state.settings = stored;
  $('host').value = stored.host;
  $('slides').value = stored.slides;
  $('query').value = stored.query;
  $('embedding-model').value = stored.embeddingModel;
  $('strict-quality').checked = stored.strictQuality === true;
  $('format').value = stored.format;
  $('output').value = stored.output;
}

async function refreshModels() {
  try {
    const result = await loadModels($('host').value);
    state.models = (result.models ?? []).map((model) => model.name ?? model).filter(Boolean);
    $('model').innerHTML = state.models.length ? state.models.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('') : '<option value="">モデルがありません</option>';
    if (state.settings.model && state.models.includes(state.settings.model)) $('model').value = state.settings.model;
    else if (state.models.length) $('model').value = state.models[0];
    settingsFromDom();
    setStatus(state.models.length ? `${state.models.length}モデル利用可能` : 'ollama pull <model> でモデルを追加してください', state.models.length ? 'success' : 'warning');
  } catch (error) { $('model').innerHTML = '<option value="">読み込み失敗</option>'; setStatus(errorMessage(error), 'error'); }
}

async function uploadFiles(files) {
  const accepted = files.filter((file) => {
    if (!/\.(md|markdown|mdx|txt|text|pdf|docx)$/i.test(file.name)) { setStatus(`${file.name}: 対応形式はMarkdown、TXT、PDF、DOCXです。`, 'error'); return false; }
    if (file.size > 10 * 1024 * 1024) { setStatus(`${file.name}: ファイルサイズ上限は10 MiBです。`, 'error'); return false; }
    return true;
  });
  if (!accepted.length) return;
  setBusy(true, '文書を抽出しています...');
  let loaded = 0;
  for (const file of accepted) {
    try { state.documents.push(await uploadDocument(file)); loaded += 1; renderAll(); }
    catch (error) { setStatus(`${file.name}: ${errorMessage(error)}`, 'error'); }
  }
  if (loaded) setStatus(`${loaded}件の文書を読み込みました`, 'success');
  setBusy(false);
}

async function createOutlineFromDocuments() {
  if (!state.documents.length) return generateFromPaste();
  settingsFromDom();
  if (!state.settings.model) { setStatus('モデルを指定してください', 'warning'); return; }
  setBusy(true, 'アウトラインを生成しています...');
  try {
    const result = await createOutline({ documentIds: state.documents.map((document) => document.id), query: state.settings.query, model: state.settings.model, host: state.settings.host, slides: state.settings.slides, embeddingModel: state.settings.embeddingModel, strictQuality: state.settings.strictQuality });
    resetPresentation(result.presentation);
    setStatus('レビュー可能なアウトラインを作成しました', 'success');
  } catch (error) { setStatus(errorMessage(error), 'error'); } finally { setBusy(false); }
}

async function generateFromPaste() {
  settingsFromDom();
  if (!$('content').value.trim() || !state.settings.model) { setStatus('文書とモデルを指定してください', 'warning'); return; }
  setBusy(true, 'スライドを生成しています...');
  state.generation = { phase: 'generating', percent: 0, logs: [], error: null };
  renderAll();
  try {
    const result = await generatePresentation({ content: $('content').value, name: $('file').files[0]?.name ?? 'browser-input.md', model: state.settings.model, host: state.settings.host, slides: state.settings.slides, strictQuality: state.settings.strictQuality, render: false }, (event) => {
      if (event.type === 'progress') { state.generation.percent = Number(event.percent ?? 0); state.generation.logs.push(event.message); renderAll(); }
    });
    if (!result.presentation) throw new Error('生成結果にPresentation JSONがありません。');
    state.generation = { phase: 'done', percent: 100, logs: [...state.generation.logs, '完了'], error: null };
    resetPresentation(result.presentation);
    setStatus('スライドを生成しました', 'success');
  } catch (error) { state.generation = { phase: 'error', percent: state.generation.percent, logs: [...state.generation.logs, errorMessage(error)], error: errorMessage(error) }; renderAll(); setStatus(errorMessage(error), 'error'); } finally { setBusy(false); }
}

function saveSelectedSlide() {
  const presentation = currentPresentation();
  const slide = presentation?.slides?.[state.selectedSlide];
  if (!slide) return;
  try {
    const nextSlide = readInspector(slide);
    const nextPresentation = { ...presentation, slides: presentation.slides.map((item, index) => index === state.selectedSlide ? nextSlide : item) };
    commitPresentation(nextPresentation, state.selectedSlide, 'スライドを保存しました');
  } catch (error) { setStatus(errorMessage(error), 'error'); }
}

async function regenerateSelectedSlide() {
  const presentation = currentPresentation();
  if (!presentation) return;
  try {
    const slide = readInspector(presentation.slides[state.selectedSlide]);
    const edited = { ...presentation, slides: presentation.slides.map((item, index) => index === state.selectedSlide ? slide : item) };
    state.presentation = state.history.commit(edited);
    state.dirty = true;
    renderAll({ writeJson: true });
    settingsFromDom();
    setBusy(true, 'スライドを再生成しています...');
    const result = await regenerateSlideRequest({ presentation: state.presentation, slideIndex: state.selectedSlide, layout: slide.layout, model: state.settings.model, host: state.settings.host });
    resetPresentation(result.presentation, { selectedSlide: state.selectedSlide });
    setStatus('スライドを再生成しました', 'success');
  } catch (error) { setStatus(errorMessage(error), 'error'); } finally { setBusy(false); }
}

async function validateCurrent() {
  const presentation = currentPresentation();
  if (!presentation) { setStatus('検証するPresentation JSONがありません', 'warning'); return; }
  try { const result = await validatePresentation(presentation); state.quality = result.quality ?? null; renderAll(); setStatus('Presentation JSONは有効です', 'success'); } catch (error) { setStatus(errorMessage(error), 'error'); }
}

async function previewCurrent() {
  const presentation = currentPresentation();
  if (!presentation) return;
  try { openBlob(await exportHtml(presentation, sanitizeThemeForServer(state.theme))); setStatus('HTMLプレビューを開きました', 'success'); } catch (error) { setStatus(errorMessage(error), 'error'); }
}

async function renderCurrent() {
  const presentation = currentPresentation();
  if (!presentation) return;
  settingsFromDom();
  setBusy(true, 'ファイルを書き出しています...');
  try {
    const format = state.settings.format;
    const result = await renderPresentation({ presentation, format, outputPath: ensureOutputExtension(state.settings.output, format), theme: sanitizeThemeForServer(state.theme) });
    state.artifact = result;
    state.dirty = false;
    renderAll();
    setStatus(`${format.toUpperCase()}を書き出しました`, 'success');
  } catch (error) { setStatus(errorMessage(error), 'error'); } finally { setBusy(false); }
}

function applyJson() {
  try { const presentation = parseJson($('json').value, 'Presentation JSON'); resetPresentation(presentation, { dirty: true }); setStatus('JSONを画面へ反映しました', 'success'); } catch (error) { setStatus(errorMessage(error), 'error'); }
}

async function exportCurrentJson() {
  const presentation = currentPresentation();
  if (!presentation) { setStatus('保存するPresentation JSONがありません', 'warning'); return; }
  settingsFromDom();
  const outputPath = ensureOutputExtension(state.settings.output, 'json');
  $('format').value = 'json';
  $('output').value = outputPath;
  settingsFromDom();
  setBusy(true, 'JSONを書き出しています...');
  try {
    state.artifact = await renderPresentation({ presentation, format: 'json', outputPath, theme: sanitizeThemeForServer(state.theme) });
    state.dirty = false;
    renderAll();
    setStatus('JSONを書き出しました', 'success');
  } catch (error) { setStatus(errorMessage(error), 'error'); }
  finally { setBusy(false); }
}

async function handleAction(action, element) {
  if (action === 'select-slide') { state.selectedSlide = Number(element.dataset.index); renderAll(); return; }
  if (action === 'add-slide') { const index = state.selectedSlide + 1; commitPresentation(addSlide(state.presentation, index), index, 'スライドを追加しました'); return; }
  if (action === 'duplicate-slide') { const index = state.selectedSlide + 1; commitPresentation(duplicateSlide(state.presentation, state.selectedSlide), index, 'スライドを複製しました'); return; }
  if (action === 'delete-slide') { if (!state.presentation || state.presentation.slides.length <= 1) return; const index = Math.min(state.selectedSlide, state.presentation.slides.length - 2); commitPresentation(deleteSlide(state.presentation, state.selectedSlide), index, 'スライドを削除しました'); return; }
  if (action === 'move-up' || action === 'move-down') { const offset = action === 'move-up' ? -1 : 1; const index = state.selectedSlide + offset; if (index >= 0 && index < state.presentation.slides.length) commitPresentation(moveSlide(state.presentation, state.selectedSlide, offset), index, offset < 0 ? 'スライドを上へ移動しました' : 'スライドを下へ移動しました'); return; }
  if (action === 'undo') { undo(); return; }
  if (action === 'redo') { redo(); return; }
  if (action === 'save-slide') { saveSelectedSlide(); return; }
  if (action === 'regenerate-slide') { await regenerateSelectedSlide(); return; }
  if (action === 'quality-issue') { if (element.dataset.index !== '') { state.selectedSlide = Number(element.dataset.index); renderAll(); } return; }
  if (action === 'remove-document') { try { await deleteDocument(element.dataset.id); state.documents = state.documents.filter((document) => document.id !== element.dataset.id); renderAll(); setStatus('文書を削除しました', 'success'); } catch (error) { setStatus(errorMessage(error), 'error'); } }
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
  if (target) { event.preventDefault(); void handleAction(target.dataset.action, target); }
});
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const target = event.target;
  const editing = target instanceof HTMLElement && (target.matches('input, textarea, select, [contenteditable="true"]') || target.isContentEditable);
  if (event.key.toLowerCase() === 's') { event.preventDefault(); saveSelectedSlide(); return; }
  if (editing) return;
  if (event.key.toLowerCase() === 'z' && event.shiftKey) { event.preventDefault(); redo(); }
  else if (event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
  else if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); void handleAction('move-up', document.body); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); void handleAction('move-down', document.body); }
});

$('file').addEventListener('change', () => uploadFiles([...$('file').files]));
$('drop').addEventListener('click', (event) => { if (event.target !== $('file')) $('file').click(); });
$('drop').addEventListener('dragover', (event) => { event.preventDefault(); $('drop').classList.add('dragging'); });
$('drop').addEventListener('dragleave', () => $('drop').classList.remove('dragging'));
$('drop').addEventListener('drop', (event) => { event.preventDefault(); $('drop').classList.remove('dragging'); void uploadFiles([...event.dataTransfer.files]); });
$('outline').onclick = () => void createOutlineFromDocuments();
$('generate').onclick = () => void generateFromPaste();
$('refresh').onclick = () => void refreshModels();
$('host').onchange = () => { settingsFromDom(); void refreshModels(); };
['slides', 'query', 'embedding-model', 'strict-quality', 'format', 'output', 'model'].forEach((id) => $(id).addEventListener('change', settingsFromDom));
$('validate').onclick = () => void validateCurrent();
$('preview').onclick = () => void previewCurrent();
$('render').onclick = () => void renderCurrent();
$('export-json').onclick = () => void exportCurrentJson();
$('json-apply').onclick = applyJson;
$('json-file').onchange = async () => { const file = $('json-file').files[0]; if (!file) return; try { $('json').value = await file.text(); applyJson(); } catch (error) { setStatus(errorMessage(error), 'error'); } };
$('theme-file').onchange = async () => { const file = $('theme-file').files[0]; if (!file) return; try { state.theme = mergeTheme(parseJson(await file.text(), 'テーマJSON')); state.themeSource = file.name; state.themeWarnings = themeWarnings(state.theme); storeTheme(state.theme); renderAll(); setStatus('テーマを読み込みました', 'success'); } catch (error) { setStatus(errorMessage(error), 'error'); } };
$('clear-theme').onclick = () => { state.theme = null; state.themeSource = null; state.themeWarnings = []; storeTheme(null); renderAll(); setStatus('テーマをリセットしました', 'success'); };
$('mobile-settings-toggle').onclick = () => $('mobile-settings').classList.toggle('open');
window.addEventListener('beforeunload', (event) => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });

applyStoredSettings();
state.theme = loadStoredTheme();
state.themeSource = state.theme ? '保存済みテーマ' : null;
state.themeWarnings = themeWarnings(state.theme);
renderAll({ writeJson: true });
void refreshModels();
