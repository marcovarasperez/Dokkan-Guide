import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { fetchInfoText } from './http';
import { decodeEntities } from './html';
import { parseEventDetail, parseEventList, parseEventListLastPage, parseMissions } from './dinfo';
import type { DkEventDetail, DkMissionCategory } from './dinfo';
import { dbGet, dbSet, STORE_EVENTS } from './localDb';
import { INFO_CDN } from './constants';

/**
 * Contenido del juego (sección Eventos, con sub-pestañas) y Tienda de Baba.
 *
 * Fase 9: TODA la información vive en dokkaninfo.com (fuente única). Los
 * listados de eventos salen de /events/{type} (eventjson o filas
 * SSR según el tipo); el detalle de cada evento (niveles, etapas, STA, drops
 * con iconos) se descarga al expandirlo y se cachea en la BD local.
 *
 * - Tienda de Baba: /babashop (Intercambio, Zeni, Tesoro y Cofres Secretos),
 *   con detalle por joya de tesoro.
 * - Caché por sección en la base de datos local (store `events`, apertura
 *   instantánea + offline; la caché previa de localStorage se migra una vez
 *   y queda como respaldo) y refresco manual por sección; los fallos se
 *   muestran sin romper la vista.
 */

/**
 * Categorías de eventos, en el MISMO orden y con el MISMO segmento de URL que
 * el menú "Events" de dokkaninfo.com (/events/{type}). Cada una es una
 * sub-pestaña de la vista Eventos.
 */
export const EVENT_TYPES = [
  { type: 'burstmode', label: 'Burst Mode', slug: 'burst' },
  { type: 'bonus', label: 'Bonus', slug: 'bonus' },
  { type: 'challenge', label: 'Challenge', slug: 'challenge' },
  { type: 'dbstories', label: 'DB Stories', slug: 'dbstories' },
  { type: 'zbattle', label: 'Extreme Z Battle', slug: 'extreme-z-battle' },
  { type: 'growth', label: 'Growth', slug: 'growth' },
  { type: 'limited', label: 'Limited', slug: 'limited' },
  { type: 'sdbattle', label: 'Pettan Battle', slug: 'pettan-battle' },
  { type: 'quest', label: 'Quest', slug: 'quest' },
  { type: 'story', label: 'Story', slug: 'story' },
  { type: 'dokkanfrontier', label: 'Dokkan Frontier', slug: 'dokkan-frontier' },
  { type: 'rmbattle', label: 'Ultimate Clash', slug: 'ultimate-clash' },
  { type: 'worldtournament', label: 'World Tournament', slug: 'world-tournament' },
] as const;

/** Segmento de URL de dokkaninfo de una categoría de eventos. */
export type EventType = (typeof EVENT_TYPES)[number]['type'];

interface SectionStatus {
  status: 'idle' | 'loading' | 'ok' | 'error';
  page: number;
  lastPage: number;
  updatedAt: number | null;
}

/* ---------- Tipos normalizados ---------- */

/**
 * Evento normalizado (listado). `type` es el segmento de URL de dokkaninfo:
 * limited | story | growth | challenge | bonus | quest | dbstories | zbattle |
 * worldtournament. Algunos tipos (dbstories) no traen nombre en el listado:
 * lo aporta el detalle.
 */
export interface GameEvent {
  id: number;
  type: string;
  name: string;
  image: string | null;
  /** Época en segundos (epoch) — se formatea en la vista con formatDate. */
  startsAt: number | null;
  endsAt: number | null;
  /** Z-Battles: carta objetivo del EZA (el thumb enlaza a la ficha). */
  unit: { id: number; name: string; thumbnailId: number } | null;
}

interface MissionReward {
  name: string;
  qty: number;
  image: string | null;
  cardId: number | null;
}

export interface MissionGroup {
  id: number;
  title: string;
  image: string | null;
  count: number;
  missions: { id: number; name: string; rewards: MissionReward[] }[];
}

interface BabaRow {
  qty: number;
  price: number;
  sale: boolean;
  discount: number | null;
  /** Stock/total comprable (solo el detalle de Tesoro): número o 'infinite' (∞). */
  stock?: number | 'infinite' | null;
}

