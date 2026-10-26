/**
 * Base de datos local única de la app (IndexedDB) — "dk-detail".
 *
 * Concentra TODO el dato de dokkaninfo en un solo sitio, 100% local en el
 * dispositivo. Sin metadatos sensibles: solo datos del juego y, en `meta`,
 * dos timestamps internos de control (throttle de sincronización) que no
 * identifican a nadie ni salen de aquí.
 *
 *   details  → ficha completa por unidad   (clave `u{id}`)
 *   units    → resumen sincronizado        (clave id)
 *   meta     → estado de sincronización    (clave 'sync')
 *   fresh    → reservada (el badge "NUEVA" se deriva de las fechas del contenido)
 *   news     → noticias de dokkaninfo      (clave libre: 'index' | 'bodies')
 *   events   → eventos del juego           (clave libre por sección)
 *   banners  → histórico de banners        (clave libre)
 *
 * Se conserva el nombre y la versión previa (`dk-detail` v1 solo con
 * `details`): al subir a v2 se crean las tiendas nuevas sin tocar la caché
 * de fichas existente.
 *
 * Todas las operaciones son best-effort: si IndexedDB no está disponible
 * (modo privado, cuota, navegador antiguo) devuelven null/false y el
 * llamador cae a localStorage o a la red, como siempre.
 */

export const DB_NAME = 'dk-detail';
const DB_VERSION = 2; // v2: + units/meta/fresh/news/events/banners

export const STORE_DETAILS = 'details';
export const STORE_UNITS = 'units';
export const STORE_META = 'meta';
export const STORE_FRESH = 'fresh';
export const STORE_NEWS = 'news';
export const STORE_EVENTS = 'events';
export const STORE_BANNERS = 'banners';

const ALL_STORES = [
  STORE_DETAILS,
  STORE_UNITS,
  STORE_META,
  STORE_FRESH,
  STORE_NEWS,
  STORE_EVENTS,
  STORE_BANNERS,
];

let dbPromise: Promise<IDBDatabase> | null = null;

/** Abre (o reabre tras un error) la BD, creando las tiendas que falten. */
export function openLocalDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const name of ALL_STORES) {
          if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Base de datos bloqueada por otra pestaña'));
    } catch (e) {
      reject(e instanceof Error ? e : new Error('IndexedDB no disponible'));
    }
  });
  // Si falla, permitir un reintento en la próxima operación.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Lee una clave. null si no existe o la BD no está disponible. */
export async function dbGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  try {
    const db = await openLocalDb();
    return await new Promise((resolve) => {
      const rq = db.transaction(store, 'readonly').objectStore(store).get(key);
      rq.onsuccess = () => resolve((rq.result as T) ?? null);
      rq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Escribe una clave. true si se persistió; false si la BD no va. */
export async function dbSet<T>(store: string, key: IDBValidKey, value: T): Promise<boolean> {
  try {
    const db = await openLocalDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** Lee todas las filas de una tienda. null si la BD no está disponible. */
export async function dbGetAll<T>(store: string): Promise<T[] | null> {
  try {
    const db = await openLocalDb();
    return await new Promise((resolve) => {
      const rq = db.transaction(store, 'readonly').objectStore(store).getAll();
      rq.onsuccess = () => resolve((rq.result as T[]) ?? []);
      rq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Borra una clave. true si la operación se completó (aunque no existiera). */
export async function dbDelete(store: string, key: IDBValidKey): Promise<boolean> {
  try {
    const db = await openLocalDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** Vacía una tienda entera. true si la operación se completó. */
export async function dbClear(store: string): Promise<boolean> {
  try {
    const db = await openLocalDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}
