#!/usr/bin/env node
/**
 * tools/game_sync.mjs — Pipeline de DATAMINE: convierte un `database.db` volcado del
 * cliente de DOKKAN BATTLE (Global) en la semilla de la app (units.index.json + meta.json),
 * sin depender de fansites. Complementa a sync.mjs (dokkan.fyi); puede sustituirlo cuando
 * se disponga de dumps completos y actualizados (ver docs/DATAMINE.md).
 *
 * Uso:
 *   node tools/game_sync.mjs <ruta/database.db>              # análisis + validación (no escribe)
 *   node tools/game_sync.mjs <ruta/database.db> --write      # además escribe la semilla en app/public/data
 *
 * El dump se obtiene del dispositivo (adb pull del directorio de datos del juego) o de
 * dumps comunitarios. La BD está cifrada con SQLCipher; esta herramienta la descifra
 * inline (parámetros verificados en oct-2026, ver docs/DATAMINE.md §2).
 *
 * Salida (idéntica en forma a la de sync.mjs; ¡mantener normalize en paralelo con
 * adapter.ts!): summaries de UnitSummary con hash FNV-1a estable por unidad.
 *
 * Limitaciones conocidas (marcadas con [FULL] — requieren dump completo/moderno):
 *   - hasEza/hasSeza/hpGains/activeSkills: sondear tablas de EZA/potencial; por defecto false/null.
 *   - La BD del cliente no tiene noticias ni calendarios (Bandai los eliminó en 2025).
 *
 * Verificado (oct-2026, vs semilla dokkan.fyi, 19 unidades en común):
 *   - name/rarity/type/class/cost/stats/links: 0 discrepancias.
 *   - class: awakening_element_type 1=Super, 2=Extreme.
 *   - leader/passive: mismo nombre y contenido; el dump trae el texto CRUDO del juego
 *     (con saltos de línea duros) y fyi lo re-formatea (viñetas + {passiveImg}).
 *     Si la semilla pasa a venir de la BD, hp.ts debe normalizar el texto crudo.
 *
 * Proyecto fan no comercial. Datos: cliente DOKKAN (datamine fan, uso personal).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pbkdf2Sync, createDecipheriv } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'app', 'public', 'data');
const SCHEMA_VERSION = 1;
const PASS = '9bf9c6ed9d537c399a6c4513e92ab24717e1a488381e3338593abd923fc8a13b';
const MAGIC = Buffer.from('SQLite format 3\0', 'latin1');

const TYPES = ['AGL', 'TEQ', 'INT', 'STR', 'PHY'];       // element % 10 (verificado vs semilla)
const RARITIES = ['N', 'R', 'SR', 'SSR', 'UR', 'LR'];   // rarity int (3=SSR, 4=UR, 5=LR)

/** Hash FNV-1a 32-bit (hex). Idéntico a sync.mjs para compatibilidad de hashes. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** JSON.stringify con claves ordenadas → hash estable. Idéntico a sync.mjs. */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

const cleanText = (s) => (typeof s === 'string' ? s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : s);

/* ------------------------------------------------------------------ descifrado */

/** Descifra un database.db SQLCipher (estilo antiguo: página 1024, reserve 48, PBKDF2 64000). */
function decryptDb(file) {
  for (const [page, reserve, iters] of [[1024, 48, 64000], [1024, 48, 4000], [512, 48, 64000], [1024, 16, 4000]]) {
    if (file.length % page) continue;
    const out = tryDecrypt(file, page, reserve, iters);
    if (!out) continue;
    // Validación: la página 1 reconstruida debe ser SQLite válida.
    if (out.subarray(0, 16).equals(MAGIC) && out[16] === 0x04 && out[17] === 0x00) return { out, page, reserve, iters };
    if (out.subarray(0, 16).equals(MAGIC) && out[16] === 0x02 && out[17] === 0x00) return { out, page, reserve, iters };
  }
  return null;
}

function tryDecrypt(file, page, reserve, iters) {
  const salt = file.subarray(0, 16);
  const key = pbkdf2Sync(PASS, salt, iters, 32, 'sha1');
  const out = Buffer.alloc(file.length);
  const pages = file.length / page;
  for (let p = 0; p < pages; p++) {
    const off = p * page;
    const start = off + (p === 0 ? 16 : 0);
    const end = off + page - reserve;
    if (end - start <= 0 || (end - start) % 16 !== 0) return null;
    const iv = file.subarray(off + page - reserve, off + page - reserve + 16);
    const c = createDecipheriv('aes-256-cbc', key, iv);
    c.setAutoPadding(false);
    const dec = Buffer.concat([c.update(file.subarray(start, end)), c.final()]);
    if (p === 0) { MAGIC.copy(out, 0); dec.copy(out, 16); }
    else dec.copy(out, off);
  }
  return out;
}

/* ------------------------------------------------------------------ utilidades DB */

