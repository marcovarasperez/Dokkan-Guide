#!/usr/bin/env node
/**
 * tools/sync.mjs — Generación de la SEMILLA offline de unidades (units.index + meta
 * + news.seed) desde dokkan.fyi. La fuente viva de la app (Fase 9) es dokkaninfo.com
 * (sync.ts en caliente); esta semilla solo sirve como caché de primera apertura.
 *
 * Uso:
 *   node tools/sync.mjs              # descarga/actualiza el seed completo
 *   node tools/sync.mjs --check      # solo informa si hay cambios (no escribe)
 *
 * Genera en app/public/data/:
 *   units.index.json   — resúmenes compactos de todas las unidades (listado + filtros + detalle offline básico)
 *   meta.json          — versión de esquema, fecha de generación y hash por unidad (para detección incremental)
 *   news.seed.json     — noticias y banners actuales (primera apertura offline, Fase 5)
 *
 * Estrategia incremental (el origen no ofrece ETag/Last-Modified):
 *   cada unidad se normaliza y se le calcula un hash FNV-1a estable. Al sincronizar,
 *   solo se persisten las unidades cuyo hash difiere del anterior.
 *
 * Proyecto fan no comercial. Datos: DOKKAN.FYI (semilla). No se redistribuyen assets:
 * las imágenes se cargan en la app en caliente (CDN de arte / dokkaninfo).
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'app', 'public', 'data');
const BASE = 'https://dokkan.fyi';
const UA = 'DokkanFanGuide/1.0 (fan project; local personal use; data: dokkan.fyi)';
const PAGE_SIZE = 96;          // el servidor fija 96 por página
const MAX_PAGES = 40;          // salvaguarda
const DELAY_MS = 200;          // cortesía entre peticiones
const SCHEMA_VERSION = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hash FNV-1a 32-bit (hex). Barato y suficiente para detectar cambios. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** JSON.stringify con claves ordenadas → hash estable ante reordenamientos. */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

async function fetchText(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

/** Extrae el JSON de props de Inertia embebido en el HTML de dokkan.fyi. */
function parseInertiaProps(html, url) {
  const m = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`No se encontró data-page en ${url}`);
  return JSON.parse(m[1]).props;
}

const cleanText = (s) => (typeof s === 'string' ? s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : s);

/** Normaliza un registro crudo del índice a la forma de la app.
 *  ¡Debe coincidir EXACTAMENTE con normalizeRecord de app/src/data/adapter.ts! */
