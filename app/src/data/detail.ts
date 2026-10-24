import type { SkillText, Stats, UnitSummary, UnitType, UnitRarity } from './types';
import { fetchInfoText } from './http';
import { getHashes } from './repository';
import { dbGet, dbSet, STORE_DETAILS } from './localDb';
import {
  classFromElement,
  dkTime,
  parseCardPage,
  rarityFromCode,
  typeFromElement,
} from './dinfo';
import type { DkCard, DkCardPage } from './dinfo';

/**
 * Ficha completa de una unidad — fuente: dokkaninfo.com /cards/{id} (Fase 9).
 *
 * - El índice/seed ya trae lo básico (nombre, tipo, stats, fechas); la ficha
 *   se descarga con fetch perezoso y se cachea en IndexedDB bajo el hash
 *   vigente de la unidad: si la sincronización detecta cambios, se re-descarga.
 * - dokkaninfo publica SOLO el estado vigente de la carta (no hay datos
 *   pre-EZA: los pares 9xxxxxx son stubs sin pasiva). El estado EZA/SEZA
 *   "live" ya está reflejado en los datos; para EZAs anunciadas se muestra
 *   la fecha (releaseDates.eza) como chip de "EZA previsto".
 * - "¿Dónde conseguirlo?" se compone con banners del propio datajson
 *   (histórico completo con imágenes), los eventos Z-Battle de EZA y el
 *   índice de drops (drops.index.json, generado en build desde los detalles
 *   de eventos de dokkaninfo).
 */

/* ---------- Modelo ---------- */

interface SaEntry {
  name: string;
  description: string;
  /** 'Normal' | 'Hyper' (Ultra) | 'Unit' | 'EX' | … */
  style: string;
  ki: number;
  /** Multiplicador: 100 + atkMultiplier (Nv.1) · atkMultiplierBonus por nivel. */
  atkMultiplier: number | null;
  atkMultiplierBonus: number | null;
  condition: string | null;
}

export interface AcquireDrop {
  /** Clave de evento 'type/id' (deep-link #/eventos?ev=…). */
  eventKey: string;
  eventName: string;
  eventImage: string | null;
  stageName: string;
  difficulty: string | null;
}

interface AcquireBanner {
  id: number;
  name: string;
  startsAt: number | null;
  endsAt: number | null;
  image: string | null;
  /** true si el banner sigue activo (end_at en el futuro). */
  active: boolean;
}

interface Acquire {
  drops: AcquireDrop[];
  banners: AcquireBanner[];
  summonable: string | null;
  ezaBattles: { id: number; image: string | null }[];
}

/** Miniatura de unidad para listas de apoyo (líderes 200%, partners, formas). */
export interface MiniUnit {
  id: number;
  name: string;
  type: UnitType;
  rarity: UnitRarity;
  iconId: number | null;
}

export interface UnitFull {
  /** Stats del estado BASE de la carta (kanji del datajson; el estado EZA se deriva). */
  stats: Stats | null;
  leaderSkill: SkillText | null;
  passiveSkill: SkillText | null;
  activeSkills: SkillText[];
  superAttacks: SaEntry[];
  linkNames: string[];
  categories: { id: number; name: string }[];
  maxSaLevel: number | null;
  /** Ganancias absolutas de Hidden Potential (columna +100% = máx + gain). */
  hipoGains: { hp: number; atk: number; def: number } | null;
  /** Tablero de potential: fija el bonus plano del "+55%" (como dokkaninfo). */
  potentialBoardId: number | null;
  transformationPath: { id: number; name: string; type: UnitType; rarity: UnitRarity; iconId: number | null }[];
  acquire: Acquire;
  /** Líderes con 200%+ que cubren esta unidad (ranking de dokkaninfo). */
  bestLeaders: MiniUnit[];
  /** Partners con más links en común (ranking de dokkaninfo). */
  linkPartners: { unit: MiniUnit; shared: number; sharedLinkNames: string[] }[];
}

/* ---------- Índice de drops (build-time desde dokkaninfo) ---------- */

interface DropsIndex {
  generatedAt: string;
  /** Clave "type/id" → metadatos del evento. */
  events: Record<string, { name: string; image: string | null; endsAt: number | null }>;
  /** cardId → eventos (con etapa/dificultad) donde dropea. */
  byCard: Record<string, { type: string; id: number; stageName?: string; difficulty?: string | null }[]>;
}

let dropsPromise: Promise<DropsIndex | null> | null = null;

