/**
 * Respaldo dokkan.fyi — cuando dokkaninfo no contesta (Cloudflare 403 / rate
 * limit) el catálogo y las noticias se piden a dokkan.fyi, el mismo datamine
 * publicado que genera la semilla de la app.
 *
 * dokkan.fyi es una app Inertia: cada página HTML lleva su JSON en
 * `<script data-page="app">`. En desarrollo pasa por el proxy local /dfyi;
 * empaquetado usa el transporte nativo (sin CORS). Fallos → se propagan y el
 * llamante muestra la caché.
 *
 * El normalizador y el hash (FNV-1a sobre {summary, detail} con claves
 * ordenadas) son un PORT EXACTO de tools/sync.mjs: así la detección de cambios
 * es consistente con los hashes del seed empaquetado (meta.json).
 */

import { fetchTextUrl } from './http';
import { applySyncResult, getHashes, getUnits } from './repository';
import type { UnitFull } from './detail';
import type { SkillText, Stats, UnitRarity, UnitSummary, UnitType } from './types';

const FYI_SOURCE = 'https://dokkan.fyi';
const FYI_DEV_PREFIX = '/dfyi';
const PAGE_SIZE = 100;
const MAX_PAGES = 40;
/** Salvaguarda: un feed que trae bastante menos que lo local no se aplica. */
const MIN_COVERAGE = 0.9;

const fyiUrl = (path: string): string => (import.meta.env.DEV ? `${FYI_DEV_PREFIX}${path}` : `${FYI_SOURCE}${path}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cleanText = (s: unknown): string | null =>
  typeof s === 'string' ? s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : null;

/** Props de Inertia embebidas en el HTML de dokkan.fyi. */
function parseFyiProps(html: string): Record<string, any> {
  const m = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('dokkan.fyi: no se encontró data-page');
  return (JSON.parse(m[1]) as { props: Record<string, any> }).props;
}

/* ---------- Hash idéntico a tools/sync.mjs (port) ---------- */

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return (
      '{' +
      Object.keys(v as object)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stable((v as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(v) ?? 'null';
}

/* ---------- Normalización (port exacto de normalizeRecord) ---------- */

function normalizeFyiRecord(
  raw: Record<string, any>,
  linkNames: Record<number, string>,
): { summary: UnitSummary; hash: string } {
  const skill = (s: unknown): SkillText | null =>
    s ? { name: cleanText((s as Record<string, unknown>).name) ?? '', description: cleanText((s as Record<string, unknown>).description) ?? '' } : null;
  const stats: Stats = {
    hp: {
      base: raw.stats?.hp?.base ?? 0,
      max: raw.stats?.hp?.max ?? 0,
      eza: raw.stats?.hp?.eza ?? 0,
    },
    atk: {
      base: raw.stats?.atk?.base ?? 0,
      max: raw.stats?.atk?.max ?? 0,
      eza: raw.stats?.atk?.eza ?? 0,
    },
    def: {
      base: raw.stats?.def?.base ?? 0,
      max: raw.stats?.def?.max ?? 0,
      eza: raw.stats?.def?.eza ?? 0,
    },
  };
  const linkIds: number[] = raw.link_skill_ids ?? [];
  const summary: UnitSummary = {
    id: raw.id,
    name: cleanText(raw.name) ?? '',
    rarity: (raw.rarity_text ?? 'UR') as UnitRarity,
    type: (raw.type_text ?? 'AGL') as UnitType,
    class: raw.awakening_type_text === 'Extreme' ? 'Extreme' : 'Super',
    cost: raw.cost ?? 0,
    maxLevel: raw.max_level ?? 0,
    maxSALevel: raw.max_super_attack_level ?? 0,
    thumbnailId: raw.thumbnail_id ?? 0,
    hasImages: !!raw.has_images,
    hasEza: !!raw.has_eza,
    hasSeza: !!raw.has_seza,
    releaseDates: {
      initial: raw.release_dates?.initial ?? null,
      eza: raw.release_dates?.eza ?? null,
      seza: raw.release_dates?.seza ?? null,
      latest: raw.release_dates?.latest ?? null,
      latestType: raw.release_dates?.latest_type ?? null,
    },
    stats,
    hpGains: raw.hidden_potential
      ? { hp: raw.hidden_potential.hp ?? 0, atk: raw.hidden_potential.atk ?? 0, def: raw.hidden_potential.def ?? 0 }
      : null,
    linkIds,
    linkNames: linkIds.map((id) => linkNames[id] ?? `#${id}`),
    leaderSkill: skill(raw.leader_skill),
    passiveSkill: skill(raw.passive_skill),
  };

  // Detalle de hash: mismo shape que tools/sync.mjs (consistencia con meta.json).
  const hashDetail = {
    characterId: raw.character_id ?? null,
    canonicalId: raw.canonical_id ?? null,
    kiMultipliers: raw.ki_multipliers ?? null,
    activeSkills: (raw.active_skills ?? []).map((s: Record<string, unknown> | null) => ({
      name: cleanText(s?.name) ?? '',
      description: cleanText(s?.description) ?? '',
    })),
    standbySkill: skill(raw.standby_skill),
    eza: raw.extreme_z_awakening
      ? {
          maxLevel: raw.extreme_z_awakening.max_level ?? null,
          maxSALevel: raw.extreme_z_awakening.max_super_attack_level ?? null,
          leaderSkill: skill(raw.extreme_z_awakening.leader_skill),
        }
      : null,
    isReversiblyExchanged: !!raw.is_reversibly_exchanged,
    reversibleExchangeCharacterId: raw.reversible_exchange_character_id ?? null,
    transformationPath: (raw.transformation_path_characters ?? []).map((c: Record<string, unknown> | null) => ({
      id: c?.id ?? null,
      name: cleanText(c?.name) ?? '',
      type: c?.type_text,
      rarity: c?.rarity_text,
    })),
    treasureExchanges: (raw.treasure_exchanges ?? []).length,
    isFreelyObtainable: !!raw.is_freely_obtainable,
    isStageDropReward: !!raw.is_stage_drop_reward,
    isWorldTournamentReward: !!raw.is_world_tournament_reward,
    hasBattleMotion: !!raw.has_battle_motion,
  };

  return { summary, hash: fnv1a(stable({ summary, detail: hashDetail })) };
}

