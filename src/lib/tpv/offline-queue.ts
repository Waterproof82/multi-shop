import type { MetodoPago } from '@/core/domain/entities/tpv-types';
import { fetchWithCsrf } from '@/lib/csrf-client';

const DB_NAME = 'tpv_offline';
const STORE_NAME = 'cobros_queue';
const DB_VERSION = 1;

export interface OfflineCobroEntry {
  id: string;
  sesionId: string;
  mesaNumero: number;
  metodoPago: MetodoPago;
  importeCobradoCents: number;
  propinaCents: number;
  descuentoCents: number;
  operadorNombre: string;
  turnoId: string;
  empresaId: string;
  ivaPorcentaje: number;
  ts: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOfflineCobro(entry: OfflineCobroEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineQueue(): Promise<OfflineCobroEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as OfflineCobroEntry[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueueCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Guard de reentrada: el flush se dispara desde el header (siempre montado) y
 *  desde CobroFlow. Sin esto, ambos podrían postear la misma entrada a la vez. */
let flushInFlight: Promise<void> | null = null;

/**
 * Sube los cobros encolados offline y los borra de IndexedDB al confirmarse.
 * Vive aquí y no en CobroFlow para que se pueda invocar desde cualquier punto
 * de /tpv/*: antes solo corría si la pantalla de cobro estaba montada, así que
 * un cobro hecho offline podía quedarse sin sincronizar hasta reabrirla.
 */
export async function flushOfflineQueue(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    const entries = await getOfflineQueue();
    if (entries.length === 0) return;

    const res = await fetchWithCsrf('/api/tpv/sync-offline', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) return;

    const { results } = (await res.json()) as { results: { id: string; status: string }[] };
    for (const r of results) {
      if (r.status === 'ok' || r.status === 'revision') {
        await removeFromQueue(r.id);
      }
    }
  })().finally(() => { flushInFlight = null; });
  return flushInFlight;
}

/**
 * Pide al navegador que marque el almacenamiento como persistente (OFF-11).
 * Sin esto, el WebView de Android puede evictar `tpv_offline` bajo presión de
 * memoria y perder cobros encolados. Idempotente y seguro de llamar siempre.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
