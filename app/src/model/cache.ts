import { DB_NAME as DETAIL_DB } from './localDb';

/** Utilidades de caché local (IndexedDB + localStorage) */

/** Limpia todo el caché y recarga la página */
export async function clearCacheAndReload(): Promise<void> {
  // 1) Borrar IndexedDB
  try {
    await clearIndexedDB();
  } catch (e) {
    console.warn('[cache] Error limpiando IndexedDB:', e);
  }

  // 2) Borrar localStorage (tema, animaciones, preferencias se conservan)
  try {
    const keepKeys = ['theme', 'animations'];
    const allKeys = Object.keys(localStorage);
    for (const key of allKeys) {
      if (!keepKeys.includes(key)) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {
    console.warn('[cache] Error limpiando localStorage:', e);
  }

  // 3) Recargar página para forzar descarga fresca
  location.reload();
}

/** Borra todas las bases de datos IndexedDB conocidas */
async function clearIndexedDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      resolve();
      return;
    }

    // Obtener nombres de todas las DBs
    let dbs: IDBDatabaseInfo[] = [];
    try {
      // indexedDB.databases() no está en todas partes, intentamos
      const dbsPromise = (window.indexedDB as any).databases?.();
      if (dbsPromise) {
        dbsPromise.then((list: IDBDatabaseInfo[]) => {
          dbs = list;
          deleteDbs(dbs).then(resolve).catch(reject);
        }).catch(() => {
          // Fallback: intentar borrar las conocidas
          deleteKnownDbs().then(resolve).catch(reject);
        });
        return;
      }
    } catch {
      // Ignorar
    }

    // Fallback: borrar las conocidas
    deleteKnownDbs().then(resolve).catch(reject);
  });
}

async function deleteDbs(dbs: IDBDatabaseInfo[]): Promise<void> {
  for (const dbInfo of dbs) {
    if (dbInfo.name) {
      await deleteDatabase(dbInfo.name);
    }
  }
}

async function deleteKnownDbs(): Promise<void> {
  // Nombres de DBs usados en la app (dk-detail es la BD activa; los demás son
  // restos de versiones antiguas que conviene limpiar).
  const knownNames = [DETAIL_DB, 'dokkan-guide-db', 'dokkan-guide', 'dokkan-fan-guide', 'units-db', 'offline-db'];
  for (const name of knownNames) {
    await deleteDatabase(name);
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      // Si está bloqueado, intentamos igual
      resolve();
    };
  });
}