const tableExists = (db, name) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
const countRows = (db, name) => (tableExists(db, name) ? db.prepare(`SELECT count(*) n FROM "${name}"`).get().n : 0);
const columnExists = (db, table, col) => {
  if (!tableExists(db, table)) return false;
  return db.prepare(`PRAGMA table_info("${table}")`).all().some((c) => c.name === col);
};

/* ------------------------------------------------------------------ normalización */

/**
 * Construye los summaries a partir de la BD descifrada.
 * Regla de "unidad": cada carta terminal de su cadena de awaked_card_id
 * (el id final es el que usan los fansites como canónico).
 */
function buildUnits(db) {
  const warnings = [];

  // Lookups.
  const links = new Map(db.prepare('SELECT id, name FROM link_skills').all().map((r) => [r.id, cleanText(r.name)]));
  const leaders = new Map(db.prepare('SELECT id, name, description FROM leader_skills').all().map((r) => [r.id, r]));
  const passives = new Map(db.prepare('SELECT id, name, description FROM passive_skill_sets').all().map((r) => [r.id, r]));
  const categories = new Map(db.prepare('SELECT id, name FROM card_categories').all().map((r) => [r.id, cleanText(r.name)]));
  const allCards = db.prepare('SELECT * FROM cards').all();
  const byId = new Map(allCards.map((c) => [c.id, c]));

  // Clase (Super/Extreme): awakening_element_type (1=Super, 2=Extreme) — verificado 19/19
  // contra la semilla de dokkan.fyi en oct-2026. Fallbacks para dumps con esquema nuevo.
  let classOf = (c) => (c.awakening_element_type === 1 ? 'Super' : c.awakening_element_type === 2 ? 'Extreme' : null);
  if (columnExists(db, 'characters', 'alignment')) {
    const m = new Map(db.prepare('SELECT id, alignment FROM characters').all().map((r) => [r.id, r.alignment]));
    const alt = (c) => { const a = m.get(c.character_id); return a === 0 || a === 1 ? (a === 0 ? 'Super' : 'Extreme') : null; };
    const base = classOf;
    classOf = (c) => base(c) ?? alt(c);
  } else if (columnExists(db, 'cards', 'alignment')) {
    const m = new Map(db.prepare('SELECT id, alignment FROM cards').all().map((r) => [r.id, r.alignment]));
    const alt = (c) => { const a = m.get(c.id); return a === 0 || a === 1 ? (a === 0 ? 'Super' : 'Extreme') : null; };
    const base = classOf;
    classOf = (c) => base(c) ?? alt(c);
  }
  if (!columnExists(db, 'cards', 'awakening_element_type')) {
    warnings.push('[FULL] Sin awakening_element_type ni columna de alineación; clase por defecto "Super".');
  }

  const chainRoot = (c) => {
    let cur = c;
    const seen = new Set();
    while (cur.awaked_card_id && byId.has(cur.awaked_card_id) && !seen.has(cur.awaked_card_id)) {
      seen.add(cur.awaked_card_id);
      cur = byId.get(cur.awaked_card_id);
    }
    return cur;
  };

  const terminals = allCards.filter((c) => !c.awaked_card_id || !byId.has(c.awaked_card_id));

  const units = [];
  for (const c of terminals) {
    const root = chainRoot(c);
    const leader = leaders.get(c.leader_skill_id);
    const passive = passives.get(c.passive_skill_set_id);
    const linkIds = [c.link_skill1_id, c.link_skill2_id, c.link_skill3_id, c.link_skill4_id, c.link_skill5_id, c.link_skill6_id, c.link_skill7_id].filter((x) => x != null);
    const summary = {
      id: c.id,
      name: cleanText(c.name) ?? '',
      rarity: RARITIES[c.rarity] ?? 'UR',
      type: TYPES[c.element % 10] ?? 'AGL',
      class: classOf(c) ?? 'Super',
      cost: c.cost ?? 0,
      maxLevel: c.lv_max ?? 0,
      maxSALevel: c.skill_lv_max ?? 0,
      thumbnailId: c.id,
      hasImages: true,
      hasEza: false,   // [FULL] requiere tablas de EZA en dump moderno
      hasSeza: false,  // [FULL] ídem
      releaseDates: {
        initial: root.open_at ?? null,
        eza: null,
        seza: null,
        latest: c.open_at ?? null,
        latestType: c.id === root.id ? 'initial' : 'awakened',
      },
      stats: {
        hp: { base: c.hp_init ?? 0, max: c.hp_max ?? 0, eza: 0 },
        atk: { base: c.atk_init ?? 0, max: c.atk_max ?? 0, eza: 0 },
        def: { base: c.def_init ?? 0, max: c.def_max ?? 0, eza: 0 },
      },
      hpGains: null,   // [FULL] requiere potential_* en dump moderno
      linkIds,
      linkNames: linkIds.map((id) => links.get(id) ?? `#${id}`),
      leaderSkill: leader ? { name: cleanText(leader.name) ?? '', description: cleanText(leader.description) ?? '' } : null,
      passiveSkill: passive ? { name: cleanText(passive.name) ?? '', description: cleanText(passive.description) ?? '' } : null,
    };
    units.push({ summary, hash: fnv1a(stable({ summary, catIds: [c.card_category1_id, c.card_category2_id, c.card_category3_id, c.card_category4_id, c.card_category5_id, c.card_category6_id].filter((x) => x != null) })) });
  }
  units.sort((a, b) => a.summary.id - b.summary.id);
  return { units, warnings, lookups: { links: links.size, leaders: leaders.size, passives: passives.size, categories: categories.size, cards: allCards.length } };
}

