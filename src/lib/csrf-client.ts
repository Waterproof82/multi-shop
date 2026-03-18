const CSRF_STORAGE_KEY = 'csrf_token';

export function saveCsrfToken(token: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  }
}

export function getCsrfToken(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem(CSRF_STORAGE_KEY);
  }
  return null;
}

export function clearCsrfToken(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

export async function ensureCsrfToken(): Promise<string | null> {
  let token = getCsrfToken();
  
  if (!token) {
    try {
      const res = await fetch('/api/admin/login', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data.csrfToken) {
          saveCsrfToken(data.csrfToken);
          token = data.csrfToken;
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
    }
  }
  
  return token;
}

export async function fetchWithCsrf(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let csrfToken = getCsrfToken();
  
  if (!csrfToken && typeof window !== 'undefined') {
    await ensureCsrfToken();
    csrfToken = getCsrfToken();
  }

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  
  if (csrfToken) {
    headers.set('x-csrf-token', csrfToken);
  }

  try {
    return await fetch(url, {
      ...options,
      headers,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw error;
  }
}
