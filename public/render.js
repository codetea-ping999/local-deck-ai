import { escapeAttribute, escapeHtml, formatBytes, mergeTheme } from './utils.js';

function color(value, fallback) {
  return /^[0-9a-f]{6}$/i.test(String(value ?? '')) ? `#${value}` : fallback;
}

export function renderDocuments(container, documents) {
  if (!documents.length) {
    container.innerHTML = '<p class="empty compact-empty">まだ文書がありません。ファイルをドロップするか、下の入力欄へ貼り付けてください。</p>';
    return;
  }
  container.innerHTML = documents.map((document) => `<div class="document-row"><div class="document-icon">${escapeHtml(document.kind.toUpperCase().slice(0, 4))}</div><div class="document-info"><strong>${escapeHtml(document.name)}</strong><small>${escapeHtml(document.kind)} · ${formatBytes(document.bytes)}</small></div><button class="icon-button" data-action="remove-document" data-id="${escapeAttribute(document.id)}" aria-label="${escapeAttribute(document.name)}を削除">×</button></div>`).join('');
}

export function renderSlideList(container, presentation, selectedSlide) {
  const slides = presentation?.slides ?? [];
  if (!slides.length) {
    container.innerHTML = '<p class="empty compact-empty">生成するとスライドが表示されます。</p>';
    return;
  }
  container.innerHTML = slides.map((slide, index) => `<button class="slide-item${index === selectedSlide ? ' selected' : ''}" data-action="select-slide" data-index="${index}" aria-current="${index === selectedSlide ? 'true' : 'false'}"><span class="slide-number">${String(index + 1).padStart(2, '0')}</span><span class="slide-item-body"><strong>${escapeHtml(slide.title || '無題')}</strong><small>${escapeHtml(slide.layout || 'content')}</small></span><span class="slide-item-arrow">${index === selectedSlide ? '●' : ''}</span></button>`).join('');
}

export function renderCanvas(container, presentation, selectedSlide, themeValue) {
  const theme = mergeTheme(themeValue);
  const slide = presentation?.slides?.[selectedSlide];
  if (!slide) {
    container.innerHTML = '<div class="canvas-empty"><span class="canvas-empty-icon">✦</span><strong>スライドを生成してください</strong><small>左ペインから文書を追加し、アウトライン生成を実行します。</small></div>';
    return;
  }
  const total = presentation.slides.length;
  const body = renderSlideBody(slide, theme);
  const citations = slide.citations?.length ? `<div class="canvas-citations">出典: ${slide.citations.map((item) => `${escapeHtml(item.source)}${item.page ? ` p.${item.page}` : ''}`).join(' · ')}</div>` : '';
  container.innerHTML = `<div class="slide-stage" style="--slide-ink:${color(theme.colors.ink, '#111827')};--slide-muted:${color(theme.colors.muted, '#6B7280')};--slide-line:${color(theme.colors.line, '#E5E7EB')};--slide-accent:${color(theme.colors.accent, '#2563EB')};--slide-canvas:${color(theme.colors.canvas, '#FFFFFF')};--slide-surface:${color(theme.colors.surface, '#F9FAFB')};--slide-font:${escapeAttribute(theme.fontFace)};--slide-heading:${escapeAttribute(theme.headingFontFace)}"><div class="slide-topline"><span>${escapeHtml(presentation.title)}</span><span>${selectedSlide + 1} / ${total}</span></div><div class="slide-content"><div class="slide-layout-label">${escapeHtml(slide.layout || 'content')}</div><h2>${escapeHtml(slide.title)}</h2>${slide.subtitle ? `<p class="slide-subtitle">${escapeHtml(slide.subtitle)}</p>` : ''}${body}${citations}</div><div class="slide-footer"><span>${escapeHtml(theme.footer || presentation.title)}</span><span>${escapeHtml(presentation.audience || 'Local Deck AI')}</span></div></div>`;
}

