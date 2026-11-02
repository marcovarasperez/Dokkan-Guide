/**
 * Transporte HTTP hacia dokkaninfo.com (fuente única de datos, Fase 9).
 *
 * Protección contra el bloqueo de Cloudflare (solución definitiva al 403):
 *  - set de cabeceras VERIFICADO (UA + Accept-Language, el mismo que curl
 *    envía y que se comprobó con 200 en oct-2026); client-hints añadidos
 *    (sec-ch-ua / sec-fetch-*) empeoraban el score y se descartaron;
 *  - reintentos (3) con espera exponencial y `Retry-After` ante 403/429;
 *  - espaciado mínimo (~900 ms) entre peticiones a la fuente (rate-limit).
 *
 * Además bloquea el <img> directo dentro de la WebView (ORB), así que las
 * imágenes se piden por el transporte nativo y se muestran como blob.
 *
 *  - en desarrollo (Vite) se usa un proxy local (/dinfo → curl.exe, ver
 *    vite.config.ts — el TLS de Node recibe 403, curl no);
 *  - en Tauri (Windows) se usa el plugin nativo http (@tauri-apps/plugin-http);
 *  - en Capacitor (Android) se usa el plugin nativo `OkHttp` (HTTP/2, ver
 *    app/android/.../OkHttpPlugin.java) y, si el APK no lo incluye, el HTTP
 *    nativo de core (CapacitorHttp, HTTP/1.1 → 403 de Cloudflare);
 *  - en web (sin shell) se usa fetch simple (solo sirve si hay proxy o CORS).
 *
 * Los transportes nativos se importan de forma dinámica: los chunks solo se
 * descargan cuando la app corre dentro del shell correspondiente (coste 0 en web).
 */

import type { HttpOptions } from '@capacitor/core';

const INFO_SOURCE = 'https://dokkaninfo.com';
const INFO_DEV_PREFIX = '/dinfo';
const INFO_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/**
 * Plugin nativo `OkHttp` (app/android/.../OkHttpPlugin.java). Expone la MISMA
 * API que `CapacitorHttp.request` y, de paso, `protocol` ("http/2.0"), que es
 * lo que distingue una petición aceptada por Cloudflare de un 403.
 */
interface OkHttpPlugin {
  request(options: HttpOptions): Promise<OkHttpResponse>;
}

/** Instancia cacheada del plugin (se registra una sola vez por sesión). */
let okHttpPlugin: OkHttpPlugin | undefined;

/** Respuesta del transporte de Android (el `protocol` solo lo añade OkHttpPlugin). */
interface OkHttpResponse {
  status: number;
  headers?: Record<string, string>;
  data?: unknown;
  protocol?: string;
}

interface NativeGlobals {
  __TAURI_INTERNALS__?: unknown;
  Capacitor?: { isNativePlatform?: () => boolean };
}

/** URL a la que pedir una ruta de dokkaninfo (en dev/preview, vía proxy local). */
function infoUrl(path: string): string {
  // En desarrollo y en `vite preview` (localhost) el proxy del servidor es el
  // único camino: el navegador no puede hablar con dokkaninfo.com (CORS). En
  // el empaquetado manda el transporte nativo y se pide el origen directo.
  if (import.meta.env.DEV || isLocalhost()) return `${INFO_DEV_PREFIX}${path}`;
  return `${INFO_SOURCE}${path}`;
}

/** ¿Está la app servida por el servidor local (dev o preview)? */
function isLocalhost(): boolean {
  if (typeof location === 'undefined') return false;
  const g = globalThis as NativeGlobals;
  if (g.__TAURI_INTERNALS__ || g.Capacitor?.isNativePlatform?.()) return false;
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

/** Set VERIFICADO de cabeceras que dokkaninfo acepta (200 con curl, oct-2026). */
const INFO_HEADERS: Record<string, string> = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'user-agent': INFO_UA,
};

