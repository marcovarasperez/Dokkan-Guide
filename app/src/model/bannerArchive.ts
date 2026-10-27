import { signal } from '@preact/signals';
import { fetchInfoText } from './http';
import { decodeEntities } from './html';

/**
 * Banners de dokkaninfo.com — la única fuente con archivo histórico:
 *  - Listado activo/finalizado: API JSON /api/banners?status=Active|Inactive&page=N.
 *  - Detalle por banner: /banners/{id} → atributo `v-bind:banner` con los
 *    personajes destacados (featuredCards con el id de personaje, que sirve
 *    para enlazar a las fichas in-app).
 * Las imágenes son de dokkaninfo → en la UI se muestran con InfoImg (ORB).
 * En memoria únicamente (sin persistencia local).
 */

const INFO = 'https://dokkaninfo.com';

// TTL en memoria: 15 minutos para listados, 30 minutos para detalles
const LIST_TTL_MS = 15 * 60 * 1000;
const DETAIL_TTL_MS = 30 * 60 * 1000;

// Cachés en memoria
const listActiveCache = { data: null as any, timestamp: 0 };
const listEndedCache = { data: null as any, timestamp: 0 };
const detailCaches = new Map<number, { data: any; timestamp: number }>();

export interface ArchiveBanner {
  id: number;
  type: string;
  name: string;
  description: string;
  /** Época en segundos (open_at / end_at). */
  startsAt: number;
  endsAt: number;
  image: string | null;
}

interface ArchiveListState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  items: ArchiveBanner[];
  page: number;
  lastPage: number;
  updatedAt: number | null;
}

type ArchiveKind = 'active' | 'ended';

const emptyList = (): ArchiveListState => ({
  status: 'idle',
  items: [],
  page: 0,
  lastPage: 1,
  updatedAt: null,
});

export const archiveState = signal<Record<ArchiveKind, ArchiveListState>>({
  active: emptyList(),
  ended: emptyList(),
});

/* ---------- Listado activo / finalizado ---------- */

interface RawArchiveBanner {
  id?: number;
  type?: string | null;
  name?: string | null;
  description?: string | null;
  open_at?: number | null;
  end_at?: number | null;
  images?: string[] | null;
}

function normalizeArchive(b: RawArchiveBanner): ArchiveBanner {
  return {
    id: b.id ?? 0,
    type: b.type ?? '',
    name: decodeEntities(b.name ?? `Banner ${b.id ?? ''}`.trim()),
    description: decodeEntities(b.description ?? ''),
    startsAt: b.open_at ?? 0,
    endsAt: b.end_at ?? 0,
    image: b.images?.[0] ? `${INFO}${b.images[0]}` : null,
  };
}

function getCache(kind: ArchiveKind): { data: any; timestamp: number } {
  return kind === 'active' ? listActiveCache : listEndedCache;
}

function isCacheValid(timestamp: number, ttl: number): boolean {
  return timestamp > 0 && Date.now() - timestamp < ttl;
}

export async function loadArchive(
  kind: ArchiveKind,
  opts: { append?: boolean; force?: boolean } = {},
): Promise<void> {
  const cur = archiveState.value[kind];
  if (cur.status === 'loading') return;

  const cache = getCache(kind);

  if (cur.status === 'idle') {
    if (cache.data && !opts.force && isCacheValid(cache.timestamp, LIST_TTL_MS)) {
      archiveState.value = { ...archiveState.value, [kind]: { ...cache.data, status: 'ok' } };
      return;
    }
  }

  const page = opts.append ? cur.page + 1 : 1;
  archiveState.value = { ...archiveState.value, [kind]: { ...cur, status: 'loading' } };
  try {
    const status = kind === 'active' ? 'Active' : 'Inactive';
    const parsed: unknown = JSON.parse(
      await fetchInfoText(`/api/banners?status=${status}&page=${page}`),
    );
    const json = parsed as { data?: RawArchiveBanner[]; last_page?: number } | RawArchiveBanner[];
    const rows = Array.isArray(json) ? json : (json.data ?? []);
    const lastPage = Array.isArray(json) ? 1 : (json.last_page ?? 1);
    const merged: ArchiveListState = {
      status: 'ok',
      items: opts.append ? [...cur.items, ...rows.map(normalizeArchive)] : rows.map(normalizeArchive),
      page,
      lastPage,
      updatedAt: Date.now(),
    };
    archiveState.value = { ...archiveState.value, [kind]: merged };
    if (!opts.append || page >= lastPage) {
      cache.data = merged;
      cache.timestamp = Date.now();
    }
  } catch {
    const now = archiveState.value[kind];
    archiveState.value = {
      ...archiveState.value,
      [kind]: { ...now, status: now.items.length ? 'ok' : 'error' },
    };
  }
}

/* ---------- Carga completa (todos los pages) — para los grupos de activos ---------- */

/** Nº máximo de páginas descargadas en una carga completa (seguridad). */
const MAX_ALL_PAGES = 10;

/**
 * Descarga TODAS las páginas del listado (status=Active|Inactive) de una
 * tacada: la vista de activos se agrupa en 4 categorías y necesita el
 * conjunto completo, no solo la primera página.
 */
