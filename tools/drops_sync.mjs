#!/usr/bin/env node
/**
 * Genera app/public/data/drops.index.json desde dokkaninfo.com.
 *
 * El índice responde "¿en qué eventos dropea esta carta?" para la sección
 * "¿Dónde conseguirlo?" de la ficha de personaje (sin tener que recorrer
 * todos los detalle de eventos en cada arranque).
 *
 * Fuente y formato (espejo de app/src/model/dinfo.ts, verificado con probes):
 *  - Listados: /events/{type} → v-bind:eventjson (limited/story/growth/
 *    challenge/bonus, con fechas) o filas SSR <a href=/events/T/N> (quest,
 *    dbstories — permanentes).
 *  - Detalle: /events/{type}/{id} → anclas de etapa (/events/T/id/stage) con
 *    dificultad en <b>…</b> y recompensas en v-bind:reward="…" (JSON con
 *    entidades &quot;) en orden de aparición; las cartas son item_type "Card".
 *
 * Ventana: los listados de eventos con fecha NO publican start/end_at (solo
 * first_released_at, que es la fecha original de lanzamiento), así que se
 * incluyen los 7 tipos enteros (contenido disponible para jugar/repetir). Los
 * Z-Battles se omiten a propósito: no dropean cartas (la ficha obtiene el EZA
 * desde el binding extreme_z_battles del datajson).
 *
 * Uso:
 *   node tools/drops_sync.mjs [--force] [--window 365]
 *
 * Nota: dokkaninfo rechaza el TLS de Node (403) → todas las peticiones van
 * por curl.exe con UA de navegador (mismo patrón que los probes).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

const INFO = 'https://dokkaninfo.com';
const ASSET = `${INFO}/assets/global/en`;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(ROOT, '../app/public/data/drops.index.json');
const CACHE_FILE = path.resolve(ROOT, '.drops-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 4;
const MAX_EVENTS = 400;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const WINDOW_DAYS = Number(args[args.indexOf('--window') + 1]) > 0 ? Number(args[args.indexOf('--window') + 1]) : 365;

/** Tipos con lista con fechas → ventana activo + WINDOW_DAYS. */
const TIMED_TYPES = ['limited', 'story', 'growth', 'challenge', 'bonus'];
/** Tipos permanentes → se incluyen enteros. */
const PERMANENT_TYPES = ['quest', 'dbstories'];

/* ---------- HTML helpers (espejo de html.ts / dinfo.ts) ---------- */

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

function extractPageTitle(html) {
  const t = html.match(/<title>\s*([^<]+?)\s*\|?\s*Dokkan Info!?\s*<\/title>/i);
  const title = t?.[1] ?? null;
  if (title) return decode(title).trim();
  const og = html.match(/property="og:title"\s+content="([^"]+)"/);
  return og ? decode(og[1]).replace(/\s*\|\s*Dokkan Info!?$/i, '').trim() : null;
}

/** Sentinelas de "sin fecha" (>= 2038-01-19) que usa la fuente. */
const TIME_SENTINEL = 2_145_000_000;

function dkTime(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value > 0 && value < TIME_SENTINEL ? Math.round(value) : null;
  if (typeof value === 'string') {
    if (!value.trim()) return null;
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    const s = Math.round(t / 1000);
    return s < TIME_SENTINEL ? s : null;
  }
  if (typeof value === 'object') return dkTime(value.open_at);
  return null;
}

const assetUrl = (p) => `${ASSET}/${String(p).replace(/^\/+/, '')}`;

/** Imagen de evento (mismas 3 claves que usa el listado de la app). */
function eventImage(row) {
  for (const key of ['event_image_path', 'banner_image_path', 'listbutton_image_path']) {
    const p = row[key];
    if (p) return String(p).includes('/') ? assetUrl(p) : `${ASSET}/ingame/events/${p}`;
  }
  return null;
}

/* ---------- HTTP vía curl ---------- */

async function fetchText(url) {
  const { stdout } = await run(
    'curl.exe',
    ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url],
    { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
  );
  if (!stdout || stdout.length < 200) throw new Error(`Respuesta vacía/corta en ${url}`);
  return stdout;
}

/* ---------- Listados ---------- */

/** Filas de listado: eventjson (JSON) o anclas SSR (quest/dbstories). */
function parseListRows(html) {
  const rows = extractVBind(html, 'eventjson');
  if (Array.isArray(rows)) {
    return rows
      .filter((r) => typeof r.id === 'number')
      .map((r) => ({
        id: r.id,
        name: r.name ? decode(r.name) : null,
        image: eventImage(r),
        endsAt: dkTime(r.end_at),
      }));
  }
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href="([^"]*\/events\/[a-z]+\/(\d+))"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const id = Number(m[2]);
    if (seen.has(id)) continue;
    seen.add(id);
    const inner = m[3];
    const img = inner.match(/<img[^>]*\ssrc="([^"]+)"/);
    const text = decode(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    out.push({
      id,
      name: text || null,
      image: img ? assetUrl(img[1]) : null,
      endsAt: null,
    });
  }
  return out;
}

/* ---------- Detalle: cartas por etapa ---------- */

/**
 * Escaneo secuencial del detalle (mismo orden que el TreeWalker de la app).
 * El ancla se consume SOLO hasta su `>` (no su contenido): las recompensas
 * `v-bind:reward` pueden estar anidadas dentro del ancla de la etapa y quedar
 * fuera de alcance de un regex que trague el contenido del ancla.
 * Devuelve { stageId, difficulty, levelName, cardId }[].
 */