export interface BabaItem {
  key: string;
  name: string;
  type: string;
  img: string | null;
  /** Unidad enlazable a la ficha in-app (los "Card" de la tienda). */
  cardId: number | null;
  /** Tesoro: índice N de /babashop/treasureitems/{N} para abrir el detalle. */
  ref?: number;
  rows: BabaRow[];
}

export interface BabaChest {
  id: number;
  title: string;
  price: number;
  premium: boolean;
  buyable: boolean;
  startsAt: number | null;
  endsAt: number | null;
}

export type BabaShopKey = 'trade' | 'zeni' | 'treasure' | 'chests';

/** Tiendas de Baba, en el orden y con el nombre del menú de dokkaninfo (/babashop/…). */
export const BABA_SHOPS: { key: BabaShopKey; slug: string; label: string }[] = [
  { key: 'trade', slug: 'intercambio', label: 'Trade Pts.' },
  { key: 'zeni', slug: 'zeni', label: 'Zeni' },
  { key: 'treasure', slug: 'tesoro', label: 'Treasure Items' },
  { key: 'chests', slug: 'cofres', label: 'Secret Treasure Chests' },
];

/* ---------- Estado por sección ---------- */

interface ListState<T> extends SectionStatus {
  items: T[];
}

const emptyList = <T,>(): ListState<T> => ({
  status: 'idle',
  items: [],
  page: 0,
  lastPage: 1,
  updatedAt: null,
});

/** Listado de cada categoría de eventos (clave = tipo de URL de dokkaninfo). */
export const eventLists = signal<Partial<Record<string, ListState<GameEvent>>>>({});

/** Estado (o vacío) de una categoría de eventos. */
export const eventListOf = (type: string): ListState<GameEvent> => eventLists.value[type] ?? emptyList();
export const missionsState = signal<ListState<MissionGroup>>(emptyList());
export const babaState = signal<Record<BabaShopKey, ListState<BabaItem | BabaChest>>>({
  trade: emptyList(),
  zeni: emptyList(),
  treasure: emptyList(),
  chests: emptyList(),
});

/* ---------- Caché en la base de datos local (store `events`) ---------- */

const CACHE_PREFIX = 'dk.game.';
// v3: eventos ahora en formato dokkaninfo (GameEvent en lugar de áreas fyi).
const CACHE_VERSION = 3;
// 6 h: la tienda de Baba rota su stock y los eventos se anuncian a diario.
const TTL_MS = 6 * 60 * 60 * 1000;

function cacheReadLegacy<T>(key: string): { ts: number; data: T } | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}.v${CACHE_VERSION}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: T };
    return typeof parsed?.ts === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

async function cacheRead<T>(key: string): Promise<T | null> {
  const entry = await dbGet<{ ts: number; data: T }>(STORE_EVENTS, `list:${key}`);
  if (entry) return Date.now() - entry.ts > TTL_MS ? null : entry.data;
  const legacy = cacheReadLegacy<T>(key); // caché previa en localStorage
  if (!legacy) return null;
  if (Date.now() - legacy.ts > TTL_MS) return null;
  void dbSet(STORE_EVENTS, `list:${key}`, legacy); // migración (una vez)
  return legacy.data;
}