/** Carga (una vez) el índice de drops empaquetado; null si no existe. */
export function loadDropsIndex(): Promise<DropsIndex | null> {
  dropsPromise ??= fetch('/data/drops.index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return dropsPromise;
}

/* ---------- Caché en la base de datos local (store `details`) ---------- */

const STORE = STORE_DETAILS;
const CACHE_VERSION = 9; // v9: hipoGains = ganancias absolutas (antes salían negativas)

interface DetailEntry {
  v: number;
  indexHash: string;
  data: UnitFull;
}

async function idbGet(key: string): Promise<DetailEntry | null> {
  return dbGet<DetailEntry>(STORE, key);
}

async function idbSet(key: string, value: DetailEntry): Promise<void> {
  await dbSet(STORE, key, value);
}

/** Memoria de sesión: evita reabrir IDB al navegar entre fichas. */
const memCache = new Map<number, UnitFull>();
const inflight = new Map<number, Promise<UnitFull>>();

/* ---------- Normalización ---------- */

/**
 * Stats máximas con EZA/SEZA — fórmula exacta de dokkaninfo (bundle app.js):
 * `max + Math.round((max − init) × 0.4839)`, su columna "EZA B. Max".
 * Se aplica SIEMPRE que la fuente no traiga el valor (filas de dokkaninfo no
 * publican stats EZA): así toda unidad con EZA/SEZA tiene su cifra. Los
 * valores reales del datamine de dokkan.fyi solo existen en la semilla y se
 * conservan tal cual (los resúmenes del feed no se reconsstruyen).
 */
const ezaMax = (max: number, init: number): number => max + Math.round((max - init) * 0.4839);

const statsFromCard = (c: DkCard): Stats => ({
  hp: {
    base: c.hp_init ?? 0,
    max: c.hp_max ?? 0,
    eza: ezaMax(c.hp_max ?? 0, c.hp_init ?? 0),
  },
  atk: {
    base: c.atk_init ?? 0,
    max: c.atk_max ?? 0,
    eza: ezaMax(c.atk_max ?? 0, c.atk_init ?? 0),
  },
  def: {
    base: c.def_init ?? 0,
    max: c.def_max ?? 0,
    eza: ezaMax(c.def_max ?? 0, c.def_init ?? 0),
  },
});

const iso = (t: number | null): string | null => (t ? new Date(t * 1000).toISOString() : null);

/** Resumen de unidad a partir de la página de dokkaninfo (unidades nuevas/modificadas). */
export function summaryFromCardPage(
  id: number,
  page: DkCardPage,
  opts?: {
    hasEza?: boolean;
    hasSeza?: boolean;
    openAt?: number | null;
    ezaOpenAt?: number | null;
    sezaOpenAt?: number | null;
  },
): UnitSummary {
  const c = page.card;
  const openAt = opts?.openAt ?? dkTime(c.open_at);
  const ezaOpenAt = opts?.ezaOpenAt ?? page.ezaOpenAt;
  const sezaOpenAt = opts?.sezaOpenAt ?? page.sezaOpenAt;
  const hasEza = opts?.hasEza ?? (ezaOpenAt !== null || page.ezaBattles.length > 0);
  const hasSeza = opts?.hasSeza ?? false;

  // Última fecha conocida (inicial / EZA / SEZA) para ordenar el listado.
  const candidates: [string, number | null][] = [
    ['initial', openAt],
    ['eza', ezaOpenAt],
    ['seza', sezaOpenAt],
  ];
  const valid = candidates.filter(([, t]) => t !== null) as [string, number][];
  const latest = valid.length ? valid.reduce((a, b) => (a[1] >= b[1] ? a : b)) : null;

  // `page.hipo` son las GANANCIAS absolutas del potential (top-level hp_hipo
  // del datajson: Tien 5400 = 15491 − 10091). Antes se restaba hp_max y el
  // "+100% HiPo" salía por debajo del nivel máx.
  const hpGains = {
    hp: page.hipo.hp || 0,
    atk: page.hipo.atk || 0,
    def: page.hipo.def || 0,
  };

  return {
    id,
    name: c.name,
    rarity: rarityFromCode(c.rarity),
    type: typeFromElement(c.element),
    class: classFromElement(c.element),
    cost: c.cost ?? 0,
    maxLevel: c.lv_max ?? 0,
    maxSALevel: c.skill_lv_max ?? 0,
    thumbnailId: c.icon_id ?? id,
    hasImages: true,
    hasEza,
    hasSeza,
    releaseDates: {
      initial: iso(openAt),
      eza: iso(ezaOpenAt),
      seza: iso(sezaOpenAt),
      latest: latest ? iso(latest[1]) : null,
      latestType: latest ? latest[0] : null,
    },
    stats: statsFromCard(c),
    hpGains,
    linkIds: page.links.map((l) => l.id),
    linkNames: page.links.map((l) => l.name),
    leaderSkill: page.leaderSkill,
    passiveSkill: page.passiveSkill,
  };
}

/** Ficha completa a partir de la página de dokkaninfo. */
export function fullFromCardPage(page: DkCardPage, dropsIndex: DropsIndex | null): UnitFull {
  const now = Date.now() / 1000;
  const drops: AcquireDrop[] = [];
  for (const entry of dropsIndex?.byCard[String(page.card.id)] ?? []) {
    const key = `${entry.type}/${entry.id}`;
    const meta = dropsIndex?.events[key];
    drops.push({
      eventKey: key,
      eventName: meta?.name ?? `Evento ${entry.id}`,
      eventImage: meta?.image ?? null,
      stageName: entry.stageName ?? '',
      difficulty: entry.difficulty ?? null,
    });
  }

  return {
    stats: statsFromCard(page.card),
    leaderSkill: page.leaderSkill,
    passiveSkill: page.passiveSkill,
    activeSkills: page.activeSkills,
    superAttacks: page.superAttacks.map((sa) => ({
      name: sa.name,
      description: sa.description,
      style: sa.style,
      ki: sa.ki,
      atkMultiplier: sa.increaseRate,
      atkMultiplierBonus: sa.lvBonus,
      condition: sa.condition,
    })),
    linkNames: page.links.map((l) => l.name),
    categories: page.categories,
    maxSaLevel: page.card.skill_lv_max ?? null,
    hipoGains: {
      hp: page.hipo.hp || 0,
      atk: page.hipo.atk || 0,
      def: page.hipo.def || 0,
    },
    potentialBoardId: page.card.potential_board_id ?? null,
    transformationPath: page.transformations.map((t) => ({
      id: t.id,
      name: t.name,
      type: typeFromElement(t.element),
      rarity: rarityFromCode(t.rarity),
      iconId: t.icon_id ?? null,
    })),
    bestLeaders: page.bestLeaders.map((c) => ({
      id: c.id,
      name: c.name,
      type: typeFromElement(c.element),
      rarity: rarityFromCode(c.rarity),
      iconId: c.iconId,
    })),
    linkPartners: (() => {
      const nameById = new Map(page.links.map((l) => [l.id, l.name]));
      return page.linkPartners.map((p) => ({
        unit: {
          id: p.card.id,
          name: p.card.name,
          type: typeFromElement(p.card.element),
          rarity: rarityFromCode(p.card.rarity),
          iconId: p.card.iconId,
        },
        shared: p.shared,
        sharedLinkNames: p.linkIds.map((id) => nameById.get(id)).filter((n): n is string => !!n),
      }));
    })(),
    acquire: {
      drops,
      banners: page.banners.map((b) => ({
        id: b.id,
        name: b.name,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        image: b.image,
        active: b.endsAt !== null ? b.endsAt > now : b.startsAt !== null && b.startsAt <= now,
      })),
      summonable: page.summonable,
      ezaBattles: page.ezaBattles,
    },
  };
}

/* ---------- Fetch perezoso ---------- */

/**
 * Persiste en la BD una ficha que la sincronización ya trajo descargada:
 * misma forma que el fetch perezoso (hash vigente), evitando pedirla otra
 * vez a la red. Mejor esfuerzo, como toda la caché.
 */
export function cacheDetail(id: number, indexHash: string, data: UnitFull): void {
  memCache.set(id, data);
  void dbSet(STORE, `u${id}`, { v: CACHE_VERSION, indexHash, data });
}

/**
 * Descarga (o recupera de caché) la ficha completa de una unidad.
 * Lanza si la fuente no responde: la vista muestra el detalle parcial del índice.
 */
export async function fetchUnitDetail(id: number, force = false): Promise<UnitFull> {
  const mem = memCache.get(id);
  if (mem && !force) return mem;
  const inflightEntry = inflight.get(id);
  if (inflightEntry && !force) return inflightEntry;

  const promise = (async () => {
    const indexHash = getHashes().get(id) ?? '';
    if (!force) {
      const entry = await idbGet(`u${id}`);
      if (entry && entry.v === CACHE_VERSION && entry.indexHash === indexHash) {
        memCache.set(id, entry.data);
        return entry.data;
      }
    }
    const html = await fetchInfoText(`/cards/${id}`);
    const page = parseCardPage(html);
    if (!page) throw new Error(`Ficha ilegible para la unidad ${id}`);
    const dropsIndex = await loadDropsIndex();
    const data = fullFromCardPage(page, dropsIndex);
    memCache.set(id, data);
    await idbSet(`u${id}`, { v: CACHE_VERSION, indexHash, data });
    return data;
  })();

  inflight.set(id, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(id);
  }
}
