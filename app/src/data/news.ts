import { signal } from '@preact/signals';
import { fetchInfoText } from './http';
import { extractNewsBody, parseNewsList } from './dinfo';
import { fetchNewsFromFyi } from './fyi';
import { dbGet, dbSet, STORE_NEWS } from './localDb';

/**
 * Noticias — fuente: dokkaninfo.com (Fase 9).
 *
 * - Listado: /news con `v-bind:news_json` (paginator, ~9 por página). Se
 *   refrescan las primeras páginas dentro del ciclo de sincronización
 *   (1 vez por apertura, ≥15 min, fallo silencioso).
 * - Cuerpo: cada noticia es SSR (/news/{id}); el bloque del artículo se
 *   extrae con extractNewsBody y se sanea en la vista (imágenes vía ORB,
 *   enlaces de evento re-mapeados a deep-links in-app).
 * - Caché en la base de datos local (store `news`) leída al arrancar →
 *   apertura instantánea y offline; seed empaquetado (news.seed.json) para
 *   la primera apertura sin red. La caché previa de localStorage se migra
 *   una sola vez y queda como respaldo si IndexedDB no está disponible.
 */

interface NewsBody {
  id: number;
  image: string | null;
  description: string; // HTML de la fuente (se sanea en la vista)
}

interface NewsItem {
  id: number;
  title: string;
  summary: string;
  banner: string | null;
  startAt: string | null;
  /** Chips de categoría (texto del seed legado; dokkaninfo no los publica). */
  category: string | null;
  tab: string | null;
  bodies: NewsBody[];
  /** Cuerpo completo del artículo (dokkaninfo; null hasta abrir la noticia). */
  bodyHtml: string | null;
  /** 'dk' = listado de dokkaninfo · 'fyi' = respaldo dokkan.fyi (cuerpos en línea)
   *  · 'seed' = empaquetado (solo visual, sin fetch). */
  source: 'dk' | 'fyi' | 'seed';
}

interface NewsCache {
  news: NewsItem[];
  updatedAt: number | null;
}

interface NewsState {
  cache: NewsCache | null;
  refreshing: boolean;
  failed: boolean;
}

export const newsState = signal<NewsState>({ cache: null, refreshing: false, failed: false });

const CACHE_KEY = 'dk.news.v3';
const BODY_CACHE_KEY = 'dk.newsbodies.v3';
const BODY_CACHE_MAX = 20;
/** Páginas de /news que se descargan en cada refresco (9 noticias por página). */
const REFRESH_PAGES = 4;

/* ---------- Caché en la base de datos local (store `news`) ---------- */

function readCacheLegacy(): NewsCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NewsCache;
    if (!Array.isArray(parsed?.news)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function readCache(): Promise<NewsCache | null> {
  const inDb = await dbGet<NewsCache>(STORE_NEWS, 'index');
  if (inDb && Array.isArray(inDb.news)) return inDb;
  const legacy = readCacheLegacy();
  if (legacy) void dbSet(STORE_NEWS, 'index', legacy); // migración (una vez)
  return legacy;
}

function writeCacheLegacy(cache: NewsCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* almacenamiento lleno: se sigue sin caché persistente */
  }
}

async function writeCache(cache: NewsCache): Promise<void> {
  if (!(await dbSet(STORE_NEWS, 'index', cache))) writeCacheLegacy(cache);
}

/* ---------- Seed empaquetado (primera apertura offline) ---------- */

interface SeedItem {
  id?: number;
  title?: string;
  banner?: string | null;
  summary?: string;
  startAt?: string | null;
  category?: string | null;
  tab?: string | null;
  bodies?: { id?: number; image?: string | null; description?: string }[];
}

let seedPromise: Promise<void> | null = null;

/** Carga el seed solo si no hay nada que mostrar (primera apertura sin red). */
export function loadSeedIfEmpty(): Promise<void> {
  seedPromise ??= (async () => {
    const cached = await readCache();
    if (cached) {
      newsState.value = { ...newsState.value, cache: cached };
      return;
    }
    try {
      const res = await fetch('/data/news.seed.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const seed = (await res.json()) as { news?: SeedItem[] };
      const news: NewsItem[] = (seed.news ?? []).map((n) => ({
        id: n.id ?? 0,
        title: n.title ?? '',
        summary: n.summary ?? '',
        banner: n.banner ?? null,
        startAt: n.startAt ?? null,
        category: n.category ?? null,
        tab: n.tab ?? null,
        bodies: (n.bodies ?? []).map((b) => ({ id: b.id ?? 0, image: b.image ?? null, description: b.description ?? '' })),
        bodyHtml: null,
        source: 'seed' as const,
      }));
      if (news.length) {
        const cache: NewsCache = { news, updatedAt: null };
        newsState.value = { ...newsState.value, cache };
        await writeCache(cache);
      }
    } catch {
      /* sin seed: la vista muestra su estado vacío */
    }
  })();
  return seedPromise;
}

/* ---------- Refresco (dentro del ciclo de sync) ---------- */

const toItem = (row: { id: number; title: string; summary: string; banner: string | null; startAt: number | null }): NewsItem => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  banner: row.banner,
  startAt: row.startAt ? new Date(row.startAt * 1000).toISOString() : null,
  category: null,
  tab: null,
  bodies: [],
  bodyHtml: null,
  source: 'dk' as const,
});