async function cacheWrite<T>(key: string, data: T): Promise<void> {
  const entry = { ts: Date.now(), data };
  if (await dbSet(STORE_EVENTS, `list:${key}`, entry)) return;
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}.v${CACHE_VERSION}`, JSON.stringify(entry));
  } catch {
    /* almacenamiento lleno: se sigue sin caché */
  }
}

/* ---------- Carga por sección ---------- */

type Loader<T> = (page: number) => Promise<{ items: T[]; lastPage: number }>;

async function loadList<T>(
  st: Signal<ListState<T>>,
  cacheKey: string,
  loader: Loader<T>,
  opts: { append?: boolean; force?: boolean } = {},
): Promise<void> {
  const cur = st.value;
  if (cur.status === 'loading') return;

  // Caché de primera apertura (offline).
  if (cur.status === 'idle') {
    const cached = await cacheRead<ListState<T>>(cacheKey);
    if (cached && !opts.force) {
      st.value = { ...cached, status: 'ok' };
      if (Date.now() - (cached.updatedAt ?? 0) < TTL_MS) return;
    }
  }

  const page = opts.append ? cur.page + 1 : 1;
  st.value = { ...cur, status: 'loading' };
  try {
    const { items, lastPage } = await loader(page);
    const merged: ListState<T> = {
      status: 'ok',
      items: opts.append ? [...cur.items, ...items] : items,
      page,
      lastPage,
      updatedAt: Date.now(),
    };
    st.value = merged;
    if (!opts.append || page >= lastPage) void cacheWrite(cacheKey, merged);
  } catch {
    st.value = { ...st.value, status: cur.items.length ? 'ok' : 'error' };
  }
}

/* ---------- Eventos (dokkaninfo.com) ---------- */

const isActive = (e: GameEvent): boolean => !e.endsAt || e.endsAt * 1000 > Date.now();

/** Activo primero; después por fecha de inicio desc; desempate por id desc. */
const compareEvents = (a: GameEvent, b: GameEvent): number => {
  const aa = isActive(a) ? 1 : 0;
  const bb = isActive(b) ? 1 : 0;
  if (aa !== bb) return bb - aa;
  const da = a.startsAt ?? '';
  const db = b.startsAt ?? '';
  if (da !== db) return da < db ? 1 : -1;
  return b.id - a.id;
};

/** Descarga una página del listado de una categoría (/events/{type}). */
async function fetchEventList(type: string, page = 1): Promise<{ items: GameEvent[]; lastPage: number }> {
  const html = await fetchInfoText(page > 1 ? `/events/${type}?page=${page}` : `/events/${type}`);
  const items = parseEventList(html).map((e) => ({
    id: e.id,
    type,
    name: e.name ?? '',
    image: e.image,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    unit: null,
  }));
  return { items, lastPage: parseEventListLastPage(html) };
}

/** Nombres por defecto cuando el listado de la fuente no los trae. */
const FALLBACK_NAME: Record<string, string> = {
  quest: 'Área',
  worldtournament: 'Torneo Mundial',
  dbstories: 'DB Story',
  sdbattle: 'Pettan Battle',
  dokkanfrontier: 'Dokkan Frontier',
};

/** Nº de Z-Battles activos cuyo detalle se descarga para obtener nombre+carta. */
const ZB_ENRICH_MAX = 12;

/**
 * Carga (o pagina) el listado de UNA categoría de eventos. Mismo flujo para
 * las 13 categorías del menú: caché local → red → caché. Los Z-Battles
 * activos se enriquecen con su detalle (título + carta objetivo).
 */
export function loadEventType(type: string, opts: { append?: boolean; force?: boolean } = {}): Promise<void> {
  // Señal "virtual" por tipo sobre el mapa `eventLists` (loadList trabaja con una Signal).
  const st = {
    get value(): ListState<GameEvent> {
      return eventListOf(type);
    },
    set value(v: ListState<GameEvent>) {
      eventLists.value = { ...eventLists.value, [type]: v };
    },
  } as Signal<ListState<GameEvent>>;

  return loadList<GameEvent>(st, `ev.${type}`, async (page) => {
    const { items, lastPage } = await fetchEventList(type, page);
    const prefix = FALLBACK_NAME[type];
    for (const e of items) if (!e.name && prefix) e.name = `${prefix} ${e.id}`;
    if (type === 'zbattle') {
      items.sort(compareEvents);
      // El listado de Z-Battles no trae nombre: se enriquece con las páginas de
      // detalle de los activos (título + carta objetivo que enlaza a la ficha).
      const active = items.filter(isActive).slice(0, ZB_ENRICH_MAX);
      await Promise.allSettled(
        active.map(async (z) => {
          const parsed = parseEventDetail(await fetchInfoText(`/events/zbattle/${z.id}`));
          if (parsed.title) z.name = parsed.title;
          if (parsed.unit) {
            z.unit = { id: parsed.unit.id, name: parsed.unit.name, thumbnailId: parsed.unit.iconId };
          }
        }),
      );
    } else if (type !== 'quest' && type !== 'dbstories') {
      items.sort(compareEvents);
    }
    return { items, lastPage };
  }, opts);
}

/* ---------- Detalle de evento (niveles, etapas y drops) ---------- */

export interface EventDetailState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  detail: DkEventDetail | null;
}

/** Detalle por clave `${type}/${id}` (carga perezosa al expandir la tarjeta). */
export const eventDetails = signal<Record<string, EventDetailState>>({});

const DETAIL_CACHE_KEY = 'dk.evdetails.v1';
const DETAIL_TTL_MS = 6 * 60 * 60 * 1000;
const DETAIL_MAX_ENTRIES = 40;

interface DetailCacheEntry {
  ts: number;
  data: DkEventDetail;
}

function readLegacyDetails(): Record<string, DetailCacheEntry> {
  try {
    const all = JSON.parse(localStorage.getItem(DETAIL_CACHE_KEY) ?? '{}') as Record<string, DetailCacheEntry>;
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
}

async function readAllDetails(): Promise<Record<string, DetailCacheEntry>> {
  const inDb = await dbGet<Record<string, DetailCacheEntry>>(STORE_EVENTS, 'eventDetails');
  if (inDb && typeof inDb === 'object') return inDb;
  const legacy = readLegacyDetails(); // caché previa en localStorage
  if (Object.keys(legacy).length) void dbSet(STORE_EVENTS, 'eventDetails', legacy); // migración (una vez)
  return legacy;
}

async function detailCacheRead(key: string): Promise<DkEventDetail | null> {
  const entry = (await readAllDetails())[key];
  if (!entry || Date.now() - entry.ts > DETAIL_TTL_MS) return null;
  return entry.data;
}

async function detailCacheWrite(key: string, data: DkEventDetail): Promise<void> {
  try {
    const all = await readAllDetails();
    all[key] = { ts: Date.now(), data };
    const keys = Object.keys(all);
    if (keys.length > DETAIL_MAX_ENTRIES) {
      keys
        .sort((a, b) => all[a].ts - all[b].ts)
        .slice(0, keys.length - DETAIL_MAX_ENTRIES)
        .forEach((k) => delete all[k]);
    }
    if (await dbSet(STORE_EVENTS, 'eventDetails', all)) return;
    try {
      localStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(all));
    } catch {
      /* best-effort */
    }
  } catch {
    /* best-effort */
  }
}

/** Sustituye el nombre vacío de un evento listado con el título del detalle. */
function patchEventName(type: string, id: number, title: string): void {
  const cur = eventListOf(type);
  const i = cur.items.findIndex((e) => e.id === id);
  if (i < 0 || cur.items[i].name) return;
  const items = [...cur.items];
  items[i] = { ...items[i], name: title };
  eventLists.value = { ...eventLists.value, [type]: { ...cur, items } };
}

export async function loadEventDetail(type: string, id: number): Promise<void> {
  const key = `${type}/${id}`;
  const cur = eventDetails.value[key];
  if (cur && (cur.status === 'loading' || cur.status === 'ok')) return;

  const cached = await detailCacheRead(key);

  // La lectura de la BD es asíncrona: si mientras tanto el mismo detalle ya
  // cargó (o está cargando), respetar ese estado en lugar de pisarlo.
  const after = eventDetails.value[key];
  if (after && (after.status === 'loading' || after.status === 'ok')) return;

  if (cached) {
    eventDetails.value = { ...eventDetails.value, [key]: { status: 'ok', detail: cached } };
    if (cached.title) patchEventName(type, id, cached.title);
    return;
  }

  eventDetails.value = { ...eventDetails.value, [key]: { status: 'loading', detail: null } };
  try {
    const detail = parseEventDetail(await fetchInfoText(`/events/${type}/${id}`));
    void detailCacheWrite(key, detail);
    eventDetails.value = { ...eventDetails.value, [key]: { status: 'ok', detail } };
    if (detail.title) patchEventName(type, id, detail.title);
  } catch {
    eventDetails.value = {
      ...eventDetails.value,
      [key]: { status: 'error', detail: eventDetails.value[key]?.detail ?? null },
    };
  }
}

/* ---------- Misiones (dokkaninfo.com /missions) ---------- */

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿-鿿豈-﫿ｦ-ﾟ]/;

/** Título legible: si el nombre de categoría está en japonés, se deriva del
 * primer nombre de misión entre comillas (el evento al que pertenece). */
/** Etiquetas 【…】 de los nombres japoneses de categoría → nombre legible. */
const MISSION_TAGS: [RegExp, string][] = [
  [/極限Zバトル/, 'Extreme Z-Battle'],
  [/超激戦/, 'Super Battle Road / Dokkan Event'],
  [/チャレンジ/, 'Challenge'],
  [/ドッカンフェス|フェス/, 'Dokkan Festival'],
  [/物語|ストーリー/, 'Story'],
  [/育成|強化/, 'Growth'],
  [/記念|キャンペーン/, 'Campaign'],
  [/天下一/, 'World Tournament'],
];

function missionTitle(cat: DkMissionCategory): string {
  const name = cat.name.replace(/^\[en\]\s*/, '');
  if (name && !CJK_RE.test(name)) return name;
  for (const m of cat.missions) {
    const q = m.name.match(/"([^"]{3,70})"/);
    if (q) return q[1];
  }
  const tag = MISSION_TAGS.find(([re]) => re.test(name));
  return tag ? `${tag[1]} · Misiones` : 'Misiones';
}

export function loadMissions(opts: { append?: boolean; force?: boolean } = {}): Promise<void> {
  return loadList<MissionGroup>(missionsState, 'missions.v2', async (page) => {
    const { categories, lastPage } = parseMissions(await fetchInfoText(`/missions?page=${page}`));
    const items = categories.map((c) => ({
      id: c.id,
      title: missionTitle(c),
      image: c.image,
      count: c.missions.length,
      missions: c.missions.map((m) => ({
        id: m.id,
        name: m.name,
        rewards: m.rewards.map((r) => ({ name: r.name, qty: r.quantity, image: r.image, cardId: r.cardId })),
      })),
    }));
    return { items, lastPage };
  }, opts);
}

/* ---------- Deep-links de obtención (#/eventos?ev={type}/{id}) ---------- */

/**
 * Asegura que el evento del deep-link está en el listado de su categoría
 * (carga el listado si hace falta; si el evento ya rotó, se añade sintético y
 * el detalle aporta el nombre). Devuelve el evento para enfocarlo.
 */
export async function ensureEventForDeepLink(type: string, id: number): Promise<GameEvent | null> {
  const find = (): GameEvent | undefined => eventListOf(type).items.find((e) => e.id === id);
  const hit0 = find();
  if (hit0) return hit0;
  if (eventListOf(type).status === 'idle') await loadEventType(type);
  const hit1 = find();
  if (hit1) return hit1;
  const synth: GameEvent = { id, type, name: '', image: null, startsAt: null, endsAt: null, unit: null };
  const cur = eventListOf(type);
  eventLists.value = { ...eventLists.value, [type]: { ...cur, items: [...cur.items, synth] } };
  return synth;
}

/* ---------- Tienda de Baba (dokkaninfo.com) ---------- */

interface RawBabaItem {
  id?: number;
  name?: string | null;
  rarity?: number | null;
}

interface RawReward {
  item_type?: string | null;
  quantity?: number | null;
  item?: RawBabaItem | null;
  items?: Record<string, { quantity?: number; is_sale?: number; price?: number; discount_price?: number | null }> | null;
}

/** Miniatura de objeto según el mapa de assets de dokkaninfo (null si no está mapeado). */
function babaItemImg(type: string, item: RawBabaItem): string | null {
  const id = item.id ?? 0;
  const p5 = String(id).padStart(5, '0');
  const p7 = String(id).padStart(7, '0');
  const base = `${INFO_CDN}/assets/global/en`;
  switch (type) {
    case 'AwakeningItem':
      return `${base}/item/awaken/en/thumb/thumb_awaken_items_${p5}/thumb_awaken_items_${p5}.png`;
    case 'SupportItem':
      return `${base}/item/support/thumb/thumb_support_item_${p5}.png`;
    case 'TrainingItem':
      return `${base}/item/training_item/thumb_training_items_${p7}.png`;
    case 'PotentialItem':
      return `${base}/item/other/en/thumb/thumb_pot_orb_${p5}/thumb_pot_orb_${p5}.png`;
    case 'SpecialItem':
      return `${base}/item/other/en/thumb/thumb_other_${p5}/thumb_other_${p5}.png`;
    case 'TreasureItem':
      return `${base}/item/other/en/thumb/thumb_trade_jewel_${p5}/thumb_trade_jewel_${p5}.png`;
    case 'ActItem':
      return `${base}/item/act/thumb/thumb_act_item_${p5}.png`;
    default:
      return null; // Card (→ ficha in-app), EventkagiItem, TrainingField, SupportFilm…
  }
}

function parseRewards(html: string): RawReward[] {
  const out: RawReward[] = [];
  const re = /v-bind:reward="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(decodeEntities(m[1])) as RawReward);
    } catch {
      /* atributo malformado: se ignora */
    }
  }
  return out;
}

/** Filas duplicadas (rotación semanal) se deduplican para mostrarlas compactas. */
function toBabaItems(html: string): BabaItem[] {
  const rewards = parseRewards(html);
  return rewards.map((r, i) => {
    const item = r.item ?? {};
    const type = r.item_type ?? '';
    const rows: BabaRow[] = [];
    const seen = new Set<string>();
    for (const row of Object.values(r.items ?? {})) {
      const qty = row.quantity ?? r.quantity ?? 1;
      const price = row.price ?? 0;
      const sale = row.is_sale === 1;
      const discount = sale ? row.discount_price ?? null : null;
      const sig = `${qty}|${price}|${sale}|${discount}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      rows.push({ qty, price, sale, discount });
    }
    return {
      key: `${type}-${item.id ?? i}`,
      name: decodeEntities(item.name ?? 'Objeto'),
      type,
      img: babaItemImg(type, item),
      cardId: type === 'Card' ? item.id ?? null : null,
      rows,
    };
  });
}