export async function loadArchiveAll(kind: ArchiveKind, opts: { force?: boolean } = {}): Promise<void> {
  const cur = archiveState.value[kind];
  if (cur.status === 'loading') return;

  const cache = getCache(kind);

  if (cur.status === 'idle' || opts.force) {
    if (cache.data && !opts.force && isCacheValid(cache.timestamp, LIST_TTL_MS)) {
      archiveState.value = { ...archiveState.value, [kind]: { ...cache.data, status: 'ok' } };
      return;
    }
  }

  archiveState.value = { ...archiveState.value, [kind]: { ...cur, status: 'loading' } };
  try {
    const status = kind === 'active' ? 'Active' : 'Inactive';
    const rows: ArchiveBanner[] = [];
    let lastPage = 1;
    for (let page = 1; page <= Math.min(lastPage, MAX_ALL_PAGES); page += 1) {
      const parsed: unknown = JSON.parse(await fetchInfoText(`/api/banners?status=${status}&page=${page}`));
      const json = parsed as { data?: RawArchiveBanner[]; last_page?: number } | RawArchiveBanner[];
      const part = Array.isArray(json) ? json : (json.data ?? []);
      lastPage = Array.isArray(json) ? page : (json.last_page ?? page);
      rows.push(...part.map(normalizeArchive));
      if (page >= lastPage) break;
    }
    const merged: ArchiveListState = { status: 'ok', items: rows, page: lastPage, lastPage, updatedAt: Date.now() };
    archiveState.value = { ...archiveState.value, [kind]: merged };
    cache.data = merged;
    cache.timestamp = Date.now();
  } catch {
    const now = archiveState.value[kind];
    archiveState.value = {
      ...archiveState.value,
      [kind]: { ...now, status: now.items.length ? 'ok' : 'error' },
    };
  }
}

/* ---------- Detalle por banner ---------- */

export interface BannerCardRef {
  /** id de personaje → ficha in-app #/characters/{id}. */
  id: number;
  name: string;
  rarity: number | null;
}

interface BannerDetailInfo {
  id: number;
  type: string;
  name: string;
  description: string;
  startsAt: number | null;
  endsAt: number | null;
  image: string | null;
  featured: BannerCardRef[];
  unfeatured: BannerCardRef[];
}

interface RawBannerDetail {
  id?: number;
  type?: string | null;
  name?: string | null;
  description?: string | null;
  open_at?: number | null;
  end_at?: number | null;
  images?: string[] | null;
  featuredCards?: Record<string, RawBannerCard> | null;
  unfeaturedCards?: Record<string, RawBannerCard> | null;
}

interface RawBannerCard {
  id?: number;
  name?: string | null;
  rarity?: number | null;
}

const toCardRefs = (cards: Record<string, RawBannerCard> | null | undefined): BannerCardRef[] =>
  Object.values(cards ?? {})
    .filter((c): c is RawBannerCard => typeof c?.id === 'number')
    .map((c) => ({ id: c.id as number, name: c.name ?? '', rarity: c.rarity ?? null }));

export const bannerDetailState = signal<{
  status: 'idle' | 'loading' | 'ok' | 'error';
  id: number | null;
  detail: BannerDetailInfo | null;
}>({ status: 'idle', id: null, detail: null });

/** Detalle de un banner (activo o finalizado): imagen, fechas y destacados. */
export async function loadBannerDetail(id: number): Promise<void> {
  const cur = bannerDetailState.value;
  if (cur.status === 'loading' || (cur.id === id && cur.status === 'ok')) return;

  const detailCache = detailCaches.get(id) ?? { data: null, timestamp: 0 };
  detailCaches.set(id, detailCache);

  // La lectura de la caché es síncrona: si mientras tanto entró otro detalle
  // (o el mismo ya cargó), respetar ese estado en lugar de pisarlo.
  const after = bannerDetailState.value;
  if (after.status === 'loading' || (after.id === id && after.status === 'ok')) return;

  if (detailCache.data && isCacheValid(detailCache.timestamp, DETAIL_TTL_MS)) {
    bannerDetailState.value = { status: 'ok', id, detail: detailCache.data };
    return;
  }
  bannerDetailState.value = { status: 'loading', id, detail: null };

  try {
    const html = await fetchInfoText(`/banners/${id}`);
    const m = html.match(/v-bind:banner="([^"]+)"/);
    if (!m) throw new Error('banner no encontrado');
    const raw = JSON.parse(decodeEntities(m[1])) as RawBannerDetail;
    const detail: BannerDetailInfo = {
      id: raw.id ?? id,
      type: raw.type ?? '',
      name: decodeEntities(raw.name ?? `Banner ${id}`),
      description: decodeEntities(raw.description ?? ''),
      startsAt: raw.open_at ?? null,
      endsAt: raw.end_at ?? null,
      image: raw.images?.[0] ? `${INFO}${raw.images[0]}` : null,
      featured: toCardRefs(raw.featuredCards),
      unfeatured: toCardRefs(raw.unfeaturedCards),
    };
    bannerDetailState.value = { status: 'ok', id, detail };
    detailCache.data = detail;
    detailCache.timestamp = Date.now();
  } catch {
    const now = bannerDetailState.value;
    bannerDetailState.value = { ...now, status: now.detail ? 'ok' : 'error' };
  }
}

export function closeBannerDetail(): void {
  bannerDetailState.value = { status: 'idle', id: null, detail: null };
}