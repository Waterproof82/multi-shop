import type { Category, Product } from '@/core/domain/entities/types';

const DB_NAME = 'tpv_catalog';
const DB_VERSION = 1;
const SNAPSHOT_KEY = 'snapshot';

function openCatalogDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface CatalogConfig {
  tipoImpuesto: 'iva' | 'igic';
  porcentajeImpuesto: number;
}

interface ProductsRecord { key: string; items: Product[] }
interface CategoriesRecord { key: string; items: Category[] }
interface ConfigRecord { key: string; tipoImpuesto: 'iva' | 'igic'; porcentajeImpuesto: number }

export interface CatalogSnapshot {
  products: Product[];
  categories: Category[];
  config: CatalogConfig;
}

export async function saveCatalogToIDB(
  products: Product[],
  categories: Category[],
  config: CatalogConfig,
): Promise<void> {
  const db = await openCatalogDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'categories', 'config'], 'readwrite');
    tx.objectStore('products').put({ key: SNAPSHOT_KEY, items: products });
    tx.objectStore('categories').put({ key: SNAPSHOT_KEY, items: categories });
    tx.objectStore('config').put({ key: SNAPSHOT_KEY, ...config });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadCatalogFromIDB(): Promise<CatalogSnapshot | null> {
  try {
    const db = await openCatalogDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['products', 'categories', 'config'], 'readonly');
      const pReq = tx.objectStore('products').get(SNAPSHOT_KEY);
      const cReq = tx.objectStore('categories').get(SNAPSHOT_KEY);
      const cfgReq = tx.objectStore('config').get(SNAPSHOT_KEY);
      tx.oncomplete = () => {
        const p = pReq.result as ProductsRecord | undefined;
        const c = cReq.result as CategoriesRecord | undefined;
        const cfg = cfgReq.result as ConfigRecord | undefined;
        if (p === undefined || c === undefined || cfg === undefined) {
          resolve(null);
          return;
        }
        resolve({
          products: p.items,
          categories: c.items,
          config: { tipoImpuesto: cfg.tipoImpuesto, porcentajeImpuesto: cfg.porcentajeImpuesto },
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return null;
  }
}