/** Tienda de Zeni: precio en la columna de texto plano posterior a cada <reward>. */
function parseZeniItems(html: string): BabaItem[] {
  const parts = html.split('<reward');
  const items: BabaItem[] = [];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const attr = seg.match(/v-bind:reward="([^"]+)"/);
    if (!attr) continue;
    let r: RawReward;
    try {
      r = JSON.parse(decodeEntities(attr[1])) as RawReward;
    } catch {
      continue;
    }
    const item = r.item ?? {};
    const type = r.item_type ?? '';
    const cols = [...seg.matchAll(/<div class="col-sm-4 font-size-1_5">\s*(\d+)\s*<\/div>/g)].map((m2) => Number(m2[1]));
    // cols = [cantidad, precio en zeni]
    items.push({
      key: `zeni-${type}-${item.id ?? i}`,
      name: decodeEntities(item.name ?? 'Objeto'),
      type,
      img: babaItemImg(type, item),
      cardId: type === 'Card' ? item.id ?? null : null,
      rows: [{ qty: cols[0] ?? r.quantity ?? 1, price: cols[1] ?? 0, sale: false, discount: null }],
    });
  }
  return items;
}

/**
 * Tesoro: rejilla de iconos de "trade jewels" (monedas de intercambio).
 * Cada celda enlaza a /babashop/treasureitems/{N} (detalle de compras);
 * el nombre de la joya viene del catálogo /items/treasureitems.
 */
