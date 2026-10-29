#!/usr/bin/env node
/**
 * tools/sync.mjs — Generación de la SEMILLA offline de unidades (units.index + meta
 * + news.seed) desde **dokkaninfo.com** (fuente única).
 *
 * Uso:
 *   node tools/sync.mjs              # descarga/actualiza el seed completo
 *   node tools/sync.mjs --check      # solo informa si hay cambios (no escribe)
 *
 * Genera en app/public/data/:
 *   units.index.json   — resúmenes compactos de todas las unidades
 *   meta.json          — versión de esquema, fecha y hash por unidad
 *   news.seed.json     — noticias y banners actuales (primera apertura offline)
 *
 * Nota: dokkaninfo.com bloquea Node.js (403 Cloudflare) → usa curl.exe
 * con UA de navegador, igual que drops_sync.mjs / zbattles_sync.mjs.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'app', 'public', 'data');
const INFO = 'https://dokkaninfo.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SCHEMA_VERSION = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hash FNV-1a 32-bit (hex). Debe coincidir con app/src/model/hash.ts */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** JSON.stringify con claves ordenadas → hash estable */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

/** Descarga HTML vía curl.exe (salta Cloudflare) */
async function fetchText(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const { stdout } = await run(
        'curl.exe',
        ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url],
        { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      );
      if (!stdout || stdout.length < 200) throw new Error(`Respuesta vacía/corta en ${url}`);
      return stdout;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

/** Decodifica entidades HTML (espejo exacto de decodeEntities en app/src/model/html.ts) */
function decode(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Extrae `v-bind:name="..."` del HTML (espejo de drops_sync.mjs) */
function extractVBind(html, name) {
  const m = html.match(new RegExp(`v-bind:${name}\\s*=\\s*(["'])`));
  if (!m) return null;
  const quote = m[0].slice(-1);
  const start = m.index + m[0].length;
  const end = html.indexOf(quote, start);
  if (end < 0) return null;
  try {
    return JSON.parse(decode(html.slice(start, end)));
  } catch {
    return null;
  }
}

/** Extrae `v-bind:cardsjson="..."` del HTML de /cards */
function extractCardsJson(html) {
  return extractVBind(html, 'cardsjson');
}

/** Extrae props de Inertia de /news y /summons */
function parseInertiaProps(html, url) {
  const m = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`No se encontró data-page en ${url}`);
  return JSON.parse(m[1]).props;
}

const cleanText = (s) => (typeof s === 'string' ? s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : s);

/** Sentinelas de "sin fecha" (>= 2038-01-19) que usa dokkaninfo (espejo de app/src/model/date.ts). */
const TIME_SENTINEL = 2_145_000_000;

/** Epoch válido: número > 0 y sin sentinelas. `false`/`null`/0 → null. */
const epoch = (v) => (typeof v === 'number' && v > 0 && v < TIME_SENTINEL ? Math.round(v) : null);

/**
 * Reglas del widget "Most Recent Cards" de dokkaninfo.com — una carta por ficha,
 * sin formas pre-despertar ni estados transformados (verificado 25/25 contra el widget).
 *  - open_at ya publicada (descarta sentinelas 2038 y lançamientos futuros)
 *  - awoken_max >= 1 (excluye formas pre-Dokkan-Awaken, p.ej. 1034940/1034941)
 *  - id < 4000000 (estados transformados de otra carta, p.ej. Super Vegito 4034771)
 *  - sin variantes "sin página propia": si el icono apunta a otra fila del catálogo,
 *    esa otra fila (dueña del icono) es la que se muestra
 */
function widgetRuleReason(r, catalogIds, nowSec) {
  const open = r.open_at ?? 0;
  if (!(open > 0 && open < nowSec)) return 'open_at futuro/sentinel';
  if ((r.awoken_max ?? 0) < 1) return 'aw0 (pre-despertar)';
  if (Number(r.id) >= 4000000) return 'id>=4M (transformación)';
  const icon = r.icon_id ?? r.id;
  if (icon !== r.id && catalogIds.has(icon)) return 'variante (icono apunta a otra fila)';
  return null;
}

/** Construye la ruta de transformaciones para un personaje */
function buildTransformationPath(records, finalFormId) {
  const rarityOrder = { 5: 5, 4: 4, 3: 3 };
  return records
    .sort((a, b) => {
      const ra = rarityOrder[a.rarity] ?? 0;
      const rb = rarityOrder[b.rarity] ?? 0;
      if (ra !== rb) return ra - rb;
      return Number(a.awakening_number ?? 0) - Number(b.awakening_number ?? 0);
    })
    .map(r => ({
      id: r.id,
      name: r.name,
      rarity: r.rarity,
      awakeningNumber: r.awakening_number ?? null,
      isFinal: r.id === finalFormId,
    }));
}

/** Normaliza un registro del catálogo a UnitSummary + detalle para hash */
function normalizeRecord(raw, transformationPath = []) {
  // Mapeo de rareza numérica a texto (dokkaninfo usa: 3=SSR, 4=UR, 5=LR, 2=SR, 1=R, 0=N)
  const rarityMap = { 0: 'N', 1: 'R', 2: 'SR', 3: 'SSR', 4: 'UR', 5: 'LR' };
  const rarity = rarityMap[raw.rarity] ?? 'UR';

  // Mapeo de tipo: usar bg_element directamente (0=AGL, 1=TEQ, 2=INT, 3=STR, 4=PHY)
  // El campo element parece ser variante/etapa, no el tipo real
  const typeMap = { '0': 'AGL', '1': 'TEQ', '2': 'INT', '3': 'STR', '4': 'PHY' };
  const type = typeMap[String(raw.bg_element ?? raw.element[0])] ?? 'AGL';

  // Clase (Super/Extreme) - no viene en el catálogo, usamos Super por defecto
  // raw_attributes: [1]=Super, [2]=Extreme (verificar)
  const classMap = { 1: 'Super', 2: 'Extreme' };
  const cls = (raw.raw_attributes?.[0] && classMap[raw.raw_attributes[0]]) ?? 'Super';

  // Fechas: open_at = lanzamiento inicial, eza_open_at = EZA, seza_open_at = SEZA.
  // Validadas con `epoch` para que `false`/0/sentinelas no arruinen `latest`
  // (un latest inválido hundiría la carta al final del orden "recientes").
  const initial = epoch(raw.open_at);
  const ezaDate = epoch(raw.eza_open_at);
  const sezaDate = epoch(raw.seza_open_at);
  const hasEza = raw.eza === 1;
  const hasSeza = raw.seza === 1;
  const latest = sezaDate ?? ezaDate ?? initial;
  const latestType = sezaDate ? 'seza' : ezaDate ? 'eza' : initial ? 'initial' : null;

  // Stats: hp_init/hp_max/hp_hipo, atk_init/atk_max/atk_hipo, def_init/def_max/def_hipo
  // hp_hipo = stats máximos con potential oculto al máximo (nivel 255)
  const hp = {
    base: raw.hp_init ?? 0,
    max: raw.hp_max ?? 0,
    eza: raw.hp_hipo ?? raw.hp_max ?? 0,
  };
  const atk = {
    base: raw.atk_init ?? 0,
    max: raw.atk_max ?? 0,
    eza: raw.atk_hipo ?? raw.atk_max ?? 0,
  };
  const def = {
    base: raw.def_init ?? 0,
    max: raw.def_max ?? 0,
    eza: raw.def_hipo ?? raw.def_max ?? 0,
  };

  const summary = {
    id: raw.id,
    characterId: raw.icon_id ?? null,  // Usar icon_id para agrupar transformaciones
    name: cleanText(raw.name) ?? '',
    rarity,
    type,
    class: cls,
    cost: 0, // no disponible en catálogo
    maxLevel: raw.lv_max ?? 0,
    maxSALevel: raw.skill_lv_max ?? 0,
    thumbnailId: raw.icon_id ?? raw.id,
    hasImages: false, // no disponible en catálogo
    hasEza,
    hasSeza,
    releaseDates: {
      initial,
      eza: ezaDate,
      seza: sezaDate,
      latest,
      latestType,
    },
    stats: { hp, atk, def },
    hpGains: null, // no disponible en catálogo
    linkIds: [], // no disponible en catálogo
    linkNames: [],
    leaderSkill: null, // no disponible en catálogo
    passiveSkill: null, // no disponible en catálogo
  };

  const detail = {
    characterId: raw.icon_id ?? null,
    canonicalId: null,
    kiMultipliers: null,
    activeSkills: [],
    standbySkill: null,
    eza: hasEza && raw.awoken_max
      ? {
          maxLevel: raw.awoken_max ?? null,
          maxSALevel: null,
          leaderSkill: null,
        }
      : null,
    isReversiblyExchanged: false,
    reversibleExchangeCharacterId: null,
    transformationPath,  // Lista de transformaciones del personaje
    treasureExchanges: 0,
    isFreelyObtainable: false,
    isStageDropReward: false,
    isWorldTournamentReward: false,
    hasBattleMotion: false,
  };

  return { summary, detail, hash: fnv1a(stable({ summary, detail })) };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  console.log(`[sync] Leyendo catálogo de ${INFO}/cards …`);

  // 1) Descargar catálogo completo (/cards) → v-bind:cardsjson
  const cardsHtml = await fetchText(`${INFO}/cards`);
  const cardsJson = extractCardsJson(cardsHtml);
  if (!Array.isArray(cardsJson) || !cardsJson.length) {
    throw new Error('No se pudo extraer cardsjson del catálogo');
  }

  // Filtrar solo unidades válidas (rarity ≥ 3 = SSR+, sin stubs 9xxxxxx)
  const records = cardsJson.filter((r) => {
    const rarity = Number(r.rarity ?? 0);
    const id = Number(r.id ?? 0);
    return rarity >= 3 && id > 0 && !String(id).startsWith('9');
  });
  console.log(`[sync] Filtradas ${records.length} unidades SSR+ del catálogo.`);

  // Reglas del widget "Most Recent Cards": una unidad por carta calificada,
  // sin formas pre-despertar, estados transformados ni variantes sin página propia.
  const catalogIds = new Set(cardsJson.map((r) => Number(r.id)));
  const nowSec = Date.now() / 1000;
  const discardCounts = {};
  const kept = [];
  for (const r of records) {
    const why = widgetRuleReason(r, catalogIds, nowSec);
    if (why) discardCounts[why] = (discardCounts[why] ?? 0) + 1;
    else kept.push(r);
  }
  console.log(`[sync] Reglas del widget: ${kept.length} cartas calificadas · descartes ${JSON.stringify(discardCounts)}`);

  // Mapeo de tipo: bg_element (0=AGL, 1=TEQ, 2=INT, 3=STR, 4=PHY)
  const typeMap = { '0': 'AGL', '1': 'TEQ', '2': 'INT', '3': 'STR', '4': 'PHY' };

  // Agrupar por name + type (solo para construir el transformationPath de cada ficha)
  const typeOf = (r) => typeMap[String(r.bg_element ?? r.element[0])] ?? 'AGL';
  const groupKeyOf = (r) => r.name + '|' + typeOf(r);
  const nameTypeGroups = new Map();
  for (const r of records) {
    const key = groupKeyOf(r);
    if (!nameTypeGroups.has(key)) nameTypeGroups.set(key, []);
    nameTypeGroups.get(key).push(r);
  }
  console.log(`[sync] ${nameTypeGroups.size} grupos únicos (agrupados por nombre+tipo).`);

  // 2) Lookups de link skills para nombres
  // dokkaninfo.com no expone link skills en /cards; los sacamos de /links (wiki_sync)
  // Para la semilla, usamos un mapa vacío y la app los resuelve en runtime.
  const linkNames = {};

  // 3) Normalizar: UNA unidad por carta calificada (misma regla que el widget
  //    de dokkaninfo). El grupo name+tipo solo aporta el transformationPath.
  const units = [];
  for (const r of kept) {
    const group = nameTypeGroups.get(groupKeyOf(r)) ?? [r];
    const transformationPath = buildTransformationPath([...group], r.id);
    const { summary, detail, hash } = normalizeRecord(r, transformationPath);
    summary.linkNames = summary.linkIds.map((id) => linkNames[id] ?? `#${id}`);
    units.push({ summary, detail, hash });
  }
  console.log(`[sync] ${units.length} unidades para el índice.`);

  // 4) Comparar con seed anterior
  const metaPath = join(OUT_DIR, 'meta.json');
  let prevHashes = {};
  if (existsSync(metaPath)) {
    try { prevHashes = JSON.parse(readFileSync(metaPath, 'utf8')).hashes ?? {}; } catch { /* resincroniza todo */ }
  }
  const changed = units.filter((u) => prevHashes[u.summary.id] !== u.hash).map((u) => u.summary.id);
  const removed = Object.keys(prevHashes).filter((id) => !units.some((u) => String(u.summary.id) === id));
  console.log(`[sync] Cambios vs seed anterior: ${changed.length} nuevas/modificadas, ${removed.length} eliminadas.`);

  if (checkOnly) return;

  // 5) Escribir seeds
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
    source: INFO,
    attribution: 'Data: DOKKANINFO.COM',
    unitCount: units.length,
    hashes: Object.fromEntries(units.map((u) => [u.summary.id, u.hash])),
  });

  // 6) Seed de noticias y banners (primera apertura offline)
  try {
    const [newsHtml, bannersHtml] = await Promise.all([
      fetchText(`${INFO}/news`),
      fetchText(`${INFO}/summons`),
    ]);
    const announcements = parseInertiaProps(newsHtml, `${INFO}/news`).announcements?.data ?? [];
    const summons = parseInertiaProps(bannersHtml, `${INFO}/summons`).summons?.data ?? [];

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

    // Personajes destacados de los primeros 4 banners (best-effort)
    await Promise.all(
      bannerSeed.slice(0, 4).map(async (b) => {
        try {
          const detailHtml = await fetchText(`${INFO}/summons/${b.id}`);
          const summon = parseInertiaProps(detailHtml, `${INFO}/summons/${b.id}`).summon;
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