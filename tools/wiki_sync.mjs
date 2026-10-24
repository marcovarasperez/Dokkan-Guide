#!/usr/bin/env node
/**
 * tools/wiki_sync.mjs — Semillas enriquecidas de la wiki/datos del juego:
 *
 *   app/public/data/links.index.json       ← dokkaninfo.com/links (efectos Nv.1…10)
 *   app/public/data/categories.index.json  ← dokkan.fyi (categorías con líderes y personajes)
 *
 * Uso:  node tools/wiki_sync.mjs
 *
 * Fuentes y por qué:
 *  - LINKS: la página /links de dokkaninfo publica el efecto de cada link en
 *    todos los niveles; la app solo necesita Nv.1 y Nv.10 (los chips de la
 *    ficha muestran el efecto a Nv.10 al pulsarlos).
 *  - CATEGORÍAS: dokkaninfo solo publica el diccionario de categorías; los
 *    miembros y líderes por categoría salen de dokkan.fyi (mismo datamine de
 *    los clientes oficiales), igual que la semilla original de la app.
 *    Se guardan SOLO ids (los datos de presentación viven en units.index).
 *
 * Nota Windows: dokkaninfo devuelve 403 a Node/PowerShell (filtro de TLS), así
 * que sus descargas van con curl.exe (como el resto de tools del proyecto).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'app', 'public', 'data');

const FYI = 'https://dokkan.fyi';
const FYI_UA = 'DokkanFanGuide/1.0 (fan project; local personal use; data: dokkan.fyi)';
const CURL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DELAY_MS = 180; // cortesía entre peticiones (Cloudflare)
const SCHEMA_VERSION = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');

/** GET de dokkaninfo vía curl.exe (Node recibe403 por el filtro de TLS). */
async function curlGet(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const { stdout } = await execFileP(
        'curl.exe',
        ['-s', '-A', CURL_UA, '--compressed', '--max-time', '60', url],
        { maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      );
      if (!stdout || stdout.length < 500) throw new Error(`respuesta vacía (${stdout.length} B)`);
      return stdout;
    } catch (e) {
      lastErr = e;
      await sleep(1200 * (i + 1));
    }
  }
  throw lastErr;
}

/** GET de dokkan.fyi vía fetch (funciona con el UA del proyecto). */
async function fyiGet(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': FYI_UA, accept: 'text/html,application/xhtml+xml' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(1200 * (i + 1));
    }
  }
  throw lastErr;
}

function fyiProps(html, url) {
  const m = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`Sin props de Inertia en ${url}`);
  return JSON.parse(m[1]).props;
}

const writeJson = (name, data) => {
  writeFileSync(join(OUT_DIR, name), JSON.stringify(data));
  const kb = (JSON.stringify(data).length / 1024).toFixed(0);
  console.log(`[wiki] Escrito ${name} (${kb} KB)`);
};

/* ------------------------------- LINKS ---------------------------------- */

