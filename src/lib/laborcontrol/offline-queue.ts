// Offline queue for laborcontrol fichajes
// Uses IndexedDB store "laborcontrol_offline" with AES-GCM encryption
// Syncs to /api/laborcontrol/fichaje when the device regains connectivity

const DB_NAME    = 'laborcontrol';
const STORE_NAME = 'laborcontrol_offline';
const DB_VERSION = 1;
const AES_KEY_NAME = 'lc_aes_key';

export interface QueueEntry {
  localId: string;
  empleadoId: string;
  tipo: string;
  timestampEvento: string; // ISO 8601
  iv: string;              // base64 AES-GCM nonce
  ciphertext: string;      // base64 encrypted payload
  createdAt: string;
}

// ----------------------------------------------------------------
// AES-GCM key — persisted in IndexedDB under AES_KEY_NAME
// ----------------------------------------------------------------

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const existing = await idbGet<{ key: JsonWebKey }>(store, AES_KEY_NAME);
  if (existing) {
    return crypto.subtle.importKey('jwk', existing.key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('jwk', key);
  await idbPut(store, AES_KEY_NAME, { key: exported });
  await idbCommit(tx);
  return key;
}

// ----------------------------------------------------------------
// IndexedDB helpers
// ----------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbGet<T>(store: IDBObjectStore, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(store: IDBObjectStore, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put({ localId: key, ...value as object });
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function idbCommit(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

export async function enqueue(item: {
  empleadoId: string;
  tipo: string;
  timestampEvento: string;
}): Promise<void> {
  const key   = await getOrCreateKey();
  const iv    = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(item));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  const localId = crypto.randomUUID();

  const db    = await openDb();
  const tx    = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const entry: QueueEntry = {
    localId,
    empleadoId:      item.empleadoId,
    tipo:            item.tipo,
    timestampEvento: item.timestampEvento,
    iv:              b64(iv),
    ciphertext:      b64(cipher),
    createdAt:       new Date().toISOString(),
  };

  await new Promise<void>((resolve, reject) => {
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
  await idbCommit(tx);
}

export async function getQueueCount(): Promise<number> {
  const db    = await openDb();
  const tx    = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return new Promise<number>((resolve, reject) => {
    const req = store.count();
    // Exclude AES key entry
    req.onsuccess = () => resolve(Math.max(0, (req.result as number) - 1));
    req.onerror   = () => reject(req.error);
  });
}

export async function syncQueue(): Promise<void> {
  if (!navigator.onLine) return;

  const cryptoKey = await getOrCreateKey();
  const db    = await openDb();
  const tx    = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const allEntries = await new Promise<QueueEntry[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as QueueEntry[]).filter(e => e.localId !== AES_KEY_NAME));
    req.onerror   = () => reject(req.error);
  });

  for (const entry of allEntries) {
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(entry.iv).buffer as ArrayBuffer },
        cryptoKey,
        fromB64(entry.ciphertext).buffer as ArrayBuffer,
      );
      const payload = JSON.parse(new TextDecoder().decode(plain)) as {
        empleadoId: string;
        tipo: string;
        timestampEvento: string;
      };

      const res = await fetch('/api/laborcontrol/fichaje', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empleadoId:      payload.empleadoId,
          tipo:            payload.tipo,
          timestampEvento: payload.timestampEvento,
          origenOffline:   true,
        }),
      });

      if (res.ok || res.status === 409) {
        // 409 = already exists (idempotent) — safe to delete
        await new Promise<void>((resolve) => {
          const del = store.delete(entry.localId);
          del.onsuccess = () => resolve();
          del.onerror   = () => resolve(); // best-effort
        });
      }
    } catch {
      // Leave entry in queue — will retry next sync
    }
  }

  await idbCommit(tx);
}

// Register sync on reconnect
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void syncQueue(); });
}
