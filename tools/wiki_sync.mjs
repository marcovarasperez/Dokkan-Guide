#!/usr/bin/env node
/**
 * tools/wiki_sync.mjs — Semillas enriquecidas SOLO desde dokkaninfo.com
 *
 *   app/public/data/links.index.json       ← dokkaninfo.com/links (efectos Nv.1…10)
 *
 * Uso:  node tools/wiki_sync.mjs
 *
 * NOTA: Las categorías ahora se generan con tools/categories_sync.mjs
 *       (scrapea /cards/{id} de dokkaninfo.com para invertir catId → members[]).
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

const CURL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DELAY_MS = 180; // cortesía entre peticiones (Cloudflare)
const SCHEMA_VERSION = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) =>
  s
    .replace(/"/g, '"')
    .replace(/&#0?39;|'/g, "'")
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&/g, '&')
    .replace(/&nbsp;/g, ' ');

/** GET de dokkaninfo vía curl.exe (Node recibe 403 por el filtro de TLS). */
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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const links = await syncLinks();
  writeJson('links.index.json', links);
  console.log('[wiki] Listo (solo links.index.json — categorías va en categories_sync.mjs).');
}

main().catch((e) => {
  console.error('[wiki] ERROR:', e.message);
  process.exit(1);
});