/** Error HTTP con el código y la espera sugerida por el servidor (Retry-After). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status} en ${path}`);
    this.name = 'HttpError';
  }
}

/** `Retry-After`: segundos o fecha HTTP → milisegundos. */
function parseRetryAfter(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espaciado mínimo entre peticiones a la fuente (evita el rate-limit). */
let lastInfoRequestAt = 0;
const INFO_MIN_GAP_MS = 900;
async function pace(): Promise<void> {
  const wait = lastInfoRequestAt + INFO_MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastInfoRequestAt = Date.now();
}

/**
 * Hasta 3 intentos ante 403/429 (bloqueo/rate-limit transitorio): espera
 * exponencial (2 s, 4 s) o la que indique el servidor (Retry-After).
 */
async function withRetries<T>(fn: () => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof HttpError && (e.status === 403 || e.status === 429);
      if (!retryable || attempt === MAX_ATTEMPTS) throw e;
      await sleep(Math.min(e.retryAfterMs ?? 2000 * 2 ** (attempt - 1), 30000));
    }
  }
  throw lastErr;
}

/** Respuesta cruda del transporte activo (texto o blob bajo demanda). */
interface HttpPayload {
  status: number;
  retryAfterMs?: number;
  text(): Promise<string>;
  blob(): Promise<Blob>;
}

/** Convierte el `data` de CapacitorHttp (Blob | ArrayBuffer | Uint8Array | base64) a Blob. */
function capacitorDataToBlob(data: unknown): Blob {
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return new Blob([data], { type: 'image/png' });
  if (data instanceof Uint8Array)
    return new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], {
      type: 'image/png',
    });
  if (typeof data === 'string') {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
  }
  throw new Error('Respuesta binaria no reconocida');
}

/** GET unificado sobre el transporte activo (Tauri / Capacitor / fetch). */
async function transportGet(url: string, timeoutMs: number, headers: Record<string, string>, responseType: 'text' | 'blob' = 'text'): Promise<HttpPayload> {
  const g = globalThis as NativeGlobals;

  // Tauri (producción Windows).
  if (g.__TAURI_INTERNALS__) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const res = await tauriFetch(url, { headers });
    return {
      status: res.status,
      retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
      text: () => res.text(),
      blob: () => res.blob(),
    };
  }

  // Capacitor (producción Android).
  if (g.Capacitor?.isNativePlatform?.()) {
    // `CapacitorHttp` usa HttpURLConnection, que SOLO habla HTTP/1.1 →
    // Cloudflare responde 403 y la ficha cae a «Sin conexión». El plugin
    // nativo `OkHttp` (mismo formato de opciones/respuesta) negocia HTTP/2 por
    // ALPN y la fuente contesta 200. Si el APK no lo lleva (versión antigua),
    // se mantiene el transporte de core como último recurso.
    const { Capacitor, CapacitorHttp, registerPlugin } = await import('@capacitor/core');
    const useOkHttp = Capacitor.isPluginAvailable('OkHttp');
    // `registerPlugin` se llama una sola vez (si no, core avisa "already registered").
    if (useOkHttp && !okHttpPlugin) okHttpPlugin = registerPlugin<OkHttpPlugin>('OkHttp');
    const options: HttpOptions = {
      method: 'GET',
      url,
      headers,
      // `HttpOptions` NO acepta `timeout`: solo `readTimeout`/`connectTimeout`
      // (ver core-plugins.d.ts). Con `timeout` la petición quedaba SIN tope de
      // tiempo en Android y una conexión colgada dejaba la ficha en "cargando".
      readTimeout: timeoutMs,
      connectTimeout: timeoutMs,
      responseType,
    };

    console.log('[http] request:', url, '| transporte:', useOkHttp ? 'OkHttp' : 'CapacitorHttp', '| responseType:', responseType);
    try {
      const res: OkHttpResponse = useOkHttp && okHttpPlugin
        ? await okHttpPlugin.request(options)
        : await CapacitorHttp.request(options);
      console.log('[http] response:', res.status, '| protocolo:', res.protocol ?? 'n/d');
      const retryAfter = res.headers?.['retry-after'] ?? res.headers?.['Retry-After'];
      return {
        status: res.status,
        retryAfterMs: parseRetryAfter(retryAfter ?? null),
        text: async () => (typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '')),
        blob: async () => capacitorDataToBlob(res.data),
      };
    } catch (e) {
      console.error('[http] error:', e);
      throw e;
    }
  }

  // Desarrollo (proxy) o fetch simple: mismo tope de tiempo si el runtime lo permite.
  const timeoutSignal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(timeoutMs) : undefined;
  const res = await fetch(url, { headers, signal: timeoutSignal, cache: 'no-cache' });
  return {
    status: res.status,
    retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
    text: () => res.text(),
    blob: () => res.blob(),
  };
}