function parseTreasureItems(html: string, names: Record<string, string>): BabaItem[] {
  const pairs: { ref: number; thumb: string }[] = [];
  const seen = new Set<string>();
  const re = /<a href="\/babashop\/treasureitems\/(\d+)"[\s\S]{0,600}?alt="thumb_trade_jewel_(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    pairs.push({ ref: Number(m[1]), thumb: m[2] });
  }
  // Respaldo: si el markup cambia, al menos se muestran los iconos (sin detalle).
  if (!pairs.length) {
    const ids = new Set<string>();
    const re2 = /thumb_trade_jewel_(\d+)\.png/g;
    while ((m = re2.exec(html))) ids.add(m[1]);
    for (const id of ids) pairs.push({ ref: 0, thumb: id });
  }
  return pairs.map(({ ref, thumb }) => {
    const p5 = thumb.padStart(5, '0');
    return {
      key: `treasure-${thumb}`,
      name: names[thumb] ?? names[String(Number(thumb))] ?? `Tesoro ${Number(thumb)}`,
      type: 'TreasureItem',
      img: `${INFO_CDN}/assets/global/en/item/other/en/thumb/thumb_trade_jewel_${p5}/thumb_trade_jewel_${p5}.png`,
      cardId: null,
      ref,
      rows: [],
    };
  });
}

