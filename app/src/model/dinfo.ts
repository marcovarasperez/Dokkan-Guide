import { decodeEntities } from './html';
import type { SkillText } from './types';
import { rarityFromCode } from './adapter';
import { parseEpoch } from './date';
import { INFO_CDN, INFO_ASSET, CDN_ASSET } from './constants';

/**
 * Primitivas de dokkaninfo.com: la única fuente viva de la app (Fase 9).
 *
 * Las páginas de dokkaninfo son SSR + componentes Vue: los datos llegan en
 * atributos `v-bind:NAME="{json}"` (JSON con entidades HTML) o en la API JSON
 * (/api/banners). Todas las funciones de este módulo son parseadores puros
 * sobre el HTML descargado por http.ts (transporte nativo con UA).
 *
 * Mapeos clave (verificados con matrices fyi-seed × dokkaninfo, 1458 muestras,
 * conflictos = 0):
 *  - `element` = clase*10 + tipo → dígito 2: 0=AGL 1=TEQ 2=INT 3=STR 4=PHY;
 *    dígito 1: 1=Super, 2=Extreme (0 → 'Super' por defecto).
 *  - `rarity` numérica: 0=N 1=R 2=SR 3=SSR 4=UR 5=LR.
 */

/** CDN de assets del juego (thumbs, marcos… y los "listbutton" de eventos). */

/* ------------------------------------------------------------------ *
 *  v-bind extraction
 * ------------------------------------------------------------------ */

/** Extrae y decodifica un atributo `v-bind:NAME="…"` (JSON embebido). */
function extractVBind<T>(html: string, name: string): T | null {
  const re = new RegExp(`v-bind:${name}\\s*=\\s*["']`);
  const m = re.exec(html);
  if (!m) return null;
  const quote = html[m.index + m[0].length - 1];
  const start = m.index + m[0].length;
  const end = html.indexOf(quote, start);
  if (end < 0) return null;
  try {
    return JSON.parse(decodeEntities(html.slice(start, end))) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 *  URLs de assets
 * ------------------------------------------------------------------ */

/**
 * URL absoluta de un path relativo a /assets/global/en.
 *
 * Ojo con las formas que ya traen contexto: `news_json` de /news incluye
 * rutas completas (`/assets/global/en/...`) y algún `src` puede ser una URL
 * absoluta — ahí no se vuelve a anteponer el prefijo (se duplicaba la ruta
 * y la imagen daba 404).
 */
const infoAssetUrl = (path: string): string => {
  const p = String(path).trim().replace(/^\/+/, '');
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('//')) return `https:${p}`;
  if (p.startsWith('assets/global/en/')) return `${INFO_CDN}/${p}`;
  // `banners/en/event/eve_listbutton/…` (imágenes de lista de eventos) no
  // publica dokkaninfo — dan 404 en su /assets/global — pero sí responden
  // en el CDN de assets, así que ahí se resuelven.
  if (p.startsWith('banners/')) return `${CDN_ASSET}/${p}`;
  return `${INFO_ASSET}/${p}`;
};

/**
 * URL absoluta de un path relativo a la RAÍZ del sitio (trae barra inicial):
 * `news_json` usa formas `/assets/global/en/...` y también `/images/no_news.png`
 * (respaldo cuando la noticia no tiene banner).
 */
const infoRootUrl = (path: string): string => {
  const p = String(path).trim();
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('//')) return `https:${p}`;
  return `${INFO_CDN}/${p.replace(/^\/+/, '')}`;
};

/** Miniatura de carta (card_{icon}_thumb). */
const infoThumbUrl = (iconId: number): string =>
  `${INFO_ASSET}/character/thumb/card_${iconId}_thumb/card_${iconId}_thumb.png`;

/**
 * Imagen de evento: `banner_image_path` es un fichero suelto dentro de
 * ingame/events/; `event_image_path` / `listbutton_image_path` ya son paths
 * relativos a /assets/global/en.
 */
export function eventImage(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = String(path);
  if (p.includes('/')) return infoAssetUrl(p);
  return `${INFO_ASSET}/ingame/events/${p}`;
}

