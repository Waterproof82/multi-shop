const KEY = 'order_tracking_tokens';

export function getTrackingTokens(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    // Migrate legacy single-token key
    const legacy = localStorage.getItem('last_order_tracking');
    return legacy ? [legacy] : [];
  } catch {
    return [];
  }
}

export function addTrackingToken(token: string): void {
  const tokens = getTrackingTokens().filter(t => t !== token);
  tokens.unshift(token); // newest first
  localStorage.setItem(KEY, JSON.stringify(tokens.slice(0, 5)));
  localStorage.removeItem('last_order_tracking'); // remove legacy key
}

export function removeTrackingToken(token: string): void {
  const tokens = getTrackingTokens().filter(t => t !== token);
  localStorage.setItem(KEY, JSON.stringify(tokens));
}