/**
 * Catálogo de joyas (/items/treasureitems): mapa thumb_trade_jewel_NNNNN →
 * nombre legible. HTML plano: tarjetas con <b>Nombre</b> y su icono.
 */
function parseJewelCatalog(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!html) return out;
  // Tarjeta compacta: el <b> del nombre puede ir antes o después de su icono,
  // así que se toma el primer thumb en una ventana ±800 (patrón validado).
  const re = /<b>([^<]{2,70})<\/b>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const around = html.slice(Math.max(0, m.index - 800), m.index + 800);
    const t = around.match(/thumb_trade_jewel_(\d+)/);
    if (!t) continue;
    const name = decodeEntities(m[1]).trim();
    if (name) out[t[1]] = name;
  }
  return out;
}

/**
 * Detalle de una joya (/babashop/treasureitems/{N}): qué se puede comprar con
 * ella. Cabeceras de columna: Items | Price | Total | Start | End →
 * tras cada <reward>: precio en la joya, stock (número o ∞) y dos fechas.
 */
function parseTreasureDetailItems(html: string): BabaItem[] {
  const parts = html.split('<reward');
  const items: BabaItem[] = [];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const attr = seg.match(/v-bind:reward="([^"]+)"/);
    if (!attr) continue;
    let r: RawReward;
    try {
      r = JSON.parse(decodeEntities(attr[1])) as RawReward;
    } catch {
      continue;
    }
    const item = r.item ?? {};
    const type = r.item_type ?? '';
    const cols = [...seg.matchAll(/<div class="col-sm-\d font-size-1_5">\s*(\d+|∞)\s*<\/div>/g)].map(
      (m2) => (m2[1] === '∞' ? ('infinite' as const) : Number(m2[1])),
    );
    // cols = [precio en joyas, stock total]
    const price = typeof cols[0] === 'number' ? cols[0] : 0;
    const stock: number | 'infinite' | null = cols.length > 1 ? (cols[1] ?? null) : null;
    items.push({
      key: `tj-${type}-${item.id ?? i}`,
      name: decodeEntities(item.name ?? 'Objeto'),
      type,
      img: babaItemImg(type, item),
      cardId: type === 'Card' ? item.id ?? null : null,
      rows: [{ qty: r.quantity ?? 1, price, sale: false, discount: null, stock }],
    });
  }
  return items;
}