function parseDetailCards(html) {
  const re =
    /<a\b[^>]*href="([^"]*)"[^>]*>|<\/a>|<b[^>]*>([A-Z][A-Z-]+)<\/b>|>\s*(Level\s*\d+[^<]*)<|v-bind:reward="([^"]*)"|v-bind:reward='([^']*)'/g;
  const out = [];
  let m;
  let stage = null;
  let inStageAnchor = false;
  let levelName = '';
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      // Ancla: solo cuenta si es una etapa (/events/T/id/stage al final).
      const stageMatch = m[1].match(/\/events\/[a-z]+\/\d+\/(\d+)$/);
      inStageAnchor = false;
      if (stageMatch) {
        stage = { id: Number(stageMatch[1]), difficulty: null };
        inStageAnchor = true;
        levelName = '';
      }
      continue;
    }
    if (m[0] === '</a>') {
      inStageAnchor = false;
      continue;
    }
    if (m[2] !== undefined) {
      // Dificultad en mayúsculas: primer <b> dentro del ancla de la etapa.
      if (inStageAnchor && stage && !stage.difficulty) stage.difficulty = m[2];
      continue;
    }
    if (m[3] !== undefined) {
      levelName = m[3].replace(/\s+/g, ' ').trim();
      continue;
    }
    const rawAttr = m[4] ?? m[5];
    if (rawAttr === undefined) continue;
    let raw;
    try {
      raw = JSON.parse(decode(rawAttr));
    } catch {
      continue;
    }
    if (String(raw?.item_type ?? '') !== 'Card') continue;
    const c = raw.item ?? raw.card;
    if (!c || typeof c.id !== 'number') continue;
    out.push({
      cardId: c.id,
      stageId: stage?.id ?? null,
      difficulty: stage?.difficulty ?? null,
      levelName,
    });
  }
  return out;
}

/* ---------- Orquestación ---------- */

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const now = Date.now();
  const cutoff = now - WINDOW_DAYS * 86_400_000;
  const cache = FORCE ? {} : await readCache();

  /** @type {{type: string, id: number, name: string|null, image: string|null, endsAt: number|null}[]} */
  const events = [];
  for (const type of [...TIMED_TYPES, ...PERMANENT_TYPES]) {
    let rows;
    try {
      rows = parseListRows(await fetchText(`${INFO}/events/${type}`));
    } catch (e) {
      console.error(`! Listado ${type} falló: ${e.message}`);
      continue;
    }
    const inWindow = rows.filter((r) => {
      if (PERMANENT_TYPES.includes(type)) return true;
      // Activos/próximos + finalizados dentro de la ventana.
      return r.endsAt == null || r.endsAt * 1000 >= cutoff;
    });
    for (const r of inWindow.slice(0, MAX_EVENTS)) {
      events.push({ type, ...r });
    }
    console.log(`  ${type}: ${inWindow.length}/${rows.length} eventos en ventana`);
  }

  console.log(`Descargando detalles de ${events.length} eventos (concurrencia ${CONCURRENCY})…`);

  const eventsMeta = {};
  const byCard = {};
  const seenEntries = new Set();
  let fetched = 0;
  let cachedCount = 0;

  await mapLimit(events, CONCURRENCY, async (ev) => {
    const key = `${ev.type}/${ev.id}`;
    let entry = cache[key];
    if (!entry || now - (entry.at ?? 0) > CACHE_TTL_MS) {
      try {
        const html = await fetchText(`${INFO}/events/${key}`);
        entry = { at: Date.now(), title: extractPageTitle(html), drops: parseDetailCards(html) };
        cache[key] = entry;
        fetched += 1;
      } catch (e) {
        console.error(`! Detalle ${key} falló: ${e.message}`);
        return;
      }
    } else {
      cachedCount += 1;
    }

    eventsMeta[key] = {
      name: ev.name ?? entry.title ?? `Evento ${ev.id}`,
      image: ev.image,
      endsAt: ev.endsAt,
    };

    for (const d of entry.drops) {
      const stageName = d.levelName || (d.stageId != null ? `Stage ${d.stageId}` : '');
      const dedupe = `${d.cardId}|${key}|${stageName}|${d.difficulty ?? ''}`;
      if (seenEntries.has(dedupe)) continue;
      seenEntries.add(dedupe);
      (byCard[String(d.cardId)] ??= []).push({
        type: ev.type,
        id: ev.id,
        ...(stageName ? { stageName } : {}),
        ...(d.difficulty ? { difficulty: d.difficulty } : {}),
      });
    }
  });

  const index = {
    generatedAt: new Date().toISOString(),
    source: 'dokkaninfo.com',
    events: eventsMeta,
    byCard,
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(index)}\n`, 'utf8');
  await writeFile(CACHE_FILE, `${JSON.stringify(cache)}\n`, 'utf8');

  const cardCount = Object.keys(byCard).length;
  const kb = Math.round((await readFile(OUT_FILE)).length / 1024);
  console.log(
    `✔ ${Object.keys(eventsMeta).length} eventos · ${cardCount} cartas indexadas · ${kb} KB` +
      ` (${fetched} detalles nuevos, ${cachedCount} de caché) → ${path.relative(process.cwd(), OUT_FILE)}`,
  );
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exitCode = 1;
});
