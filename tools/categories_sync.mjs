#!/usr/bin/env node
/**
 * tools/categories_sync.mjs — Construye categories.index.json SOLO desde dokkaninfo.com
 *
 * Flujo:
 *   1. Descarga /cards → v-bind:cardsjson (lista de ~1500 cartas SSR+)
 *   2. Para cada carta, GET /cards/{id} → parseCardPage(html).categories[]
 *   3. Invierte: catId → Set<unitId>
 *   4. Guarda categories.index.json con schema compatible
 *
 * Uso: node tools/categories_sync.mjs
 *
 * Nota: dokkaninfo bloquea Node (403 Cloudflare) → usa curl.exe con UA navegador.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'app', 'public', 'data');
const INFO = 'https://dokkaninfo.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SCHEMA_VERSION = 1;
const DELAY_MS = 180; // cortesía entre peticiones

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Decodifica entidades HTML */
function decode(s) {
  return s
    .replace(/"/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
}

/** Extrae `v-bind:name="..."` del HTML */
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

/** Extrae `v-bind:cardsjson` del catálogo */
function extractCardsJson(html) {
  return extractVBind(html, 'cardsjson');
}

/** Parsea la ficha de carta (/cards/{id}) → categorías */
function parseCardCategories(html) {
  const raw = extractVBind(html, 'datajson');
  if (!raw || typeof raw !== 'object' || !raw.card) return [];
  const cats = raw.categories;
  if (!Array.isArray(cats)) return [];
  return cats
    .filter(c => typeof c.id === 'number' && typeof c.name === 'string')
    .map(c => ({ id: c.id, name: c.name.trim() }));
}

/** Filtro de cartas válidas (igual que sync.mjs) */
function isValidCard(r) {
  const rarity = Number(r.rarity ?? 0);
  const id = Number(r.id ?? 0);
  return rarity >= 3 && id > 0 && !String(id).startsWith('9');
}

/** Reglas del widget "Most Recent Cards" (igual que sync.mjs) */
function widgetRuleReason(r, catalogIds, nowSec) {
  const open = r.open_at ?? 0;
  if (!(open > 0 && open < nowSec)) return 'open_at futuro/sentinel';
  if ((r.awoken_max ?? 0) < 1) return 'aw0 (pre-despertar)';
  if (Number(r.id) >= 4000000) return 'id>=4M (transformación)';
  const icon = r.icon_id ?? r.id;
  if (icon !== r.id && catalogIds.has(icon)) return 'variante (icono apunta a otra fila)';
  return null;
}

async function main() {
  console.log('[categories_sync] Leyendo catálogo de', INFO + '/cards', '…');

  // 1) Catálogo completo
  const cardsHtml = await fetchText(`${INFO}/cards`);
  const cardsJson = extractCardsJson(cardsHtml);
  if (!Array.isArray(cardsJson) || !cardsJson.length) {
    throw new Error('No se pudo extraer cardsjson del catálogo');
  }

  // Filtrar SSR+ válidas
  const records = cardsJson.filter(isValidCard);
  console.log(`[categories_sync] ${records.length} unidades SSR+ en catálogo.`);

  // Aplicar reglas del widget (una carta por ficha calificada)
  const catalogIds = new Set(cardsJson.map(r => Number(r.id)));
  const nowSec = Date.now() / 1000;
  const kept = [];
  for (const r of records) {
    if (!widgetRuleReason(r, catalogIds, nowSec)) kept.push(r);
  }
  console.log(`[categories_sync] ${kept.length} cartas calificadas tras reglas de widget.`);

  // 2) Para cada carta, obtener sus categorías
  const catMap = new Map(); // catId → { name, members: Set<unitId> }
  let leadersMap = {}; // catId → [{id, boost}]

  for (let i = 0; i < kept.length; i++) {
    const r = kept[i];
    const unitId = r.id;
    const url = `${INFO}/cards/${unitId}`;

    if (i % 50 === 0) {
      process.stdout.write(`\r[categories_sync] ${i + 1}/${kept.length} (${unitId}) …`);
    }

    try {
      const html = await fetchText(url);
      const cats = parseCardCategories(html);

      for (const c of cats) {
        if (!catMap.has(c.id)) {
          catMap.set(c.id, { name: c.name, members: new Set() });
        }
        catMap.get(c.id).members.add(unitId);
      }
    } catch (e) {
      console.log(`\n[categories_sync] Aviso: fallo en ${unitId} (${e.message})`);
    }

    await sleep(DELAY_MS);
  }
  console.log('\n[categories_sync] Categorías recopiladas:', catMap.size);

  // 3) Obtener líderes por categoría (desde /categories/{id} - primera página)
  // dokkaninfo expone líderes en v-bind:datajson de la página de categoría
  // Para simplificar, usamos el endpoint que ya conoce wiki_sync.mjs: /categories/{id}
  // Pero aquí no tenemos el HTML de categoría. Como fallback, dejamos leaders vacío.
  // NOTA: Se puede ampliar luego scrapeando /categories/{id} si se necesitan líderes.

  // 4) Construir arrays finales
  const categories = [];
  const members = {};
  for (const [catId, data] of catMap.entries()) {
    categories.push({ id: catId, name: data.name, bestLeaderId: null, bestLeaderName: null });
    members[String(catId)] = [...data.members].sort((a, b) => a - b);
    leadersMap[String(catId)] = [];
  }
  categories.sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const totalMembers = Object.values(members).reduce((a, v) => a + v.length, 0);
  console.log(`[categories_sync] Total membresías: ${totalMembers} (promedio ${(totalMembers / categories.length).toFixed(1)} por categoría)`);

  // 5) Guardar
  mkdirSync(OUT_DIR, { recursive: true });
  const output = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: INFO,
    categories,
    leaders: leadersMap,
    members,
  };

  writeFileSync(join(OUT_DIR, 'categories.index.json'), JSON.stringify(output));
  const kb = (JSON.stringify(output).length / 1024).toFixed(0);
  console.log(`[categories_sync] Escrito categories.index.json (${kb} KB)`);
  console.log('[categories_sync] Listo.');
}

main().catch(e => {
  console.error('[categories_sync] ERROR:', e.message);
  process.exit(1);
});