/** Título de la página de detalle: "Baba's Shop - Incredible Gem (Green) | Dokkan Info!" */
function treasureTitle(html: string): string {
  const raw = decodeEntities(html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return raw
    .replace(/^Baba'?s Shop\s*-\s*/i, '')
    .replace(/\s*\|\s*Dokkan Info!?\s*$/i, '')
    .trim();
}

interface Paginator<T> {
  data?: T[] | null;
  meta?: { current_page?: number; last_page?: number } | null;
}

export function loadBaba(shop: BabaShopKey, opts: { append?: boolean; force?: boolean } = {}): Promise<void> {
  const cacheKey = `baba-${shop}`;
  const cur = babaState.value[shop];
  if (cur.status === 'loading') return Promise.resolve();

  return (async () => {
    if (cur.status === 'idle') {
      const cached = await cacheRead<ListState<BabaItem | BabaChest>>(cacheKey);
      if (cached && !opts.force) {
        babaState.value = { ...babaState.value, [shop]: { ...cached, status: 'ok' } };
        if (Date.now() - (cached.updatedAt ?? 0) < TTL_MS) return;
      }
      // La lectura de la BD es asíncrona: si mientras tanto otra llamada ya
      // puso 'loading', no duplicar la descarga.
      if (babaState.value[shop].status === 'loading') return;
    }

    const page = opts.append ? cur.page + 1 : 1;
    babaState.value = { ...babaState.value, [shop]: { ...cur, status: 'loading' } };

    try {
      let items: (BabaItem | BabaChest)[];
      let lastPage = 1;
      if (shop === 'chests') {
        const json = JSON.parse(
          await fetchInfoText(`/api/babashop/secrettreasurechests?page=${page}`),
        ) as Paginator<{ id?: number; title?: string | null; price?: number | null; is_premium?: number | boolean | null; buyable?: number | boolean | null; start_at?: number | null; end_at?: number | null }> & { last_page?: number };
        lastPage = json.last_page ?? json.meta?.last_page ?? 1;
        items = (json.data ?? []).map((c) => ({
          id: c.id ?? 0,
          title: decodeEntities(c.title ?? 'Cofre'),
          price: c.price ?? 0,
          premium: c.is_premium === true || c.is_premium === 1,
          buyable: c.buyable === true || c.buyable === 1,
          startsAt: c.start_at ?? null,
          endsAt: c.end_at ?? null,
        }));
      } else if (shop === 'zeni') {
        items = parseZeniItems(await fetchInfoText('/babashop/zeni'));
        lastPage = 1;
      } else if (shop === 'treasure') {
        const [gridHtml, catalogHtml] = await Promise.all([
          fetchInfoText('/babashop/treasureitems'),
          fetchInfoText('/items/treasureitems').catch(() => ''),
        ]);
        items = parseTreasureItems(gridHtml, parseJewelCatalog(catalogHtml));
        lastPage = 1;
      } else {
        items = toBabaItems(await fetchInfoText('/babashop/exchangepoints'));
        lastPage = 1;
      }
      const merged: ListState<BabaItem | BabaChest> = {
        status: 'ok',
        items: opts.append ? [...cur.items, ...items] : items,
        page,
        lastPage,
        updatedAt: Date.now(),
      };
      babaState.value = { ...babaState.value, [shop]: merged };
      void cacheWrite(cacheKey, merged);
    } catch {
      const now = babaState.value[shop];
      babaState.value = {
        ...babaState.value,
        [shop]: { ...now, status: now.items.length ? 'ok' : 'error' },
      };
    }
  })();
}

/* ---------- Tesoro: detalle por joya ---------- */

interface TreasureDetailState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  /** Índice N de /babashop/treasureitems/{N} (null si no hay selección). */
  ref: number | null;
  name: string;
  img: string | null;
  items: BabaItem[];
  updatedAt: number | null;
}

const emptyTreasureDetail = (): TreasureDetailState => ({
  status: 'idle',
  ref: null,
  name: '',
  img: null,
  items: [],
  updatedAt: null,
});

export const treasureDetail = signal<TreasureDetailState>(emptyTreasureDetail());

/**
 * Abre la tienda de una joya concreta: qué se puede comprar con ella
 * (precio en joyas, stock y vigencia). Cacheada por joya (6 h).
 */
export function loadTreasureDetail(ref: number, name: string, img: string | null): Promise<void> {
  const cur = treasureDetail.value;
  if (cur.status === 'loading' || (cur.ref === ref && cur.status === 'ok')) return Promise.resolve();

  return (async () => {
    const cached = await cacheRead<{ name: string; items: BabaItem[] }>(`baba-treasure-${ref}`);
    // Tras la lectura asíncrona: respetar si mientras tanto cambió el estado.
    const after = treasureDetail.value;
    if (after.status === 'loading' || (after.ref === ref && after.status === 'ok')) return;

    if (cached) {
      treasureDetail.value = {
        status: 'ok',
        ref,
        name: cached.name || name,
        img,
        items: cached.items,
        updatedAt: Date.now(),
      };
      return;
    }
    treasureDetail.value = { status: 'loading', ref, name, img, items: [], updatedAt: null };

    try {
      const html = await fetchInfoText(`/babashop/treasureitems/${ref}`);
      const title = treasureTitle(html);
      const items = parseTreasureDetailItems(html);
      treasureDetail.value = {
        status: 'ok',
        ref,
        name: title || name,
        img,
        items,
        updatedAt: Date.now(),
      };
      void cacheWrite(`baba-treasure-${ref}`, { name: title || name, items });
    } catch {
      const now = treasureDetail.value;
      treasureDetail.value = { ...now, status: now.items.length ? 'ok' : 'error' };
    }
  })();
}

/** Cierra el detalle de tesoro (vuelve a la rejilla de joyas). */
export function closeTreasureDetail(): void {
  treasureDetail.value = emptyTreasureDetail();
}
