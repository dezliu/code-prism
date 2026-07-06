export const APP_NAME = '灵镜 LingPrism';

export const ROLES = ['employee', 'admin', 'leader', 'executive'] as const;
export type Role = (typeof ROLES)[number];

export {
  AUTH_TOKEN_KEY,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  type AuthUser,
  type LoginResponse,
} from './auth';

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