/** Miniatura de objeto según el mapa de assets de dokkaninfo (null si no está mapeado). */
function itemImg(type: string, item: { id?: number | null }): string | null {
  const id = item.id ?? 0;
  if (!id) return null;
  const p5 = String(id).padStart(5, '0');
  const p7 = String(id).padStart(7, '0');
  switch (type) {
    case 'AwakeningItem':
      return `${INFO_ASSET}/item/awaken/en/thumb/thumb_awaken_items_${p5}/thumb_awaken_items_${p5}.png`;
    case 'SupportItem':
      return `${INFO_ASSET}/item/support/thumb/thumb_support_item_${p5}.png`;
    case 'TrainingItem':
      return `${INFO_ASSET}/item/training_item/thumb_training_items_${p7}.png`;
    case 'PotentialItem':
      return `${INFO_ASSET}/item/other/en/thumb/thumb_pot_orb_${p5}/thumb_pot_orb_${p5}.png`;
    case 'SpecialItem':
      return `${INFO_ASSET}/item/other/en/thumb/thumb_other_${p5}/thumb_other_${p5}.png`;
    case 'TreasureItem':
      return `${INFO_ASSET}/item/other/en/thumb/thumb_trade_jewel_${p5}/thumb_trade_jewel_${p5}.png`;
    case 'ActItem':
      return `${INFO_ASSET}/item/act/thumb/thumb_act_item_${p5}.png`;
    default:
      return null; // Card (→ ficha in-app), EventkagiItem, TrainingField, SupportFilm…
  }
}

/* ------------------------------------------------------------------ *
 *  Índice de cartas (/cards → v-bind:cardsjson)
 * ------------------------------------------------------------------ */

/** Fila cruda del catálogo (solo campos que usa la app). */
export interface DkCardRow {
  id: number;
  name: string;
  rarity: number;
  element: string;
  lv_max: number;
  skill_lv_max: number;
  icon_id: number | null;
  hp_init: number;
  hp_max: number;
  hp_hipo: number;
  atk_init: number;
  atk_max: number;
  atk_hipo: number;
  def_init: number;
  def_max: number;
  def_hipo: number;
  open_at: number | null;
  eza: number | null;
  eza_open_at: number | null;
  seza: number | null;
  seza_open_at: number | null;
  awoken_max: number | null;
  optimal_awakening_step: number | null;
}

export function parseCardsIndex(html: string): DkCardRow[] {
  const raw = extractVBind<unknown>(html, 'cardsjson');
  if (!Array.isArray(raw)) return [];
  return raw as DkCardRow[];
}

/* ------------------------------------------------------------------ *
 *  Ficha de carta (/cards/{id} → v-bind:datajson)
 * ------------------------------------------------------------------ */

/** Objeto carta completo de dokkaninfo (campos que usa la app). */
export interface DkCard {
  id: number;
  name: string;
  character_id: number | null;
  cost: number | null;
  rarity: number;
  hp_init: number;
  hp_max: number;
  atk_init: number;
  atk_max: number;
  def_init: number;
  def_max: number;
  element: string;
  lv_max: number;
  skill_lv_max: number;
  open_at: number | null;
  icon_id: number | null;
  optimal_awakening_step: number | null;
  /** Tipo de crecimiento del EZA (null = sin EZA conocido). */
  optimal_awakening_grow_type: number | null;
  /** Tablero de potential: define el bonus plano de la columna "+55%" (1200/2000/2800/1600). */
  potential_board_id: number | null;
}

export interface DkSuperAttack {
  /** 'Normal' | 'Hyper' (Ultra) | … */
  style: string;
  /** Ki inicial: 12 (normal) / 18 (ultra). */
  ki: number;
  name: string;
  description: string;
  /** Multiplicador base (increase_rate) y bonus por nivel (lv_bonus). */
  increaseRate: number | null;
  lvBonus: number | null;
  condition: string | null;
}

interface DkBannerEntry {
  id: number;
  type: string;
  name: string;
  startsAt: number | null;
  endsAt: number | null;
  image: string | null;
}

/** Medalla de despertar necesaria para subir el EZA/SEZA (cantidad total). */
export interface DkEzaMedal {
  name: string;
  quantity: number;
  /** `awakening_item_id`: permite pintar la miniatura de la medalla. */
  itemId: number;
}

/** Miniatura de carta para listas de apoyo (líderes 200%, partners, formas). */
export interface DkMiniCard {
  id: number;
  name: string;
  element: string;
  rarity: number;
  iconId: number | null;
}