function renderSlideBody(slide, theme) {
  const bullets = slide.bullets ?? [];
  switch (slide.layout) {
    case 'title': return `<div class="preview-title-body"><p>${escapeHtml(slide.subtitle || presentationFallback(slide))}</p></div>`;
    case 'comparison': {
      const columns = slide.columns?.length ? slide.columns : [{ heading: 'Before', items: bullets.slice(0, 3) }, { heading: 'After', items: bullets.slice(3, 6) }];
      return `<div class="comparison-preview">${columns.slice(0, 2).map((column) => `<div class="comparison-column"><h3>${escapeHtml(column.heading)}</h3>${bulletList(column.items)}</div>`).join('')}</div>`;
    }
    case 'process': return `<div class="process-preview">${(slide.steps?.length ? slide.steps : bullets).slice(0, 5).map((step, index) => `<div class="process-step"><span>${index + 1}</span><p>${escapeHtml(step)}</p></div>`).join('<i class="process-arrow">›</i>')}</div>`;
    case 'table': return slide.table ? `<div class="table-wrap"><table><thead><tr>${slide.table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${slide.table.rows.slice(0, 12).map((row) => `<tr>${row.slice(0, slide.table.headers.length).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : bulletList(bullets);
    case 'timeline': return `<div class="timeline-preview">${(slide.timeline ?? []).map((item) => `<div class="timeline-item"><strong>${escapeHtml(item.date)}</strong><span>${escapeHtml(item.label)}</span>${item.description ? `<small>${escapeHtml(item.description)}</small>` : ''}</div>`).join('')}</div>`;
    case 'key-message': return `<div class="key-message-preview">${escapeHtml(slide.keyMessage || bullets[0] || '')}</div>`;
    case 'agenda': return `<div class="agenda-preview">${(bullets.length ? bullets : slide.steps ?? []).slice(0, 8).map((item, index) => `<div><b>${String(index + 1).padStart(2, '0')}</b><span>${escapeHtml(item)}</span></div>`).join('')}</div>`;
    case 'summary': return `<div class="summary-preview">${bulletList(bullets, true)}</div>`;
    case 'content': default: return bulletList(bullets);
  }
}

function presentationFallback(slide) {
  return slide.keyMessage || slide.bullets?.[0] || 'レビュー用スライド';
}

function bulletList(items, large = false) {
  if (!items?.length) return '<p class="preview-placeholder">本文を入力してください。</p>';
  return `<ul class="preview-bullets${large ? ' large' : ''}">${items.slice(0, 8).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

export function renderQuality(container, quality) {
  if (!quality || (!quality.errors?.length && !quality.warnings?.length)) {
    container.innerHTML = '<div class="quality-ok"><span>✓</span><div><strong>品質チェック待ち</strong><small>保存または検証すると、文字量や構造を確認します。</small></div></div>';
    return;
  }
  const issues = [...(quality.errors ?? []), ...(quality.warnings ?? [])];
  container.innerHTML = `<div class="quality-summary ${quality.valid ? 'warning' : 'error'}"><strong>${quality.valid ? '確認が必要な項目があります' : '修正が必要です'}</strong><span>${issues.length}件</span></div><div class="quality-list">${issues.map((issue) => `<button class="quality-issue ${issue.severity}" data-action="quality-issue" data-index="${issue.slideIndex ?? ''}"><span>${issue.severity === 'error' ? '!' : '△'}</span><span>${escapeHtml(issue.message)}</span></button>`).join('')}</div>`;
}

export function renderProgress(container, generation) {
  const percent = Math.max(0, Math.min(100, Number(generation?.percent ?? 0)));
  container.innerHTML = `<div class="progress-meta"><span>${generation?.phase === 'idle' ? '準備完了' : generation?.phase === 'done' ? '完了' : generation?.phase === 'error' ? 'エラー' : '処理中'}</span><strong>${percent}%</strong></div><div class="progress-track"><i style="width:${percent}%"></i></div><ol class="progress-log">${(generation?.logs ?? []).map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ol>`;
}

export function renderArtifact(container, artifact) {
  if (!artifact) { container.innerHTML = ''; return; }
  container.innerHTML = `<div class="artifact-result"><div><strong>${escapeHtml(artifact.format.toUpperCase())}を書き出しました</strong><small>${escapeHtml(artifact.outputPath)}</small></div><a class="button" href="${escapeAttribute(artifact.downloadUrl)}" download>ダウンロード</a></div>`;
}

export function renderThemeStatus(container, theme, sourceName, warnings) {
  if (!theme) { container.innerHTML = '<span class="muted">デフォルトテーマ</span>'; return; }
  const accent = color(theme.colors?.accent, '#2563EB');
  container.innerHTML = `<span class="theme-swatch" style="background:${accent}"></span><span>${escapeHtml(sourceName || 'カスタムテーマ')}</span>${warnings?.length ? `<span class="warning-dot" title="${escapeAttribute(warnings.join('\n'))}">!</span>` : ''}`;
}

