/**
 * Snapshot local del último listado conocido de cocina/bar.
 *
 * PROBLEMA QUE RESUELVE
 * `/kitchen`, `/waiter/kitchen` y `/waiter/bar` arrancan con `items = []` y
 * dependen de un fetch de red bloqueante. En un arranque en frío de la tablet
 * Android con wifi lenta, la cocina ve "sin pedidos" durante segundos — que es
 * visualmente idéntico a "no hay nada pendiente". Es el peor falso negativo
 * posible en una cocina en hora punta.
 *
 * POR QUÉ HAY TTL
 * Un snapshot viejo es peor que una pantalla vacía: un cocinero podría rehacer
 * un plato ya servido. Solo se hidrata si el snapshot es reciente; pasado el
 * TTL se descarta y se espera al servidor. Es deliberadamente conservador.
 *
 * No toca Realtime: solo cambia el estado inicial. Los canales, sus nombres y
 * su ciclo de vida quedan intactos.
 */

const DB_NAME = 'kitchen_snapshot';
const DB_VERSION = 1;
const STORE = 'snapshots';

/** Pasado este margen el snapshot se considera no fiable y no se hidrata. */
export const SNAPSHOT_TTL_MS = 30 * 60 * 1000; // 30 min

interface SnapshotRecord<T> {
  scope: string;
  items: T[];
  savedAt: number;
}

function openSnapshotDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'scope' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persiste el listado actual. `scope` separa las vistas entre sí
 * ('kitchen', 'waiter-kitchen', 'waiter-bar') porque su forma de item difiere.
 */
export async function saveKitchenSnapshot<T>(scope: string, items: T[]): Promise<void> {
  try {
    const db = await openSnapshotDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const record: SnapshotRecord<T> = { scope, items, savedAt: Date.now() };
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB no disponible (modo privado, cuota) — el snapshot es una
    // optimización, nunca una dependencia.
  }
}

/** Devuelve el último listado guardado, o null si no hay o si excedió el TTL. */
export async function loadKitchenSnapshot<T>(scope: string): Promise<T[] | null> {
  try {
    const db = await openSnapshotDB();
    return await new Promise<T[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(scope);
      tx.oncomplete = () => {
        const rec = req.result as SnapshotRecord<T> | undefined;
        if (!rec) { resolve(null); return; }
        if (Date.now() - rec.savedAt > SNAPSHOT_TTL_MS) { resolve(null); return; }
        resolve(rec.items);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return null;
  }
}