export interface DkCardPage {
  card: DkCard;
  leaderSkill: SkillText | null;
  passiveSkill: SkillText | null;
  activeSkills: SkillText[];
  superAttacks: DkSuperAttack[];
  links: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  banners: DkBannerEntry[];
  summonable: string | null;
  hipo: { hp: number; atk: number; def: number };
  /** Ruta de transformaciones (incluye la propia carta). */
  transformations: { id: number; name: string; element: string; rarity: number; icon_id: number | null }[];
  /** Eventos Z-Battle donde se hace EZA de esta carta. */
  ezaBattles: { id: number; image: string | null }[];
  /** Medallas para subir el EZA, agrupadas por nombre. */
  ezaMedals: DkEzaMedal[];
  /** Medallas para subir el SEZA («Super EZA»), agrupadas por nombre. */
  sezaMedals: DkEzaMedal[];
  /** Fecha de EZA anunciada/vigente (epoch s) si la fuente la trae. */
  ezaOpenAt: number | null;
  sezaOpenAt: number | null;
  /**
   * Step de awakening donde aplica el EZA/SEZA (`optimal_awakening_step` de
   * `eza_open_date` / `seza_open_date`): la fuente publica las habilidades de
   * cada step en `/api/cards/{id}/eza?step=N`, que es la información REAL de
   * ese estado (el datajson de la página es siempre la carta base).
   */
  ezaStep: number | null;
  sezaStep: number | null;
  /** Líderes que cubren esta carta (ranking de la fuente; la ficha los separa en líderes 170 %+ y sublíderes). */
  bestLeaders: DkMiniCard[];
  /** Partners con más links en común (ranking de la fuente; excluye la propia carta). */
  linkPartners: { card: DkMiniCard; shared: number; linkIds: number[] }[];
  /**
   * true si la fuente publica la animación LWF de la carta (las de rareza <5
   * no la tienen). Usado por la ficha para pintar el <canvas> animado.
   */
  anim: boolean;
  /** Recompensas de Torneo Mundial (World Tournament). */
  tournamentRewards: { points: number; name: string; image: string | null; tournamentId: number | null }[];
}

interface RawSkill {
  name?: string | null;
  description?: string | null;
  itemized_description?: string | null;
  effect_description?: string | null;
  condition_description?: string | null;
}

interface RawSuperAttack {
  style?: string | null;
  eball_num_start?: number | null;
  causality_conditions?: string | null;
  attack?: {
    name?: string | null;
    description?: string | null;
    increase_rate?: number | null;
    lv_bonus?: number | null;
    causality_description?: string | null;
  } | null;
}

interface RawBanner {
  id?: number;
  type?: string | null;
  name?: string | null;
  open_at?: unknown;
  end_at?: unknown;
  images?: string[] | null;
}

interface RawZBattleRef {
  id?: number;
  listbutton_image_path?: string | null;
  /** Ruta alternativa del cartel del evento. */
  image?: string | null;
}

/** Recompensa de Torneo Mundial cruda del datajson. */
interface RawTournamentReward {
  points?: number | null;
  name?: string | null;
  icon_id?: number | null;
  world_tournament_id?: number | null;
}

/** Entrada cruda de `eza_medals` (una por escalón del EZA/SEZA). */
interface RawEzaMedal {
  quantity?: number | null;
  /** Set de medallas del escalón: el de `seza_open_date` marca el SEZA. */
  card_awakening_set_id?: number | null;
  awakening_item_id?: number | null;
  awakening_medal?: { name?: string | null; rarity?: number | null } | null;
}

const skillText = (s: RawSkill | null | undefined, key: 'description' | 'itemized_description' | 'effect_description'): SkillText | null => {
  if (!s) return null;
  const desc = s[key] ?? s.description ?? s.effect_description ?? null;
  if (!s.name && !desc) return null;
  return { name: (s.name ?? '').trim(), description: decodeEntities(desc ?? '') };
};

const miniCard = (c: DkCard): DkMiniCard => ({
  id: c.id,
  name: (c.name ?? '').trim(),
  element: c.element,
  rarity: c.rarity,
  iconId: c.icon_id ?? null,
});

/** Superataques crudas → forma normalizada de la app (compartida con la API de estados). */
const mapSuperAttacks = (list: RawSuperAttack[] | null | undefined): DkSuperAttack[] =>
  (list ?? []).map((sa) => ({
    style: sa.style ?? 'Normal',
    ki: sa.eball_num_start ?? 12,
    name: (sa.attack?.name ?? '').trim(),
    description: decodeEntities(sa.attack?.description ?? ''),
    increaseRate: typeof sa.attack?.increase_rate === 'number' ? sa.attack.increase_rate : null,
    lvBonus: typeof sa.attack?.lv_bonus === 'number' ? sa.attack.lv_bonus : null,
    condition: sa.attack?.causality_description ?? sa.causality_conditions ?? null,
  }));

/**
 * Habilidades de un estado concreto de la carta (EZA/SEZA) — respuesta de la
 * API que usa el propio dokkaninfo: `GET /api/cards/{id}/eza?step=N`.
 * Devuelve SOLO lo que cambia con el estado (leader, pasiva, superataques y
 * nivel máximo de SA); el resto de la ficha (stats, links, categorías) es el
 * de la carta base.
 */
