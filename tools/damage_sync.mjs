/**
 * Genera app/public/data/damage.index.json: DAÑO EFECTIVO de cada UR/LR (estado vigente:
 * base, EZA o SEZA) para comparar una unidad con las de su época (rol Superviviente).
 *
 *   daño = ATK × (1 + 2 · mejor líder %) × (1 + pasiva %) × (mejor Súper % + subida ATK)
 *
 * Fórmula y parsers compartidos con la app: app/src/model/damage.ts (Node ≥ 23 lo importa tal cual).
 * Fuente: dokkaninfo.com (/cards/{id} y /api/cards/{id}/eza) por curl.exe con UA de navegador.
 * Caché local de 7 días (tools/.damage-cache.json); --force la ignora.
 *
 *   node tools/damage_sync.mjs [--force]
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leaderAtkPct, passiveAtkPct, bestSaPct, effectiveDamage } from '../app/src/model/damage.ts';

const run = promisify(execFile);
const INFO = 'https://dokkaninfo.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(ROOT, '../app/public/data/units.index.json');
const OUT_FILE = path.resolve(ROOT, '../app/public/data/damage.index.json');
const CACHE_FILE = path.resolve(ROOT, '.damage-cache.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 3;
const FORCE = process.argv.includes('--force');

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function get(url) {
  for (let i = 0; i < 3; i += 1) {
    try {
      const { stdout } = await run('curl.exe', ['-sS', '--compressed', '-A', UA, '-H', 'accept-language: en-US,en;q=0.9', '--max-time', '60', url], {
        maxBuffer: 64 * 1024 * 1024,
      });
      if (stdout.length > 200) return stdout;
    } catch {
      /* reintento */
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`sin respuesta: ${url}`);
}

const epoch = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v < 2_145_000_000 ? v : 0;
  if (typeof v === 'object') return epoch(v.open_at); // eza_open_date / seza_open_date vienen como { open_at, … }
  const t = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(' ', 'T')}Z` : v);
  return Number.isNaN(t) ? 0 : Math.round(t / 1000);
};

/** Subida de ATK del Súper: efectos 1 (ATK) y 3 (ATK & DEF) de `specials`. */
const saInputs = (sas) =>
  (sas ?? []).map((s) => ({
    rate: s.attack?.increase_rate ?? 0,
    lvBonus: s.attack?.lv_bonus ?? 0,
    atkRaise: (s.specials ?? []).filter((x) => x.efficacy_type === 1 || x.efficacy_type === 3).reduce((a, x) => a + (x.eff_value1 ?? 0), 0),
  }));

/** Datos de UNA carta en su estado vigente (sin el líder, que depende de las demás). */
async function scanCard(id) {
  const html = await get(`${INFO}/cards/${id}`);
  const m = html.match(/v-bind:datajson="([^"]*)"/) ?? html.match(/datajson="([^"]*)"/);
  if (!m) throw new Error(`sin datajson: ${id}`);
  const j = JSON.parse(decode(m[1]));
  const c = j.card;
  const now = Date.now() / 1000;
  const ezaAt = epoch(j.eza_open_date);
  const sezaAt = epoch(j.seza_open_date);
  const ezaLive = (j.max_eza_step ?? 0) > 0 && ezaAt > 0 && ezaAt <= now;
  let state = { leader: j.leader_skill?.description ?? '', passive: j.passive_skill?.itemized_description ?? '', sas: j.super_attacks, lv: c.skill_lv_max ?? 10 };
  if (ezaLive) {
    try {
      const e = JSON.parse(await get(`${INFO}/api/cards/${id}/eza?eza=true&step=${j.max_eza_step}`));
      state = { leader: e.leader_skill?.description ?? state.leader, passive: e.passive_skill?.itemized_description ?? state.passive, sas: e.super_attacks ?? state.sas, lv: e.skill_lv_max ?? state.lv };
    } catch {
      /* sin EZA legible: se queda el estado base */
    }
  }
  // Stats EZA: misma fórmula que la app (detail.ts) — solo rareza < 5; LR conserva el máx.
  const atk = ezaLive && c.rarity < 5 ? c.atk_max + Math.round((c.atk_max - c.atk_init) * 0.4839) : c.atk_max;
  return {
    atk,
    leaderPct: leaderAtkPct(state.leader),
    passivePct: passiveAtkPct(state.passive),
    saPct: bestSaPct(saInputs(state.sas), state.lv),
    leaders: (j.two_hundred_leaders ?? []).map((l) => l.id),
    t: Math.max(epoch(c.open_at), sezaAt <= now ? sezaAt : 0, ezaLive ? ezaAt : 0),
  };
}

const seed = JSON.parse(await readFile(SEED, 'utf8'));
const ids = seed.filter((u) => (u.rarity === 'UR' || u.rarity === 'LR') && !u.isExchangeForm).map((u) => u.id);
let cache = {};
try {
  cache = JSON.parse(await readFile(CACHE_FILE, 'utf8'));
} catch {
  /* primera vez */
}

const todo = ids.filter((id) => FORCE || !cache[id] || Date.now() - cache[id].ts > CACHE_TTL_MS);
console.log(`damage_sync: ${ids.length} UR/LR, ${todo.length} por descargar`);
let done = 0;
let failed = 0;
const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        cache[id] = { ts: Date.now(), ...(await scanCard(id)) };
      } catch (e) {
        failed += 1;
        console.warn(String(e.message ?? e));
      }
      done += 1;
      if (done % 50 === 0) {
        console.log(`  ${done}/${todo.length}`);
        await writeFile(CACHE_FILE, JSON.stringify(cache)); // progreso: se puede cortar y retomar
      }
    }
  }),
);
await writeFile(CACHE_FILE, JSON.stringify(cache));

// Líder: los dos huecos con la MEJOR leader skill del ranking 200%+ (si no tiene, la suya propia).
const cards = {};
for (const id of ids) {
  const x = cache[id];
  if (!x) continue;
  const lead = Math.max(0, ...x.leaders.map((l) => cache[l]?.leaderPct ?? 0)) || x.leaderPct;
  cards[id] = { d: effectiveDamage(x.atk, lead, x.passivePct, x.saPct), t: x.t };
}
await writeFile(
  OUT_FILE,
  JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), source: INFO, attribution: 'Data: DOKKANINFO.COM', cards }),
);
console.log(`damage.index.json: ${Object.keys(cards).length} cartas (${failed} fallos)`);
