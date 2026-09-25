// js/territorioCache.js
// Caché persistente del JSON territorial usando IndexedDB.
//
// Beneficio: en visitas posteriores, el JSON de 7 MB no se descarga ni
// se vuelve a parsear desde cero. IndexedDB deserializa mucho más rápido
// que JSON.parse(), especialmente en móviles.

const DB_NAME = 'mision-arbol-cache';
const DB_VERSION = 1;
const STORE_NAME = 'territorio';
const CACHE_KEY = 'comunas_y_consejos';

/**
 * Cambiá esta versión si actualizás el JSON territorial
 * para invalidar el caché de los usuarios.
 */
const CACHE_VERSION = 'v1';

/**
 * Fecha de expiración del caché: 30 días.
 * Después de eso, se vuelve a descargar del servidor por las dudas.
 */
const CACHE_EXPIRACION_MS = 30 * 24 * 60 * 60 * 1000;

/* ==================== HELPERS ==================== */

function abrirDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      return reject(new Error('IndexedDB no disponible'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ==================== API PÚBLICA ==================== */

/**
 * Intenta obtener el JSON territorial desde IndexedDB.
 * @returns {Promise<Object|null>}
 */
export async function obtenerTerritorioCache() {
  try {
    const db = await abrirDB();

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(CACHE_KEY);

      req.onsuccess = () => {
        const data = req.result;
        if (!data) return resolve(null);
        if (data.version !== CACHE_VERSION) return resolve(null);

        // Verificar expiración
        const edad = Date.now() - (data.guardado || 0);
        if (edad > CACHE_EXPIRACION_MS) {
          return resolve(null);
        }

        resolve(data.json);
      };

      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    /* silencioso */
    return null;
  }
}

/**
 * Guarda el JSON territorial en IndexedDB.
 * @param {Object} json
 * @returns {Promise<boolean>}
 */
export async function guardarTerritorioCache(json) {
  try {
    const db = await abrirDB();

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const req = store.put({
        version: CACHE_VERSION,
        guardado: Date.now(),
        json
      }, CACHE_KEY);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    /* silencioso */
    return false;
  }
}

/**
 * Limpia el caché territorial (útil para debugging o migraciones).
 */
export async function limpiarTerritorioCache() {
  try {
    const db = await abrirDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(CACHE_KEY);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return false;
  }
}