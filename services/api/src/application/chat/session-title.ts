const DEFAULT_TITLE = '新会话';
const MAX_TITLE_LENGTH = 50;

export function deriveSessionTitle(message: string, maxLength = MAX_TITLE_LENGTH): string {
  const normalized = message.trim().replace(/\s+/g, ' ');
  if (!normalized) return DEFAULT_TITLE;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function isDefaultSessionTitle(title: string): boolean {
  return !title.trim() || title.trim() === DEFAULT_TITLE;
}