/** Descarga las primeras páginas del listado y actualiza la caché. */
export async function refreshNews(): Promise<void> {
  const state = newsState.value;
  if (state.refreshing) return;
  newsState.value = { ...state, refreshing: true };
  try {
    const first = parseNewsList(await fetchInfoText('/news'));
    const pages = [first];
    const extra = Math.min(Math.max(first.lastPage, 1), REFRESH_PAGES) - 1;
    if (extra > 0) {
      const results = await Promise.allSettled(
        Array.from({ length: extra }, (_, i) => fetchInfoText(`/news?page=${i + 2}`).then(parseNewsList)),
      );
      for (const r of results) if (r.status === 'fulfilled') pages.push(r.value);
    }
    const seen = new Set<number>();
    const items: NewsItem[] = [];
    for (const p of pages) {
      for (const row of p.items) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        items.push(toItem(row));
      }
    }
    items.sort((a, b) => (a.startAt ?? '') < (b.startAt ?? '') ? 1 : -1);
    if (items.length) {
      const cache: NewsCache = { news: items, updatedAt: Date.now() };
      newsState.value = { cache, refreshing: false, failed: false };
      await writeCache(cache);
      return;
    }
    newsState.value = { ...newsState.value, refreshing: false };
  } catch (e) {
    // Respaldo dokkan.fyi (mismo datamine que la semilla; sin Cloudflare):
    // anuncios con el cuerpo en línea, como el seed empaquetado.
    console.warn('[news] Listado dokkaninfo no disponible:', e instanceof Error ? e.message : String(e));
    try {
      const fyiItems = await fetchNewsFromFyi();
      if (fyiItems.length) {
        const news: NewsItem[] = fyiItems
          .map((n) => ({
            id: n.id,
            title: n.title,
            summary: n.summary,
            banner: n.banner,
            startAt: n.startAt,
            category: n.category,
            tab: n.tab,
            bodies: n.bodies,
            bodyHtml: null,
            source: 'fyi' as const,
          }))
          .sort((a, b) => (a.startAt ?? '') < (b.startAt ?? '') ? 1 : -1);
        const cache: NewsCache = { news, updatedAt: Date.now() };
        newsState.value = { cache, refreshing: false, failed: false };
        await writeCache(cache);
        return;
      }
      const hasContent = (newsState.value.cache?.news.length ?? 0) > 0;
      newsState.value = { ...newsState.value, refreshing: false, failed: !hasContent };
    } catch {
      const hasContent = (newsState.value.cache?.news.length ?? 0) > 0;
      newsState.value = { ...newsState.value, refreshing: false, failed: !hasContent };
    }
  }
}

/* ---------- Cuerpo de la noticia (perezoso, cacheado) ---------- */

let bodyMem = new Map<number, string | null>();

async function bodyCacheRead(): Promise<Record<string, string | null>> {
  const inDb = await dbGet<Record<string, string | null>>(STORE_NEWS, 'bodies');
  if (inDb && typeof inDb === 'object') return inDb;
  let legacy: Record<string, string | null> = {};
  try {
    legacy = JSON.parse(localStorage.getItem(BODY_CACHE_KEY) ?? '{}') as Record<string, string | null>;
  } catch {
    legacy = {};
  }
  if (legacy && typeof legacy === 'object' && Object.keys(legacy).length) {
    void dbSet(STORE_NEWS, 'bodies', legacy); // migración (una vez)
  }
  return legacy;
}

async function bodyCacheWrite(id: number, html: string | null): Promise<void> {
  try {
    const all = await bodyCacheRead();
    all[String(id)] = html;
    const keys = Object.keys(all);
    if (keys.length > BODY_CACHE_MAX) {
      keys.slice(0, keys.length - BODY_CACHE_MAX).forEach((k) => delete all[k]);
    }
    if (await dbSet(STORE_NEWS, 'bodies', all)) return;
    try {
      localStorage.setItem(BODY_CACHE_KEY, JSON.stringify(all));
    } catch {
      /* best-effort */
    }
  } catch {
    /* best-effort */
  }
}

/** Descarga (o recupera) el cuerpo de una noticia de dokkaninfo. */
export async function fetchNewsBody(id: number): Promise<string | null> {
  if (bodyMem.has(id)) return bodyMem.get(id) ?? null;
  const cached = (await bodyCacheRead())[String(id)];
  if (typeof cached === 'string') {
    bodyMem.set(id, cached);
    return cached;
  }
  const html = await fetchInfoText(`/news/${id}`);
  const body = extractNewsBody(html);
  bodyMem.set(id, body);
  await bodyCacheWrite(id, body);
  return body;
}

/* ---------- Utilidades de estado ---------- */

export function newsStatusText(): string {
  const s = newsState.value;
  if (s.refreshing) return 'Actualizando…';
  if (s.failed) return 'Sin conexión';
  const at = s.cache?.updatedAt;
  if (!at) return 'Datos empaquetados';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return 'Al día';
  if (mins < 60) return `Al día · hace ${mins} min`;
  return `Al día · hace ${Math.round(mins / 60)} h`;
}
