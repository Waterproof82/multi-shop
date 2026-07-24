// Electron-only PIN cache for laborcontrol offline authentication
// Uses electron-store (via IPC) key "lc_pin_cache" with bcryptjs (work factor 12)
// Rate limit: 4 attempts per 30 seconds per empleadoId

import bcrypt from 'bcryptjs';

const WORK_FACTOR     = 12;
const RATE_LIMIT      = 4;
const RATE_WINDOW_MS  = 30_000;

interface AttemptRecord {
  count: number;
  windowStart: number;
}

// In-memory attempt tracker (resets on app restart, intentionally)
const attempts = new Map<string, AttemptRecord>();

function isRateLimited(empleadoId: string): boolean {
  const now = Date.now();
  const rec = attempts.get(empleadoId);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    attempts.set(empleadoId, { count: 0, windowStart: now });
    return false;
  }
  return rec.count >= RATE_LIMIT;
}

function incrementAttempts(empleadoId: string): void {
  const now = Date.now();
  const rec = attempts.get(empleadoId);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    attempts.set(empleadoId, { count: 1, windowStart: now });
  } else {
    rec.count += 1;
  }
}

function resetAttempts(empleadoId: string): void {
  attempts.delete(empleadoId);
}

// ----------------------------------------------------------------
// electron-store bridge (IPC)
// Required: main process exposes window.electronAPI.lcPinStore
// ----------------------------------------------------------------

interface LcPinStore {
  get(empleadoId: string): Promise<string | undefined>;
  set(empleadoId: string, hash: string): Promise<void>;
  delete(empleadoId: string): Promise<void>;
}

function getPinStore(): LcPinStore {
  const store = window.electronAPI?.lcPinStore;
  if (typeof window === 'undefined' || !store) {
    throw new Error('PIN cache only available in Electron');
  }
  return store;
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/** Store a PIN hash for offline verification */
export async function cachePin(empleadoId: string, pin: string): Promise<void> {
  const hash = await bcrypt.hash(pin, WORK_FACTOR);
  await getPinStore().set(empleadoId, hash);
}

/** Verify a PIN against the cached hash — returns true if match */
export async function verifyPinOffline(empleadoId: string, pin: string): Promise<boolean> {
  if (isRateLimited(empleadoId)) {
    throw new Error('Demasiados intentos. Espera 30 segundos.');
  }

  incrementAttempts(empleadoId);
  const store = getPinStore();
  const hash = await store.get(empleadoId);
  if (!hash) return false;

  const ok = await bcrypt.compare(pin, hash);
  if (ok) resetAttempts(empleadoId);
  return ok;
}

/** Remove a cached PIN (e.g. after successful online sync or offboarding) */
export async function clearPinCache(empleadoId: string): Promise<void> {
  await getPinStore().delete(empleadoId);
  resetAttempts(empleadoId);
}
