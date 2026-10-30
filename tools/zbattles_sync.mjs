#!/usr/bin/env node
/**
 * Genera app/public/data/zbattles.index.json desde dokkaninfo.com.
 *
 * El índice responde "¿en qué evento Z-Battle se hace el EZA/SEZA de esta
 * carta?" para la sección «¿Dónde conseguir el EZA/SEZA?» de la ficha. El
 * datajson de la carta trae una lista `extreme_z_battles` que NO está
 * restringida a la unidad (para Perfect Cell devuelve 49 eventos, casi todos
 * de otras unidades), así que hay que resolver cada Z-Battle con su detalle
 * para conocer el título y la CARTA OBJETIVO del evento.
 *
 * Fuente y formato (mismo patrón que drops_sync.mjs):
 *  - Listado: /api/events/zbattle → filas {id, listbutton_image_path, …}.
 *  - Detalle: /events/zbattle/{id} → <title> (título del evento) y
 *    `v-bind:card` (JSON con la carta objetivo: id, name, icon_id, rarity).
 *
 * Salida:
 *   events    → id → {title, cardId, cardName, image, startsAt, endsAt}
 *   byCard    → cardId → [ids de eventos]     (cruce exacto por carta)
 *   byName    → nombre normalizado → [ids]    (respaldo por nombre de unidad)
 *
 * Uso:
 *   node tools/zbattles_sync.mjs [--force]
 *
 * Nota: dokkaninfo rechaza el TLS de Node (403) → todas las peticiones van
 * por curl.exe con UA de navegador (mismo patrón que drops_sync.mjs).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

const INFO = 'https://dokkaninfo.com';
const INFO_ASSET = `${INFO}/assets/global/en`;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(ROOT, '../app/public/data/zbattles.index.json');
const CACHE_FILE = path.resolve(ROOT, '.zbattles-cache.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // los Z-Battle cambian poco
const CONCURRENCY = 4;

const FORCE = process.argv.slice(2).includes('--force');

/* ---------- HTML helpers (espejo de dinfo.ts) ---------- */

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

/** Clave de cruce por nombre: minúsculas + espacios colapsados. */
const normName = (s) => decode(String(s ?? '')).replace(/\s+/g, ' ').trim().toLowerCase();

function extractPageTitle(html) {
  const t = html.match(/<title>\s*([^<]+?)\s*\|?\s*Dokkan Info!?\s*<\/title>/i);
  return t ? decode(t[1]).replace(/\s+/g, ' ').trim() : null;
}

/** `v-bind:card="…"` → JSON de la carta objetivo del Z-Battle. */
function extractCard(html) {
  const m = html.match(/v-bind:card\s*=\s*(["'])/);
  if (!m) return null;
  const quote = m[1];
  const start = m.index + m[0].length;
  const end = html.indexOf(quote, start);
  if (end < 0) return null;
  try {
    const j = JSON.parse(decode(html.slice(start, end)));
    return j && typeof j.id === 'number' ? j : null;
  } catch {
    return null;
  }
}

/** Imagen de evento (mismas 3 claves que usa `eventImage` de la app). */
function eventImage(row) {
  for (const key of ['event_image_path', 'banner_image_path', 'listbutton_image_path']) {
    const p = row[key];
    if (!p) continue;
    if (String(p).includes('/')) {
      const v = String(p).replace(/^\/+/, '');
      // Rutas `banners/…`: la raíz de /assets/global da 404 en la fuente;
      // las publica bajo ingame/events (verificado con bytes reales).
      const ev = v.match(/^banners\/en\/event\/[^/]+\/(.+)$/);
      if (ev) return `${INFO_ASSET}/ingame/events/${ev[1]}`;
      const news = v.match(/^banners\/en\/news\/(.+)$/);
      if (news) return `${INFO_ASSET}/ingame/news/${news[1]}`;
      if (v.startsWith('banners/')) return `${INFO_ASSET}/ingame/banners/${v.slice(v.lastIndexOf('/') + 1)}`;
      if (v.startsWith('assets/global/en/')) return `${INFO}/${v}`;
      return `${INFO_ASSET}/${v}`;
    }
    return `${INFO_ASSET}/ingame/events/${p}`;
  }
  return null;
}

/** Sentinelas de "sin fecha" (>= 2038-01-19) que usa la fuente. */
const TIME_SENTINEL = 2_145_000_000;

function dkTime(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim()) {
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    const s = Math.round(t / 1000);
    return s < TIME_SENTINEL ? s : null;
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
  const cache = FORCE ? {} : await readCache();

  let rows;
  try {
    rows = JSON.parse(await fetchText(`${INFO}/api/events/zbattle`));
    if (!Array.isArray(rows)) throw new Error('respuesta no es una lista');
  } catch (e) {
    console.error(`! Listado de Z-Battle falló: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Listado: ${rows.length} eventos Z-Battle`);

  let fetched = 0;
  let cached = 0;
  const events = {};
  const byCard = {};
  const byName = {};

  await mapLimit(rows, CONCURRENCY, async (row) => {
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    let entry = cache[String(id)];
    if (!entry || Date.now() - (entry.at ?? 0) > CACHE_TTL_MS) {
      try {
        const html = await fetchText(`${INFO}/events/zbattle/${id}`);
        const card = extractCard(html);
        entry = {
          at: Date.now(),
          title: extractPageTitle(html),
          cardId: card?.id ?? null,
          cardName: card?.name ? decode(card.name) : null,
        };
        cache[String(id)] = entry;
        fetched += 1;
      } catch (e) {
        console.error(`! Detalle zbattle/${id} falló: ${e.message}`);
        return;
      }
    } else {
      cached += 1;
    }

    events[id] = {
      title: entry.title,
      cardId: entry.cardId,
      cardName: entry.cardName,
      image: eventImage(row),
      startsAt: dkTime(row.start_at),
      endsAt: dkTime(row.end_at),
    };
    if (entry.cardId != null) (byCard[String(entry.cardId)] ??= []).push(id);
    const key = normName(entry.cardName);
    if (key) (byName[key] ??= []).push(id);
  });

  const index = {
    generatedAt: new Date().toISOString(),
    source: 'dokkaninfo.com',
    events,
    byCard,
    byName,
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(index)}\n`, 'utf8');
  await writeFile(CACHE_FILE, `${JSON.stringify(cache)}\n`, 'utf8');

  const kb = Math.round((await readFile(OUT_FILE)).length / 1024);
  const withCard = Object.values(events).filter((e) => e.cardId != null).length;
  console.log(
    `✔ ${Object.keys(events).length} Z-Battles (${withCard} con carta objetivo) · ` +
      `${Object.keys(byCard).length} cartas + ${Object.keys(byName).length} nombres · ${kb} KB` +
      ` (${fetched} detalles nuevos, ${cached} de caché) → ${path.relative(process.cwd(), OUT_FILE)}`,
  );
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exitCode = 1;
});