/** Parsea /links de dokkaninfo: bloques <a href="/links/{id}"> con Level N:. */
function parseLinksPage(html) {
  const anchors = [...html.matchAll(/<a\s+href="\/links\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const links = [];
  for (const [, id, block] of anchors) {
    const nameM = block.match(/<b>([^<]+)<\/b>/);
    if (!nameM) continue;
    const levels = {};
    for (const lm of block.matchAll(/Level\s+(\d+):\s*([\s\S]*?)(?=Level\s+\d+:|$)/g)) {
      const lvl = Number(lm[1]);
      if (lvl >= 1 && lvl <= 10) {
        levels[lvl] = decode(lm[2].replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
    if (!levels[1] && !levels[10]) continue;
    links.push({ id: Number(id), name: decode(nameM[1]).trim(), lv1: levels[1] ?? '', lv10: levels[10] ?? '' });
  }
  return links;
}

async function syncLinks() {
  console.log('[wiki] Links: descargando dokkaninfo.com/links …');
  const html = await curlGet('https://dokkaninfo.com/links');
  const links = parseLinksPage(html);
  if (links.length < 100) throw new Error(`Solo ${links.length} links parseados (¿cambió la página?)`);
  const missing = links.filter((l) => !l.lv10).length;
  console.log(`[wiki] Links: ${links.length} parseados · ${missing} sin Nv.10.`);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'https://dokkaninfo.com/links',
    links,
  };
}

/* ----------------------------- CATEGORÍAS ------------------------------- */

/** Boost máximo (%) de un leader skill ("HP, ATK & DEF +200%" → 200). */
function leaderBoost(desc) {
  if (typeof desc !== 'string') return null;
  const nums = [...desc.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : null;
}

async function syncCategories() {
  // 1) Lista de categorías (id, nombre y mejor líder) — paginada (12/pág.).
  console.log('[wiki] Categorías: leyendo lista de dokkan.fyi …');
  const cats = [];
  let lastPage = 1;
  for (let page = 1; page <= lastPage; page++) {
    const html = await fyiGet(`${FYI}/categories${page > 1 ? `?page=${page}` : ''}`);
    const c = fyiProps(html, `${FYI}/categories?page=${page}`).categories ?? {};
    lastPage = c.meta?.last_page ?? 1;
    const data = c.data ?? [];
    for (const cat of data) {
      cats.push({
        id: cat.id,
        name: cat.name,
        bestLeaderId: cat.best_leader?.thumbnail_id ?? null,
        bestLeaderName: cat.best_leader?.name ?? null,
      });
    }
    if (data.length === 0) break;
    await sleep(DELAY_MS);
  }
  console.log(`[wiki] Categorías: ${cats.length} en la lista (última página ${lastPage}).`);

  // 2) Por categoría: líderes (completos en la1ª página) + miembros (paginados).
  const leaders = {};
  const members = {};
  let n = 0;
  for (const cat of cats) {
    n++;
    const base = `${FYI}/categories/${cat.id}`;
    const html1 = await fyiGet(base);
    const props = fyiProps(html1, base);
    const leadRecs = props.category?.characters?.leaders ?? [];
    leaders[cat.id] = leadRecs
      .map((l) => ({ id: l.id, boost: leaderBoost(l.leader_skill?.description) }))
      .sort((a, b) => (b.boost ?? -1) - (a.boost ?? -1) || a.id - b.id);

    const meta = props.characters?.meta ?? { total: 0, last_page: 1 };
    const ids = new Set((props.characters?.data ?? []).map((d) => d.id));
    for (let p = 2; p <= (meta.last_page ?? 1); p++) {
      await sleep(DELAY_MS);
      const htmlN = await fyiGet(`${base}?page=${p}`);
      for (const d of fyiProps(htmlN, `${base}?page=${p}`).characters?.data ?? []) ids.add(d.id);
    }
    members[cat.id] = [...ids];
    process.stdout.write(
      `\r[wiki] Categoría ${n}/${cats.length}: ${cat.name} — ${leaders[cat.id].length} líderes, ${ids.size} personajes…   `,
    );
    await sleep(DELAY_MS);
  }
  console.log('\n[wiki] Categorías: miembros recopilados.');

  const totalMembers = Object.values(members).reduce((a, v) => a + v.length, 0);
  const totalLeaders = Object.values(leaders).reduce((a, v) => a + v.length, 0);
  console.log(`[wiki] Totales: ${totalMembers} membresías · ${totalLeaders} líderes.`);

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: FYI,
    categories: cats,
    leaders,
    members,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const links = await syncLinks();
  writeJson('links.index.json', links);
  const categories = await syncCategories();
  writeJson('categories.index.json', categories);
  console.log('[wiki] Listo.');
}

main().catch((e) => {
  console.error('[wiki] ERROR:', e.message);
  process.exit(1);
});