function normalizeRecord(raw, linkNames) {
  const summary = {
    id: raw.id,
    name: cleanText(raw.name) ?? '',
    rarity: raw.rarity_text ?? 'UR',               // N | R | SR | SSR | UR | LR
    type: raw.type_text ?? 'AGL',                  // AGL | TEQ | INT | STR | PHY
    class: raw.awakening_type_text ?? 'Super',     // Super | Extreme
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
    stats: {
      hp: { base: raw.stats?.hp?.base ?? 0, max: raw.stats?.hp?.max ?? 0, eza: raw.stats?.hp?.eza ?? 0 },
      atk: { base: raw.stats?.atk?.base ?? 0, max: raw.stats?.atk?.max ?? 0, eza: raw.stats?.atk?.eza ?? 0 },
      def: { base: raw.stats?.def?.base ?? 0, max: raw.stats?.def?.max ?? 0, eza: raw.stats?.def?.eza ?? 0 },
    },
    hpGains: raw.hidden_potential
      ? { hp: raw.hidden_potential.hp ?? 0, atk: raw.hidden_potential.atk ?? 0, def: raw.hidden_potential.def ?? 0 }
      : null,
    linkIds: raw.link_skill_ids ?? [],
    linkNames: (raw.link_skill_ids ?? []).map((id) => linkNames[id] ?? `#${id}`),
    leaderSkill: raw.leader_skill
      ? { name: cleanText(raw.leader_skill.name) ?? '', description: cleanText(raw.leader_skill.description) ?? '' }
      : null,
    passiveSkill: raw.passive_skill
      ? { name: cleanText(raw.passive_skill.name) ?? '', description: cleanText(raw.passive_skill.description) ?? '' }
      : null,
  };

  const detail = {
    characterId: raw.character_id ?? null,
    canonicalId: raw.canonical_id ?? null,
    kiMultipliers: raw.ki_multipliers ?? null,
    activeSkills: (raw.active_skills ?? []).map((s) => ({
      name: cleanText(s?.name) ?? '',
      description: cleanText(s?.description) ?? '',
    })),
    standbySkill: raw.standby_skill
      ? { name: cleanText(raw.standby_skill?.name) ?? '', description: cleanText(raw.standby_skill?.description) ?? '' }
      : null,
    eza: raw.extreme_z_awakening
      ? {
          maxLevel: raw.extreme_z_awakening.max_level ?? null,
          maxSALevel: raw.extreme_z_awakening.max_super_attack_level ?? null,
          leaderSkill: raw.extreme_z_awakening.leader_skill
            ? {
                name: cleanText(raw.extreme_z_awakening.leader_skill.name) ?? '',
                description: cleanText(raw.extreme_z_awakening.leader_skill.description) ?? '',
              }
            : null,
        }
      : null,
    isReversiblyExchanged: !!raw.is_reversibly_exchanged,
    reversibleExchangeCharacterId: raw.reversible_exchange_character_id ?? null,
    transformationPath: (raw.transformation_path_characters ?? []).map((c) => ({
      id: c?.id ?? null, name: cleanText(c?.name) ?? '', type: c?.type_text, rarity: c?.rarity_text,
    })),
    treasureExchanges: (raw.treasure_exchanges ?? []).length,
    isFreelyObtainable: !!raw.is_freely_obtainable,
    isStageDropReward: !!raw.is_stage_drop_reward,
    isWorldTournamentReward: !!raw.is_world_tournament_reward,
    hasBattleMotion: !!raw.has_battle_motion,
  };

  return { summary, detail, hash: fnv1a(stable({ summary, detail })) };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  console.log(`[sync] Leyendo índice de ${BASE}/characters …`);

  // 1) Lookups internos (link skills) — vienen en las props compartidas de cualquier página;
  //    solo se usan para normalizar las unidades (ya no se empaqueta lookups.json).
  const firstHtml = await fetchText(`${BASE}/characters?per_page=100&page=1`);
  const firstProps = parseInertiaProps(firstHtml, `${BASE}/characters?page=1`);
  const linkNames = Object.fromEntries((firstProps.link_skills ?? []).map((l) => [l.id, l.name]));
  console.log(`[sync] Lookups: ${Object.keys(linkNames).length} links.`);

  // 2) Páginas del índice hasta encontrar una vacía.
  const records = [];
  let page = 1;
  let props = firstProps;
  for (; page <= MAX_PAGES; page++) {
    if (page > 1) {
      await sleep(DELAY_MS);
      const html = await fetchText(`${BASE}/characters?per_page=100&page=${page}`);
      props = parseInertiaProps(html, `${BASE}/characters?page=${page}`);
    }
    const batch = props.characters?.data ?? [];
    if (batch.length === 0) break;
    records.push(...batch);
    process.stdout.write(`\r[sync] Página ${page}: ${records.length} unidades…`);
  }
  console.log(`\n[sync] Total indexado: ${records.length} unidades.`);

  // 3) Normalizar + hash.
  const units = records.map((r) => normalizeRecord(r, linkNames));

  // 4) Comparación con el seed anterior (solo informar o preparar delta).
  const metaPath = join(OUT_DIR, 'meta.json');
  let prevHashes = {};
  if (existsSync(metaPath)) {
    try { prevHashes = JSON.parse(readFileSync(metaPath, 'utf8')).hashes ?? {}; } catch { /* seed corrupto → resincroniza todo */ }
  }
  const changed = units.filter((u) => prevHashes[u.summary.id] !== u.hash).map((u) => u.summary.id);
  const removed = Object.keys(prevHashes).filter((id) => !units.some((u) => String(u.summary.id) === id));
  console.log(`[sync] Cambios vs seed anterior: ${changed.length} nuevas/modificadas, ${removed.length} eliminadas.`);

  if (checkOnly) return;

  // 5) Escritura de seeds.
  mkdirSync(OUT_DIR, { recursive: true });
  const writeJson = (name, data) => {
    writeFileSync(join(OUT_DIR, name), JSON.stringify(data));
    const kb = (JSON.stringify(data).length / 1024).toFixed(0);
    console.log(`[sync] Escrito ${name} (${kb} KB)`);
  };
  writeJson('units.index.json', units.map((u) => u.summary));
  writeJson('meta.json', {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: BASE,
    attribution: 'Data: DOKKAN.FYI',
    unitCount: units.length,
    hashes: Object.fromEntries(units.map((u) => [u.summary.id, u.hash])),
  });
  // 6) Seed de noticias y banners (Fase 5): primera apertura instantánea y offline.
  try {
    const [newsHtml, summonHtml] = await Promise.all([fetchText(`${BASE}/news`), fetchText(`${BASE}/summons`)]);
    const announcements = parseInertiaProps(newsHtml, `${BASE}/news`).announcements?.data ?? [];
    const summons = parseInertiaProps(summonHtml, `${BASE}/summons`).summons?.data ?? [];
    const newsSeed = announcements.map((a) => ({
      id: a.id,
      title: cleanText(a.title) ?? '',
      banner: a.banner ?? '',
      summary: a.summary_text ?? '',
      startAt: a.start_at ?? '',
      tab: a.tab ?? '',
      category: a.category ?? '',
      bodies: (a.bodies ?? []).map((b) => ({
        id: b.id ?? 0,
        image: b.image ?? '',
        description: b.description ?? '',
      })),
    }));
    const bannerSeed = summons.map((s) => ({
      id: s.id,
      name: cleanText(s.name) ?? '',
      description: s.description_text ?? '',
      category: s.category ?? '',
      startsAt: s.starts_at ?? '',
      endsAt: s.ends_at ?? null,
      banner: s.banner ?? '',
      featured: [],
    }));
    // Personajes destacados: detalle por banner (best-effort, tope 4)
    await Promise.all(
      bannerSeed.slice(0, 4).map(async (b) => {
        try {
          const detailHtml = await fetchText(`${BASE}/summons/${b.id}`);
          const summon = parseInertiaProps(detailHtml, `${BASE}/summons/${b.id}`).summon;
          b.featured = (summon?.featured_characters ?? [])
            .map((f) => ({
              id: f.character_id ?? f.character?.id ?? 0,
              tid: f.character?.thumbnail_id ?? 0,
              name: cleanText(f.character?.name) ?? '',
              typeText: f.character?.type_text ?? '',
              rarityText: f.character?.rarity_text ?? '',
            }))
            .filter((f) => f.id > 0);
        } catch (e) {
          console.log(`[sync] Aviso: banner ${b.id} sin personajes destacados (${e.message}).`);
        }
      }),
    );
    writeJson('news.seed.json', { fetchedAt: Date.now(), news: newsSeed, banners: bannerSeed });
  } catch (e) {
    console.log(`[sync] Aviso: seed de noticias no generado (${e.message}).`);
  }

  console.log('[sync] Listo.');
}

main().catch((e) => { console.error('[sync] ERROR:', e.message); process.exit(1); });