export interface DkEzaSkills {
  leaderSkill: SkillText | null;
  passiveSkill: SkillText | null;
  superAttacks: DkSuperAttack[];
  /** Nivel máximo de SA en ese estado (`skill_lv_max`). */
  maxSaLevel: number | null;
}

/** Parsea la respuesta JSON de `/api/cards/{id}/eza` (null si no es válida). */
export function parseEzaSkills(json: string): DkEzaSkills | null {
  let j: {
    leader_skill?: RawSkill | null;
    passive_skill?: RawSkill | null;
    super_attacks?: RawSuperAttack[] | null;
    skill_lv_max?: number | null;
  } | null;
  try {
    j = JSON.parse(json);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const leaderSkill = skillText(j.leader_skill, 'description');
  const passiveSkill = skillText(j.passive_skill, 'itemized_description');
  if (!leaderSkill && !passiveSkill) return null;
  return {
    leaderSkill,
    passiveSkill,
    superAttacks: mapSuperAttacks(j.super_attacks),
    maxSaLevel: typeof j.skill_lv_max === 'number' ? j.skill_lv_max : null,
  };
}

/** Parsea la ficha completa de una carta (datajson). */
export function parseCardPage(html: string): DkCardPage | null {
  const raw = extractVBind<Record<string, unknown>>(html, 'datajson');
  if (!raw || typeof raw !== 'object' || !raw.card) return null;
  const j = raw as {
    card: DkCard;
    leader_skill?: RawSkill | null;
    passive_skill?: RawSkill | null;
    active_skill?: RawSkill | null;
    super_attacks?: RawSuperAttack[] | null;
    links?: { id: number; name: string }[] | null;
    categories?: { id: number; name: string }[] | null;
    banners?: RawBanner[] | null;
    summonable?: string | null;
    hp_hipo?: number | null;
    atk_hipo?: number | null;
    def_hipo?: number | null;
    transformations?: DkCard[] | null;
    extreme_z_battles?: RawZBattleRef[] | null;
    /** Medallas de despertar que exige el EZA/SEZA (agrupadas por nivel). */
    eza_medals?: RawEzaMedal[] | null;
    eza_open_date?: { open_at?: unknown; optimal_awakening_step?: number | null; card_awakening_set_id?: number | null } | null;
    seza_open_date?: { open_at?: unknown; optimal_awakening_step?: number | null; card_awakening_set_id?: number | null } | null;
    two_hundred_leaders?: DkCard[] | null;
    /** Flag de dokkaninfo: la carta tiene animación LWF publicada. */
    lwf?: boolean | null;
    max_eza_step?: number | null;
    similar_links?: { card?: DkCard | null; similar_links_count?: number | null; links?: number[] | null }[] | null;
    /** Recompensas de Torneo Mundial (World Tournament). */
    world_tournament_rewards?: RawTournamentReward[] | null;
  };

  const superAttacks: DkSuperAttack[] = mapSuperAttacks(j.super_attacks);

  // Medallas del EZA/SEZA: la fuente repite la misma medalla en varios niveles
  // (una entrada por escalón), así que se suman las cantidades por nombre y
  // se SEPARAN en EZA y SEZA. El límite es el set de medallas declarado en
  // `seza_open_date.card_awakening_set_id` (los escalones anteriores son del
  // EZA); si la ruta SEZA no existe, las medallas de rareza 4 ([SUPER]) son
  // las del SEZA.
  const sezaSetId = j.seza_open_date?.card_awakening_set_id ?? null;
  const medalTotals = new Map<string, { name: string; quantity: number; itemId: number; seza: boolean }>();
  for (const m of j.eza_medals ?? []) {
    const name = (m.awakening_medal?.name ?? '').trim();
    if (!name) continue;
    const seza =
      sezaSetId !== null ? m.card_awakening_set_id === sezaSetId : (m.awakening_medal?.rarity ?? 0) >= 4;
    const key = `${seza ? 'seza' : 'eza'}|${name}`;
    const cur = medalTotals.get(key);
    if (cur) cur.quantity += m.quantity ?? 0;
    else medalTotals.set(key, { name, quantity: m.quantity ?? 0, itemId: m.awakening_item_id ?? 0, seza });
  }
  const pickMedals = (seza: boolean): DkEzaMedal[] =>
    [...medalTotals.values()]
      .filter((m) => m.seza === seza)
      .map(({ name, quantity, itemId }) => ({ name, quantity, itemId }))
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  const ezaMedals = pickMedals(false);
  const sezaMedals = pickMedals(true);

  const banners: DkBannerEntry[] = (j.banners ?? []).map((b) => ({
    id: b.id ?? 0,
    type: b.type ?? '',
    name: (b.name ?? '').trim(),
    startsAt: parseEpoch(b.open_at),
    endsAt: parseEpoch(b.end_at),
    image: b.images?.[0] ? infoAssetUrl(b.images[0]) : null,
  }));

  // Recompensas de Torneo Mundial (World Tournament)
  const tournamentRewards = (j.world_tournament_rewards ?? []).map((r) => ({
    points: r.points ?? 0,
    name: (r.name ?? '').trim(),
    image: r.icon_id ? infoThumbUrl(r.icon_id) : null,
    tournamentId: r.world_tournament_id ?? null,
  })).filter((r) => r.points > 0 && r.name);

  return {
    card: j.card,
    leaderSkill: skillText(j.leader_skill, 'description'),
    passiveSkill: skillText(j.passive_skill, 'itemized_description'),
    activeSkills: j.active_skill ? [skillText(j.active_skill, 'effect_description')].filter((s): s is SkillText => s !== null) : [],
    superAttacks,
    links: (j.links ?? []).map((l) => ({ id: l.id, name: l.name })),
    categories: (j.categories ?? []).map((c) => ({ id: c.id, name: c.name })),
    banners,
    summonable: typeof j.summonable === 'string' ? j.summonable : null,
    hipo: { hp: j.hp_hipo ?? 0, atk: j.atk_hipo ?? 0, def: j.def_hipo ?? 0 },
    transformations: (j.transformations ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      element: c.element,
      rarity: c.rarity,
      icon_id: c.icon_id ?? null,
    })),
    ezaBattles: (j.extreme_z_battles ?? []).map((z) => ({
      id: z.id ?? 0,
      image: eventImage(z.listbutton_image_path) ?? (z.image ? infoAssetUrl(z.image) : null),
    })),
    ezaMedals,
    sezaMedals,
    ezaOpenAt: parseEpoch(j.eza_open_date),
    sezaOpenAt: parseEpoch(j.seza_open_date),
    // Step de awakening donde aplica cada estado: son los que pide la API de
    // habilidades por estado (`/api/cards/{id}/eza?step=N`).
    ezaStep: j.eza_open_date?.optimal_awakening_step ?? null,
    sezaStep: j.seza_open_date?.optimal_awakening_step ?? null,
    bestLeaders: (j.two_hundred_leaders ?? []).filter((c) => c && c.id).map(miniCard),
    // Animación de la carta: la fuente solo publica .lwf para rareza SR+ (>=5)
    // y solo si el datajson trae el flag `lwf` (como hace su propio <canvas>).
    anim: (j.lwf ?? true) && j.card.rarity >= 5,
    linkPartners: (j.similar_links ?? [])
      .filter((s) => s.card && s.card.id && s.card.id !== j.card.id)
      .map((s) => ({
        card: miniCard(s.card as DkCard),
        shared: s.similar_links_count ?? s.links?.length ?? 0,
        linkIds: s.links ?? [],
      })),
    // Recompensas de Torneo Mundial
    tournamentRewards,
  };
}

