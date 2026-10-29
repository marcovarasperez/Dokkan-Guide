import { signal } from '@preact/signals';
import { fetchInfoText } from './http';
import { extractNewsBody, parseNewsList } from './dinfo';
import { parseEpoch } from './date';

/**
 * Noticias — fuente: dokkaninfo.com (Fase 9).
 *
 * - Listado: /news con `v-bind:news_json` (paginator, ~9 por página). Se
 *   refrescan las primeras páginas dentro del ciclo de sincronización
 *   (1 vez por apertura, ≥15 min, fallo silencioso).
 * - Cuerpo: cada noticia es SSR (/news/{id}); el bloque del artículo se
 *   extrae con extractNewsBody y se sanea en la vista (imágenes vía ORB,
 *   enlaces de evento re-mapeados a deep-links in-app).
 * - En memoria únicamente (sin persistencia local).
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
  /** Época en segundos (epoch) — se formatea en la vista con formatDate. */
  startAt: number | null;
  /** Chips de categoría (texto del seed legado; dokkaninfo no los publica). */
  category: string | null;
  tab: string | null;
  bodies: NewsBody[];
  /** Cuerpo completo del artículo (dokkaninfo; null hasta abrir la noticia). */
  bodyHtml: string | null;
  /** 'dk' = listado de dokkaninfo · 'seed' = empaquetado (solo visual, sin fetch). */
  source: 'dk' | 'seed';
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

/** Páginas de /news que se descargan en cada refresco (9 noticias por página). */
const REFRESH_PAGES = 4;

/* ---------- Seed empaquetado (primera apertura) ---------- */

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

/** Carga el seed solo si no hay nada que mostrar (primera apertura). */
export function loadSeedIfEmpty(): Promise<void> {
  seedPromise ??= (async () => {
    if (newsState.value.cache?.news.length) return;
    try {
      const res = await fetch('/data/news.seed.json');
      if (!res.ok) return;
      const seed = (await res.json()) as { news?: SeedItem[] };
      const news: NewsItem[] = (seed.news ?? []).map((n) => ({
        id: n.id ?? 0,
        title: n.title ?? '',
        summary: n.summary ?? '',
        banner: n.banner ?? null,
        startAt: parseEpoch(n.startAt),
        category: n.category ?? null,
        tab: n.tab ?? null,
        bodies: (n.bodies ?? []).map((b) => ({ id: b.id ?? 0, image: b.image ?? null, description: b.description ?? '' })),
        bodyHtml: null,
        source: 'seed' as const,
      }));
      if (news.length) {
        newsState.value = { ...newsState.value, cache: { news, updatedAt: null } };
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
  startAt: row.startAt,
  category: null,
  tab: null,
  bodies: [],
  bodyHtml: null,
  source: 'dk' as const,
});

/** Descarga las primeras páginas del listado y actualiza el estado. */
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
      newsState.value = { cache: { news: items, updatedAt: Date.now() }, refreshing: false, failed: false };
      return;
    }
    newsState.value = { ...newsState.value, refreshing: false };
  } catch (e) {
    console.warn('[news] Listado dokkaninfo no disponible:', e instanceof Error ? e.message : String(e));
    const hasContent = (newsState.value.cache?.news.length ?? 0) > 0;
    newsState.value = { ...newsState.value, refreshing: false, failed: !hasContent };
  }
}

/* ---------- Cuerpo de la noticia (perezoso, en memoria) ---------- */

let bodyMem = new Map<number, string | null>();

/** Descarga (o recupera) el cuerpo de una noticia de dokkaninfo. */
export async function fetchNewsBody(id: number): Promise<string | null> {
  if (bodyMem.has(id)) return bodyMem.get(id) ?? null;

  const html = await fetchInfoText(`/news/${id}`);
  const body = extractNewsBody(html);
  bodyMem.set(id, body);
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