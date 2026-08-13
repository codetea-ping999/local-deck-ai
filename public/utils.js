import { DEFAULT_THEME } from './types.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes ?? 0} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 0; value >= 1024 && index < units.length - 1; index += 1) {
    value /= 1024;
    unit = units[index + 1];
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

export function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Unknown error');
}

export function parseJson(value, label = 'JSON') {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label}を読み込めません: ${errorMessage(error)}`);
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) throw new Error('プレビューを開けませんでした。ポップアップを許可してください。');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ensureOutputExtension(value, format) {
  const extension = `.${format}`;
  const input = String(value ?? '').trim() || `deck${extension}`;
  return /\.(pptx|html|pdf|json)$/i.test(input) ? input.replace(/\.(pptx|html|pdf|json)$/i, extension) : `${input}${extension}`;
}

export function mergeTheme(theme) {
  const input = theme && typeof theme === 'object' ? theme : {};
  return {
    ...DEFAULT_THEME,
    ...input,
    colors: { ...DEFAULT_THEME.colors, ...(input.colors ?? {}) }
  };
}

export function sanitizeThemeForServer(theme) {
  const resolved = mergeTheme(theme);
  const logoPath = resolved.logo?.path ?? resolved.logoPath;
  if (logoPath && !String(logoPath).startsWith('data:') && !/^[a-zA-Z]:[\\/]|^\//.test(String(logoPath))) {
    const { logo: _logo, logoPath: _logoPath, ...withoutLogo } = resolved;
    return withoutLogo;
  }
  return resolved;
}

export function themeWarnings(theme) {
  const logoPath = theme?.logo?.path ?? theme?.logoPath;
  return logoPath && !String(logoPath).startsWith('data:') && !/^[a-zA-Z]:[\\/]|^\//.test(String(logoPath))
    ? ['相対パスのロゴはブラウザから解決できないため、出力時には除外されます。']
    : [];
}

const SETTINGS_KEY = 'local-deck-ai.settings.v1';
const THEME_KEY = 'local-deck-ai.theme.v1';

export function loadStoredSettings() {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'); } catch { return {}; }
}

export function storeSettings(settings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadStoredTheme() {
  if (typeof localStorage === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(THEME_KEY) ?? 'null'); } catch { return null; }
}

export function storeTheme(theme) {
  if (typeof localStorage === 'undefined') return;
  if (theme) localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  else localStorage.removeItem(THEME_KEY);
}
