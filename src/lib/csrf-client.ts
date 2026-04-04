const CSRF_STORAGE_KEY = 'csrf_token';

export function saveCsrfToken(token: string): void {
  if (globalThis.window !== undefined) {
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  }
}

export function getCsrfToken(): string | null {
  if (globalThis.window !== undefined) {
    // Prefer reading from the cookie — it is always in sync across tabs.
    // Cookie format: "token:signature"; we only need the token part for the header.
    const cookieEntry = document.cookie.split(';').find(c => c.trim().startsWith('csrf_token='));
    if (cookieEntry) {
      const raw = decodeURIComponent(cookieEntry.split('=').slice(1).join('='));
      const token = raw.split(':')[0];
      if (token) return token;
    }
    // Fallback: sessionStorage (populated right after login before cookie is readable)
    return sessionStorage.getItem(CSRF_STORAGE_KEY);
  }
  return null;
}

export function clearCsrfToken(): void {
  if (globalThis.window !== undefined) {
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

function calculateRetryDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.random() * 0.1 * delay; // Add up to 10% jitter
  return delay + jitter;
}

async function attemptFetchWithRetry(
  url: string,
  options: RequestInit,
  attempt: number,
  maxRetries: number,
  retryOn: (response: Response) => boolean,
  baseDelay: number,
  maxDelay: number
): Promise<Response> {
  const response = await fetch(url, options);

  // If it's a successful response or not a retryable error, return it
  if (response.ok || !retryOn(response)) {
    return response;
  }

  // If this is the last attempt, return the response anyway
  if (attempt === maxRetries) {
    return response;
  }

  // Wait before retrying
  const totalDelay = calculateRetryDelay(attempt, baseDelay, maxDelay);
  await new Promise(resolve => setTimeout(resolve, totalDelay));

  return null as any; // Will be retried
}

async function getCsrfTokenWithFallback(): Promise<string | null> {
  let csrfToken = getCsrfToken();
  if (!csrfToken && globalThis.window !== undefined) {
    await ensureCsrfToken();
    csrfToken = getCsrfToken();
  }
  return csrfToken;
}

function buildCsrfHeaders(csrfToken: string | null, existingHeaders?: HeadersInit): Headers {
  const headers = new Headers(existingHeaders);
  headers.set('Content-Type', 'application/json');
  if (csrfToken) {
    headers.set('x-csrf-token', csrfToken);
  }
  return headers;
}

async function handleFetchError(error: unknown, attempt: number, maxRetries: number, baseDelay: number, maxDelay: number): Promise<void> {
  if (error instanceof DOMException && error.name === 'AbortError') {
    throw error;
  }
  if (attempt === maxRetries) {
    throw error instanceof Error ? error : new Error('Unknown fetch error');
  }
  const totalDelay = calculateRetryDelay(attempt, baseDelay, maxDelay);
  await new Promise(resolve => setTimeout(resolve, totalDelay));
}

async function executeWithRetry(
  url: string,
  requestOptions: RequestInit,
  maxRetries: number,
  baseDelay: number,
  maxDelay: number,
  retryOn: (response: Response) => boolean
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await attemptFetchWithRetry(url, requestOptions, attempt, maxRetries, retryOn, baseDelay, maxDelay);
      if (result) return result;
    } catch (error) {
      await handleFetchError(error, attempt, maxRetries, baseDelay, maxDelay);
    }
  }
  throw new Error('Request failed after all retries');
}

export async function fetchWithCsrf(
  url: string,
  options: RequestInit = {},
  retryOptions: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    retryOn?: (response: Response) => boolean;
  } = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    retryOn = (response: Response) => response.status >= 500 || response.status === 429
  } = retryOptions;

  const isMutative = ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method ?? 'GET').toUpperCase());

  const csrfToken = await getCsrfTokenWithFallback();
  const headers = buildCsrfHeaders(csrfToken, options.headers);
  const requestOptions = { ...options, headers };

  const response = await executeWithRetry(url, requestOptions, maxRetries, baseDelay, maxDelay, retryOn);

  // If we got a 403 on a mutative request the CSRF cookie may have expired
  // (cookie maxAge is 1h, session can last 24h). Refresh the token and retry once.
  if (response.status === 403 && isMutative) {
    clearCsrfToken();
    const freshToken = await ensureCsrfToken();
    if (freshToken) {
      const retryHeaders = buildCsrfHeaders(freshToken, options.headers);
      return fetch(url, { ...options, headers: retryHeaders });
    }
  }

  return response;
}
