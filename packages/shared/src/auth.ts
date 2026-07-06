export const AUTH_TOKEN_KEY = 'lingprism_auth_token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  teamId?: string | null;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}