/** Ficha completa construida desde el registro fyi (mejor que un detalle vacío). */
function fullFromFyi(raw: Record<string, any>, summary: UnitSummary): UnitFull {
  return {
    stats: summary.stats,
    leaderSkill: summary.leaderSkill,
    passiveSkill: summary.passiveSkill,    activeSkills: (raw.active_skills ?? []).map((s: Record<string, unknown> | null) => ({
      name: cleanText(s?.name) ?? '',
      description: cleanText(s?.description) ?? '',
    })),
    superAttacks: [],
    linkNames: summary.linkNames,
    categories: [],
    maxSaLevel: summary.maxSALevel,
    ezaStep: null, // fyi no publica el step de awakening: sin textos por estado
    sezaStep: null,
    releaseDates: { eza: null, seza: null },
    hipoGains: summary.hpGains,
    potentialBoardId: null,
    transformationPath: (raw.transformation_path_characters ?? []).map((c: Record<string, any> | null) => ({
      id: c?.id ?? 0,
      name: cleanText(c?.name) ?? '',
      type: (c?.type_text ?? 'AGL') as UnitType,
      rarity: (c?.rarity_text ?? 'UR') as UnitRarity,
      iconId: c?.thumbnail_id ?? null,
    })),
    acquire: { drops: [], banners: [], summonable: null, ezaBattles: [], ezaEvents: [], ezaMedals: [], sezaMedals: [] },
    bestLeaders: [],
    linkPartners: [],
    // Respaldo dokkan.fyi: sin flag de animación de la fuente (no se pide).
    anim: false,
  };
}

export interface FallbackResult {
  newUnits: number;
  changedUnits: number;
  freshUnitIds: number[];
}

/**
 * Catálogo completo desde dokkan.fyi: normaliza, compara hashes contra el
 * repositorio local y aplica solo lo nuevo/modificado (con `keepDetail` para no
 * borrar fichas ya descargadas). Lanza si el respaldo también falla o parece
 * incompleto — el llamante muestra la caché.
 */