/* ------------------------------------------------------------------ *
 *  Eventos (listados + detalle con etapas y drops)
 * ------------------------------------------------------------------ */

interface DkEventEntry {
  id: number;
  /** Nombre del evento (null en filas solo-imagen como dbstories). */
  name: string | null;
  image: string | null;
  startsAt: number | null;
  endsAt: number | null;
}

interface RawEventRow {
  id?: number;
  name?: string | null;
  event_image_path?: string | null;
  banner_image_path?: string | null;
  listbutton_image_path?: string | null;
  first_released_at?: unknown;
  start_at?: unknown;
  end_at?: unknown;
}

interface RawBudokai {
  id?: number;
  name?: string | null;
  start_at?: unknown;
  end_at?: unknown;
  listbutton_image_path?: string | null;
}

/**
 * Listado de eventos de un tipo:
 *  - limited/story/zbattle/… → `v-bind:eventjson` (con nombre e imagen);
 *  - quest/dbstories → filas SSR `<a href=/events/T/N>` (imagen y, en quest,
 *    nombre "Area N: …");
 *  - worldtournament → `v-bind:budokais_json`.
 */
export function parseEventList(html: string): DkEventEntry[] {
  const rows = extractVBind<RawEventRow[] | { data?: RawBudokai[] }>(html, 'eventjson');
  if (Array.isArray(rows)) {
    return rows
      .filter((r) => typeof r.id === 'number')
      .map((r) => ({
        id: r.id as number,
        name: r.name ? decodeEntities(r.name) : null,
        image: eventImage(r.event_image_path) ?? eventImage(r.banner_image_path) ?? eventImage(r.listbutton_image_path),
        startsAt: parseEpoch(r.start_at),
        endsAt: parseEpoch(r.end_at),
      }));
  }

  const budokais = extractVBind<{ data?: RawBudokai[] }>(html, 'budokais_json');
  const budokaiRows = budokais?.data;
  if (Array.isArray(budokaiRows)) {
    return budokaiRows
      .filter((r) => typeof r.id === 'number')
      .map((r) => ({
        id: r.id as number,
        name: r.name ? decodeEntities(r.name) : null,
        image: eventImage(r.listbutton_image_path),
        startsAt: parseEpoch(r.start_at),
        endsAt: parseEpoch(r.end_at),
      }));
  }

  // Filas SSR (quest / dbstories): sin data embebida.
  return parseEventRows(html);
}