const isOk = (status: number): boolean => status >= 200 && status < 300;

/**
 * Descarga texto desde dokkaninfo.com (espaciado + reintentos). Cualquier fallo
 * se propaga para que el llamante muestre su estado (caché).
 */
export async function fetchInfoText(path: string): Promise<string> {
  // El catálogo /cards pesa ~12 MB: en 4G un timeout corto fallaba.
  const timeoutMs = path === '/cards' ? 120000 : 60000;
  return withRetries(async () => {
    await pace();
    const p = await transportGet(infoUrl(path), timeoutMs, INFO_HEADERS);
    if (!isOk(p.status)) throw new HttpError(p.status, path, p.retryAfterMs);
    return await p.text();
  });
}

/**
 * Descarga BINARIO de dokkaninfo (misma vía y reintentos que `fetchInfoText`).
 *
 * Usado por la animación de la carta: el motor LWF carga su .lwf por XHR
 * directo, que en el navegador queda bloqueado por CORS (dokkaninfo no envía
 * Access-Control-Allow-Origin). Descargamos el archivo con nuestro transporte
 * (proxy en dev, nativo en Tauri/Capacitor) y se lo entregamos ya montado.
 */
export async function fetchInfoBytes(path: string, timeoutMs = 30000): Promise<ArrayBuffer> {
  return withRetries(async () => {
    await pace();
    const p = await transportGet(infoUrl(path), timeoutMs, INFO_HEADERS, 'blob');
    if (!isOk(p.status)) throw new HttpError(p.status, path, p.retryAfterMs);
    const buf = await p.blob();
    const bytes = new Uint8Array(await buf.arrayBuffer());
    // Un 200 con HTML de bloqueo (Cloudflare) arruinaría la animación: se
    // valida la firma "LWF\0" de la cabecera antes de devolver los bytes.
    if (bytes.length < 8 || bytes[0] !== 0x4c || bytes[1] !== 0x57 || bytes[2] !== 0x46) {
      throw new HttpError(403, path);
    }
    return bytes.buffer;
  });
}

/**
 * Descarga una IMAGEN de dokkaninfo como URL de objeto (blob).
 *
 * Motivo: el <img> directo a dokkaninfo.com queda bloqueado por ORB dentro del
 * WebView (el servidor contesta con su página HTML de bloqueo en lugar del PNG
 * porque la referencia no es de su dominio). En cambio, una petición con el
 * set de cabeceras verificado hecha por el transporte nativo SÍ devuelve los bytes.
 */
export async function fetchInfoImage(fullUrl: string): Promise<string> {
  let path: string;
  if (fullUrl.startsWith(`${INFO_SOURCE}/`)) path = fullUrl.slice(INFO_SOURCE.length);
  else if (fullUrl.startsWith(`${INFO_DEV_PREFIX}/`)) path = fullUrl.slice(INFO_DEV_PREFIX.length);
  else return fullUrl; // URL ajena a dokkaninfo: se usa tal cual

  return withRetries(async () => {
    await pace();
    const p = await transportGet(infoUrl(path), 20000, INFO_HEADERS, 'blob');
    if (!isOk(p.status)) throw new HttpError(p.status, path, p.retryAfterMs);
    const blob = await p.blob();
    if (!(await isImagePayload(blob))) {
      // Un 200 con el HTML de bloqueo de Cloudflare (o un cuerpo vacío) no es
      // la imagen: se lanza como 403 para que withRetries reintente, en lugar
      // de cachear un blob que el <img> no podría decodificar.
      throw new HttpError(403, path);
    }
    return URL.createObjectURL(blob);
  });
}

/** ¿Los primeros bytes corresponden a un formato de imagen (no a HTML)? */
async function isImagePayload(blob: Blob): Promise<boolean> {
  if (blob.size < 12) return false;
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const gif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x57;
  const avif = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
  return png || jpeg || gif || webp || avif;
}