/* ------------------------------------------------------------------ validación vs semilla actual */

function validate(units, seedPath) {
  if (!existsSync(seedPath)) {
    console.log('[game_sync] Sin semilla previa para validar.');
    return;
  }
  const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
  const byId = new Map(seed.map((u) => [Number(u.id), u]));
  let overlap = 0;
  const fail = {};
  const bump = (k) => (fail[k] = (fail[k] ?? 0) + 1);
  const sample = [];
  for (const { summary: s } of units) {
    const t = byId.get(s.id);
    if (!t) continue;
    overlap++;
    if (t.name !== s.name) bump('name');
    if (t.type !== s.type) bump('type');
    if (t.rarity !== s.rarity) bump('rarity');
    if (t.class !== s.class) bump('class');
    if (t.cost !== s.cost) bump('cost');
    if (t.stats.hp.max !== s.stats.hp.max || t.stats.atk.max !== s.stats.atk.max || t.stats.def.max !== s.stats.def.max) bump('stats.max');
    if ((t.linkIds ?? []).join(',') !== s.linkIds.join(',')) bump('links');
    if ((t.leaderSkill?.description ?? '') !== (s.leaderSkill?.description ?? '')) bump('leader');
    if ((t.passiveSkill?.description ?? '') !== (s.passiveSkill?.description ?? '')) bump('passive');
    if (sample.length < 8) sample.push({ id: s.id, name: s.name, app: `${t.rarity}/${t.type}/${t.class}`, dump: `${s.rarity}/${s.type}/${s.class}` });
  }
  console.log(`[game_sync] Validación vs semilla actual: ${overlap} unidades en común.`);
  for (const [k, n] of Object.entries(fail)) console.log(`  ${k}: ${n}/${overlap} discrepancias`);
  if (!Object.keys(fail).length) console.log('  ¡Coincidencia total en todos los campos comparados!');
  console.log('[game_sync] Muestra:', sample.map((m) => `${m.id} ${m.name} (app ${m.app} | dump ${m.dump})`).join(' ; '));
}

/* ------------------------------------------------------------------ main */

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const dbPath = args.find((a) => !a.startsWith('--'));
  if (!dbPath) {
    console.error('Uso: node tools/game_sync.mjs <ruta/database.db> [--write]');
    process.exit(1);
  }

  console.log(`[game_sync] Leyendo ${dbPath} …`);
  const raw = readFileSync(dbPath);
  let dec, params = null;
  if (raw.subarray(0, 16).equals(MAGIC)) {
    dec = raw; // ya en claro
  } else {
    const r = decryptDb(raw);
    if (!r) throw new Error('No se pudo descifrar (¿clave o esquema distintos?)');
    dec = r.out;
    params = r;
    console.log(`[game_sync] Descifrado OK (página ${r.page}, reserve ${r.reserve}, PBKDF2 ${r.iters}).`);
  }

  const tmp = join(process.env.TEMP ?? '.', `game_sync_${Date.now()}.db`);
  writeFileSync(tmp, dec);
  let out;
  const db = new DatabaseSync(tmp, { readOnly: true });
  try {
    out = buildUnits(db);
  } finally {
    db.close();
  }
  rmSync(tmp, { force: true });

  console.log(`[game_sync] BD: ${out.lookups.cards} cartas → ${out.units.length} unidades terminales.`);
  console.log(`[game_sync] Lookups: ${out.lookups.links} links, ${out.lookups.leaders} líderes, ${out.lookups.passives} pasivas, ${out.lookups.categories} categorías.`);
  for (const w of out.warnings) console.log(`[game_sync] Aviso: ${w}`);

  validate(out.units, join(OUT_DIR, 'units.index.json'));

  if (!write) {
    console.log('[game_sync] Modo análisis (sin --write): no se escribió nada.');
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const writeJson = (name, data) => {
    writeFileSync(join(OUT_DIR, name), JSON.stringify(data));
    console.log(`[game_sync] Escrito ${name} (${(JSON.stringify(data).length / 1024).toFixed(0)} KB)`);
  };
  writeJson('units.index.json', out.units.map((u) => u.summary));
  writeJson('meta.json', {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'database.db del cliente DOKKAN (datamine)',
    attribution: 'Data: datamine del cliente DOKKAN',
    unitCount: out.units.length,
    hashes: Object.fromEntries(out.units.map((u) => [u.summary.id, u.hash])),
  });
  console.log('[game_sync] Listo.');
}

// main() con await dentro: envolvemos.
(async () => {
  try { main(); } catch (e) { console.error('[game_sync] ERROR:', e.message); process.exit(1); }
})();