function parseEventRows(html: string): DkEventEntry[] {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: DkEventEntry[] = [];
  const seen = new Set<number>();
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const m = a.getAttribute('href')?.match(/\/events\/[a-z]+\/(\d+)$/);
    if (!m) continue;
    const id = Number(m[1]);
    if (seen.has(id)) continue;
    seen.add(id);
    const img = a.querySelector('img[src]');
    const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
    out.push({
      id,
      name: text || null,
      image: img ? infoAssetUrl(img.getAttribute('src') ?? '') : null,
      startsAt: null,
      endsAt: null,
    });
  }
  return out;
}

export interface DkEventStageDrop {
  kind: 'card' | 'item';
  id: number;
  name: string;
  /** Para cartas: element (tipo+clase) y rareza; para objetos: tipo de item. */
  element: string | null;
  rarity: string | null;
  itemType: string | null;
  quantity: number;
  image: string | null;
}

interface DkEventStage {
  id: number | null;
  difficulty: string | null;
  stamina: number | null;
  userExp: number | null;
  zeni: number | null;
  linkRate: number | null;
  clearRewards: DkEventStageDrop[];
  dropRewards: DkEventStageDrop[];
}

interface DkEventLevel {
  name: string;
  stages: DkEventStage[];
}

export interface DkEventDetail {
  /** Título de la página (… | Dokkan Info!). */
  title: string | null;
  /** En Z-Battles: la carta objetivo del EZA. */
  unit: { id: number; name: string; iconId: number; rarity: number; element: string } | null;
  levels: DkEventLevel[];
}

interface RawReward {
  item_type?: string | null;
  quantity?: number | null;
  drop_type?: number | null;
  item?: ({ id?: number; name?: string | null; rarity?: number; element?: string | null; icon_id?: number | null } | null) | null;
  card?: ({ id?: number; name?: string | null; rarity?: number; element?: string | null; icon_id?: number | null } | null) | null;
}

function mapReward(raw: RawReward): DkEventStageDrop | null {
  const quantity = typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1;
  const type = String(raw.item_type ?? '');
  if (type === 'Card') {
    const c = raw.item ?? raw.card;
    if (!c || typeof c.id !== 'number') return null;
    return {
      kind: 'card',
      id: c.id,
      name: decodeEntities(c.name ?? ''),
      element: c.element ?? null,
      rarity: c.rarity != null ? rarityFromCode(c.rarity) : null,
      itemType: 'Card',
      quantity,
      image: infoThumbUrl(c.icon_id ?? c.id),
    };
  }
  if (type.startsWith('Point::')) {
    const label = type.slice('Point::'.length);
    return {
      kind: 'item',
      id: 0,
      name: label === 'Stone' ? 'Dragon Stone' : label,
      element: null,
      rarity: null,
      itemType: type,
      quantity,
      image: null,
    };
  }
  const item = raw.item;
  if (!item || typeof item.id !== 'number') return null;
  return {
    kind: 'item',
    id: item.id,
    name: decodeEntities(item.name ?? ''),
    element: null,
    rarity: item.rarity != null ? rarityFromCode(item.rarity) : null,
    itemType: type || null,
    quantity,
    image: itemImg(type, item),
  };
}

/**
 * Detalle de un evento (/events/{type}/{id}): niveles, etapas (ID, dificultad,
 * STA, EXP, Zeni, tasa de link) y recompensas por etapa (clear + drops del
 * jefe) a partir de los componentes `v-bind:reward` en orden de aparición.
 */