export async function syncFromFyi(): Promise<FallbackResult> {
  // 1) Página 1: lookups (link skills) + primer lote.
  const firstProps = parseFyiProps(await fetchTextUrl(fyiUrl(`/characters?per_page=${PAGE_SIZE}&page=1`), 60000));
  const linkNames: Record<number, string> = Object.fromEntries(
    (firstProps.link_skills ?? []).map((l: Record<string, unknown>) => [l.id as number, l.name as string]),
  );
  const records: Record<string, any>[] = [...(firstProps.characters?.data ?? [])];

  // 2) Resto de páginas (paralelas, sin agobiar: fyi no limita, pero se agrupa).
  const extraPages: Record<string, any>[][] = [];
  for (let page = 2; page <= MAX_PAGES; page += 6) {
    const group = Array.from({ length: 6 }, (_, i) => page + i);
    const results = await Promise.allSettled(
      group.map(async (p) => {
        const html = await fetchTextUrl(fyiUrl(`/characters?per_page=${PAGE_SIZE}&page=${p}`), 60000);
        await sleep(150);
        return (parseFyiProps(html).characters?.data ?? []) as Record<string, any>[];
      }),
    );
    let empty = true;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.length) empty = false;
        extraPages.push(r.value);
      } else {
        throw r.reason; // un fallo real de red no se enmascara
      }
    }
    if (empty) break;
  }
  for (const batch of extraPages) records.push(...batch);
  if (!records.length) throw new Error('dokkan.fyi: índice vacío');

  // 3) Normalizar + diff de hashes contra el repositorio local.
  const localHashes = getHashes();
  const normalized = [];
  const freshUnitIds: number[] = [];
  let changed = 0;
  for (const raw of records) {
    const { summary, hash } = normalizeFyiRecord(raw, linkNames);
    if (localHashes.get(summary.id) === hash) continue;
    changed += 1;
    if (!getUnits().some((u) => u.id === summary.id)) freshUnitIds.push(summary.id);
    normalized.push({ summary, detail: fullFromFyi(raw, summary), hash });
  }

  // 4) Salvaguarda anti-incompleto: el índice remoto debe cubrir ≥90 % del local.
  const localCount = getUnits().length;
  if (localCount > 100 && records.length < localCount * MIN_COVERAGE) {
    throw new Error(`dokkan.fyi: índice incompleto (${records.length} < 90 % de ${localCount})`);
  }

  // 5) Eliminadas: presentes localmente y ausentes en el índice completo.
  const remoteIds = new Set(records.map((r) => Number(r.id)));
  const removedIds = getUnits()
    .map((u) => u.id)
    .filter((id) => !remoteIds.has(id));

  const counts = await applySyncResult({ normalized, removedIds, syncedAt: Date.now(), keepDetail: true });
  console.log(
    `[fyi] Respaldo aplicado: +${counts.newUnits} nuevas, ${counts.changedUnits} modificadas, ${removedIds.length} eliminadas.`,
  );
  return counts;
}

/* ---------- Noticias (respaldo de refreshNews) ---------- */

export interface FyiNewsItem {
  id: number;
  title: string;
  summary: string;
  banner: string | null;
  startAt: string | null;
  category: string | null;
  tab: string | null;
  bodies: { id: number; image: string | null; description: string }[];
}

/** Anuncios actuales de dokkan.fyi (mismo datamine; cuerpos en línea). */
export async function fetchNewsFromFyi(): Promise<FyiNewsItem[]> {
  const props = parseFyiProps(await fetchTextUrl(fyiUrl('/news'), 60000));
  const announcements = (props.announcements?.data ?? []) as Record<string, any>[];
  return announcements.map((a) => ({
    id: a.id ?? 0,
    title: cleanText(a.title) ?? '',
    summary: a.summary_text ?? '',
    banner: a.banner ?? null,
    startAt: a.start_at ?? null,
    category: a.category ?? null,
    tab: a.tab ?? null,
    bodies: (a.bodies ?? []).map((b: Record<string, unknown> | null) => ({
      id: (b?.id as number) ?? 0,
      image: (b?.image as string) ?? null,
      description: (b?.description as string) ?? '',
    })),
  }));
}
