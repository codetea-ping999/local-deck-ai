import { errorMessage, formatJsonParseError } from './utils.js';

async function parseResponse(response) {
  const type = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (type.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(formatJsonParseError(text, error, 'JSON応答'));
    }
  }
  return text;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(`${data?.error ?? data ?? `リクエストに失敗しました (${response.status})`}${data?.hint ? `\nヒント: ${data.hint}` : ''}`);
  return data;
}

export function loadModels(host) {
  return requestJson(`/api/models?host=${encodeURIComponent(host)}`);
}

export function uploadDocument(file) {
  const body = new FormData();
  body.append('file', file);
  return requestJson('/api/documents', { method: 'POST', body });
}

export async function deleteDocument(id) {
  const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    const data = await parseResponse(response);
    throw new Error(data?.error ?? `文書の削除に失敗しました (${response.status})`);
  }
}

export function createOutline(payload) {
  return requestJson('/api/outline', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
}

export function regenerateSlide(payload) {
  return requestJson('/api/slides/regenerate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
}

export function validatePresentation(presentation) {
  return requestJson('/api/validate-presentation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ presentation }) });
}

export async function generatePresentation(payload, onEvent) {
  const response = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok && !response.body) {
    const data = await parseResponse(response);
    throw new Error(data?.error ?? `生成に失敗しました (${response.status})`);
  }
  if (!response.body) throw new Error('生成サーバーからストリームを受け取れませんでした。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result = null;
  const consume = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new Error(formatJsonParseError(line, error, '生成サーバーの応答'));
    }
    onEvent?.(event);
    if (event.type === 'error') throw new Error(`${event.error}${event.hint ? `\nヒント: ${event.hint}` : ''}`);
    if (event.type === 'done') result = event;
  };
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      pending += decoder.decode(chunk.value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      lines.forEach(consume);
    }
    pending += decoder.decode();
    consume(pending);
  } catch (error) {
    throw new Error(errorMessage(error));
  }
  if (!result) throw new Error('生成結果を受け取れませんでした。');
  return result;
}

export async function exportHtml(presentation, theme) {
  const response = await fetch('/api/export-html', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ presentation, theme }) });
  if (!response.ok) {
    const data = await parseResponse(response);
    throw new Error(data?.error ?? 'HTMLプレビューの生成に失敗しました。');
  }
  return response.blob();
}

export function renderPresentation(payload) {
  return requestJson('/api/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
}