export function parseEventDetail(html: string): DkEventDetail {
  const title = extractPageTitle(html);
  const unitRaw = extractVBind<{ id?: number; name?: string; icon_id?: number; rarity?: number; element?: string }>(html, 'card');
  const unit = unitRaw && typeof unitRaw.id === 'number'
    ? {
        id: unitRaw.id,
        name: decodeEntities(unitRaw.name ?? ''),
        iconId: unitRaw.icon_id ?? unitRaw.id,
        rarity: unitRaw.rarity ?? 0,
        element: unitRaw.element ?? '00',
      }
    : null;

  const levels: DkEventLevel[] = [];
  if (typeof DOMParser === 'undefined') return { title, unit, levels };

  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Estado mutable en un objeto: el narrowing de TS sobre `let` asignadas en
  // closures (solo lectura en el ámbito exterior) no es fiable aquí.
  const ctx: { level: DkEventLevel; stage: DkEventStage | null; lastLabel: 'clear' | 'drop' | null } = {
    level: { name: '', stages: [] },
    stage: null,
    lastLabel: null,
  };

  const pushLevel = (): void => {
    if (ctx.level.stages.length > 0 || ctx.level.name) levels.push(ctx.level);
  };
  const newLevel = (name: string): void => {
    pushLevel();
    ctx.level = { name, stages: [] };
    ctx.stage = null;
    ctx.lastLabel = null;
  };
  const newStage = (partial: DkEventStage): void => {
    if (ctx.level.name === '') newLevel(''); // niveles sin encabezado
    ctx.stage = partial;
    ctx.level.stages.push(partial);
    ctx.lastLabel = null;
  };

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const rewardAttr = el.getAttribute?.('v-bind:reward');
      if (rewardAttr) {
        try {
          const mapped = mapReward(JSON.parse(decodeEntities(rewardAttr)) as RawReward);
          if (mapped && ctx.stage) {
            (ctx.lastLabel === 'drop' ? ctx.stage.dropRewards : ctx.stage.clearRewards).push(mapped);
          }
        } catch {
          /* atributo malformado: se ignora */
        }
        continue;
      }
      if (el.tagName === 'A') {
        const m = el.getAttribute('href')?.match(/\/events\/[a-z]+\/\d+\/(\d+)$/);
        if (m) {
          const txt = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          const difficulty = [...el.querySelectorAll('b')]
            .map((b) => (b.textContent ?? '').trim())
            .find((t) => /^[A-Z][A-Z-]+$/.test(t)) ?? null;
          const sta = txt.match(/\bSTA\s*(\d+)/);
          const exp = txt.match(/User Exp\s*(\d+)/);
          const zeni = txt.match(/Zeni\s*(\d+)/);
          const linkRate = txt.match(/Link Level Rate\s*([\d.]+)/);
          newStage({
            id: Number(m[1]),
            difficulty,
            stamina: sta ? Number(sta[1]) : null,
            userExp: exp ? Number(exp[1]) : null,
            zeni: zeni ? Number(zeni[1]) : null,
            linkRate: linkRate ? Number(linkRate[1]) : null,
            clearRewards: [],
            dropRewards: [],
          });
        }
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? '';
      if (/\bClear Reward\b/.test(text)) {
        ctx.lastLabel = 'clear';
      } else if (/\bDrop Reward/.test(text)) {
        ctx.lastLabel = 'drop';
      } else {
        const named = text.match(/^\s*Level\s+(\d+):\s*(.+?)\s*$/);
        const bare = text.match(/^\s*Level\s+(\d+)\s*$/);
        if (named) {
          newLevel(named[2]);
        } else if (bare) {
          newLevel(`Level ${bare[1]}`);
        }
      }
    }
  }
  pushLevel();
  return { title, unit, levels: levels.filter((l) => l.stages.length > 0) };
}

/** Título de la página: `<title>… | Dokkan Info!` (con og:title de respaldo). */
function extractPageTitle(html: string): string | null {
  const t = html.match(/<title>\s*([^<]+?)\s*\|?\s*Dokkan Info!?\s*<\/title>/i);
  const title = t?.[1] ?? null;
  if (title) return decodeEntities(title).trim();
  const og = html.match(/property="og:title"\s+content="([^"]+)"/);
  return og ? decodeEntities(og[1]).replace(/\s*\|\s*Dokkan Info!?$/i, '').trim() : null;
}

/* ------------------------------------------------------------------ *
 *  Misiones (/missions → v-bind:missioncategoriesset)
 * ------------------------------------------------------------------ */

interface DkMissionReward {
  name: string;
  quantity: number;
  image: string | null;
  cardId: number | null;
}

interface DkMission {
  id: number;
  name: string;
  startsAt: number | null;
  endsAt: number | null;
  rewards: DkMissionReward[];
}

export interface DkMissionCategory {
  id: number;
  name: string;
  image: string | null;
  missions: DkMission[];
}

interface RawMissionReward {
  item_type?: string | null;
  quantity?: number | null;
  item?: { id?: number; name?: string | null } | null;
}

interface RawMission {
  id?: number;
  name?: string | null;
  start_at?: unknown;
  end_at?: unknown;
  mission_rewards?: Record<string, RawMissionReward> | null;
}

interface RawMissionCategory {
  id?: number;
  name?: string | null;
  image_path?: string | null;
  missions?: Record<string, RawMission> | RawMission[] | null;
}

export function parseMissions(html: string): { categories: DkMissionCategory[]; lastPage: number } {
  const raw = extractVBind<{ data?: RawMissionCategory[]; last_page?: number }>(html, 'missioncategoriesset');
  const cats = raw?.data ?? [];
  return {
    lastPage: raw?.last_page ?? 1,
    categories: cats.map((c) => {
    const missionValues = Array.isArray(c.missions) ? c.missions : Object.values(c.missions ?? {});
    return {
      id: c.id ?? 0,
      name: decodeEntities(c.name ?? ''),
      image: c.image_path ? infoAssetUrl(c.image_path) : null,
      missions: missionValues.map((m) => ({
        id: m.id ?? 0,
        name: decodeEntities((m.name ?? '').replace(/\s*\n\s*/g, ' ')),
        startsAt: parseEpoch(m.start_at),
        endsAt: parseEpoch(m.end_at),
        rewards: Object.values(m.mission_rewards ?? {}).map((r) => {
          const type = String(r.item_type ?? '');
          return {
            name: decodeEntities(r.item?.name ?? (type === 'Point::Stone' ? 'Dragon Stone' : type)),
            quantity: typeof r.quantity === 'number' ? r.quantity : 1,
            image: type === 'Point::Stone' ? null : r.item ? itemImg(type, r.item) : null,
            cardId: type === 'Card' ? r.item?.id ?? null : null,
          };
        }),
      })),
    };
  }),
  };
}

/* ------------------------------------------------------------------ *
 *  Noticias (/news → v-bind:news_json + detalle SSR /news/{id})
 * ------------------------------------------------------------------ */

interface DkNewsRow {
  id: number;
  category: number | null;
  title: string;
  summary: string;
  banner: string | null;
  startAt: number | null;
}

interface RawNewsRow {
  id?: number;
  category?: number | null;
  title?: string | null;
  summary?: string | null;
  banner?: string | null;
  start_at?: unknown;
}

export function parseNewsList(html: string): { items: DkNewsRow[]; lastPage: number } {
  const raw = extractVBind<{ data?: RawNewsRow[]; last_page?: number }>(html, 'news_json');
  const items = (raw?.data ?? [])
    .filter((n): n is RawNewsRow & { id: number } => typeof n.id === 'number')
    .map((n) => ({
      id: n.id,
    category: typeof n.category === 'number' ? n.category : null,
    title: decodeEntities(n.title ?? '').trim(),
    summary: decodeEntities(n.summary ?? '').trim(),
    banner: n.banner ? infoRootUrl(n.banner) : null,
    startAt: parseEpoch(n.start_at),
  }));
  return { items, lastPage: raw?.last_page ?? 1 };
}

/**
 * Cuerpo de una noticia: el bloque `div.row … bg-main` que abre con el título
 * (bg-third). Se devuelve su innerHTML tal cual (estilos inline + imgs de
 * /ingame/news/), para que la vista lo sane y cargue las imágenes vía ORB.
 */
export function extractNewsBody(html: string): string | null {
  if (typeof DOMParser === 'undefined') return null;
  const title = extractPageTitle(html);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Localizar el <b> del título dentro de una fila bg-third.
  for (const b of Array.from(doc.querySelectorAll('b'))) {
    const text = (b.textContent ?? '').trim();
    if (!text || !title || text !== title) continue;
    const row = b.closest('div.row');
    if (!row || !row.classList.contains('bg-third')) continue;
    const container = row.parentElement;
    if (!container || !container.classList.contains('row')) continue;
    // Quitar la fila de título del cuerpo.
    const body = container.cloneNode(true) as HTMLElement;
    const firstRow = body.querySelector('div.row.bg-third');
    firstRow?.remove();
    return body.innerHTML.trim();
  }
  return null;
}
