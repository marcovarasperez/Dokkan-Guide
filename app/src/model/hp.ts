import type { UnitSummary, UnitType } from './types';
import type { UnitFull } from './detail';

/**
 * CALCULADORA DE HIDDEN POTENTIAL (Global).
 *
 * Reglas (al pie de la letra):
 *  - 21 puntos a repartir. Máximo 15 en unpm.cmd run dev          na categoría y 6 en otra; la tercera
 *    queda a 0 salvo los puntos de AFINIDAD.
 *  - Cada afinidad aporta 5 puntos iniciales, que se SUMAN en su categoría:
 *    AGL→5 Adicional · STR→5 Crítico · TEQ→5 Crítico · INT→5 Evasión · PHY→5 Adicional.
 *  - Conversión: Adicional = puntos×2% · Crítico = puntos×2% · Evasión = puntos×1%.
 *  - Varias probabilidades del mismo tipo en la pasiva se SUMAN (no el máximo).
 *  - Evasión total = 1 − (fallo pasiva × fallo HP).
 *  - Crítico total   = 1 − (fallo pasiva × fallo HP) (el del HP ya ×2).
 *  - Adicional: cada ataque (inicial + cada adicional de la pasiva) tira su
 *    dado del HP; si el dado salta, ese adicional no vuelve a activarse.
 *      · Todos garantizados: 1 − (1−p)^N, N = 1 + nº de adicionales.
 *      · Con probabilidad q: los garantizados aportan (1−p); cada q aporta
 *        (1−p·q). Total = 1 − ∏ factores. Se reparte 50 % Super / 50 % normal.
 *  - Elección: PRIORIDAD ABSOLUTA del buff de 6-99 turnos al lanzar SU → 15
 *    en Adicional. Si no, y sin adicionales en la pasiva → 15 en Adicional.
 *    Los 6 restantes van a la categoría de mayor GANANCIA (total con HP −
 *    pasiva sola), contando la afinidad. Con adicionales y sin prioridad, se
 *    comparan todas las distribuciones válidas por ganancia total.
 */

export type HpSourceKind = 'curated' | 'algorithm' | 'estimated';

export interface HpLevels {
  additional: number;
  critical: number;
  evasion: number;
}

/** Probabilidades finales (0-1) de la build elegida. */
export interface HpTotals {
  /** Adicional: prob. de que el HP añada al menos un ataque. */
  additional: number;
  /** Mitad Super Ataque / mitad ataque normal (siempre 50/50). */
  additionalSuper: number;
  additionalNormal: number;
  critical: number;
  evasion: number;
}

export interface HpSummary {
  kind: HpSourceKind;
  /** Puntos TOTALES por categoría (repartidos + afinidad). */
  levels: HpLevels;
  /** Puntos repartidos del tablero (15/6/0), sin la afinidad. */
  distributed: HpLevels;
  /** Puntos de afinidad y en qué skill caen. */
  affinity: { type: UnitType; skill: keyof HpLevels; points: number };
  totals: HpTotals;
  /** Cálculos paso a paso (formato de salida del método). */
  steps: string[];
  /** Frase corta de justificación (una línea). */
  note: string;
  /** Texto de cita mostrado en la app. */
  source: string;
  sourceUrl?: string;
  guideDate?: string;
}

/** Entrada curated del JSON (esquema en docs/hidden_potential_schema.md). */
interface HpEntry {
  unitId: number;
  variant?: 'base' | 'eza';
  /** Niveles explícitos de la guía (los ausentes se toman como 0). */
  levels?: Partial<HpLevels>;
  note?: string;
  source: string;
  sourceUrl?: string;
  guideDate?: string;
}

export interface HpSeed {
  schemaVersion: number;
  updatedAt: string | null;
  entries: HpEntry[];
}

export const SKILL_LABEL: Record<keyof HpLevels, string> = {
  additional: 'Adicional',
  critical: 'Crítico',
  evasion: 'Evasión',
};

/** Iconos oficiales del CDN (hotlink, sin redistribución): 01 Combo/Adicional, 02 Crítico, 03 Evasión. */
export const SKILL_ICON: Record<keyof HpLevels, string> = {
  additional: 'https://cdn.dokkan.fyi/assets/en/outgame/extension/pot_skill_01_off.png',
  critical: 'https://cdn.dokkan.fyi/assets/en/outgame/extension/pot_skill_02_off.png',
  evasion: 'https://cdn.dokkan.fyi/assets/en/outgame/extension/pot_skill_03_off.png',
};

/**
 * Variante en COLOR (…_on.png): las habilidades a las que se asignan nodos
 * se muestran a todo color; la que queda en 0 (o ya no recibe puntos) usa la
 * variante …_off.png en gris.
 */
export const SKILL_ICON_ON: Record<keyof HpLevels, string> = {
  additional: 'https://cdn.dokkan.fyi/assets/en/outgame/extension/pot_skill_01_on.png',
  critical: 'https://cdn.dokkan.fyi/assets/en/outgame/extension/pot_skill_02_on.png',
  evasion: 'https://cdn.dokkan.fyi/assets/en/outgame/extension/pot_skill_03_on.png',
};

/* ---------- Afinidad ---------- */

type Skill = keyof HpLevels;

/** 5 puntos de afinidad, que se suman en su categoría. */
const AFFINITY_SKILL: Record<UnitType, Skill> = {
  AGL: 'additional',
  PHY: 'additional',
  STR: 'critical',
  TEQ: 'critical',
  INT: 'evasion',
};

/* ---------- Equivalencias de probabilidad de la pasiva ---------- */

/** Etiquetas del juego → %. rare/very high según criterio del guía (15 % / 80-85 %). */
const CHANCE_WORD: Record<string, number> = {
  'very high': 82.5,
  great: 70,
  high: 50,
  medium: 30,
  rare: 15,
};

/**
 * El texto de dokkaninfo usa `\n`, bullets (`-`) y CABECERAS DE SECCIÓN
 * (`*…*`). Las cabeceras describen el ÁMBITO/CONDICIÓN (p. ej. `*Per ally
 * whose name includes "X" on the team*` es un escalado del KIT PROPIO de la
 * unidad, no apoyo). Aquí se devuelven solo los bullets de efecto, agrupados
 * con sus líneas de continuación.
 */
export function clauses(text: string): string[] {
  const clean = text.replace(/\{passiveImg:[^}]*\}/g, ' ');
  const raw = clean.split('\n').map((s) => s.trim());
  const out: string[] = [];
  let buf: string | null = null;
  let bufKind: 'bullet' | 'header' | null = null;
  const flush = (): void => {
    if (buf === null) return;
    if (bufKind === 'bullet') out.push(buf.replace(/\s+/g, ' ').trim());
    buf = null;
    bufKind = null;
  };
  for (const line of raw) {
    if (/^- /.test(line)) {
      flush();
      buf = line.slice(2);
      bufKind = 'bullet';
    } else if (/^\*/.test(line)) {
      if (bufKind === 'header') {
        buf = `${buf} ${line}`;
        if (/\*$/.test(line)) flush();
      } else {
        flush();
        buf = line.replace(/^\*/, '');
        bufKind = 'header';
        if (/\*$/.test(line)) flush();
      }
    } else if (buf !== null) {
      buf = `${buf} ${line}`;
    } else {
      // Linea huérfana (pasiva sin viñeta): se toma como cláusula propia.
      out.push(line.replace(/\s+/g, ' ').trim());
    }
  }
  flush();
  return out;
}

/**
 * ¿El efecto de la cláusula va dirigido a los ALIADOS (soporte) en vez de a
 * la propia unidad? Se decide por el DESTINO, no por la cabecera de sección:
 * - "X allies' DEF/ATK… chance of…" → los aliados (el `allies'` va ANTES del
 *   efecto). Si el chance va primero ("Chance of evading… 30% and Super Class
 *   allies' Ki +2"), el chance es de la propia unidad.
 * - `for "Unidad"` → dirigido a otra unidad concreta.
 */
const targetsAllies = (c: string): boolean => {
  const ai = c.search(/\ballies['’]?\b/i);
  if (ai >= 0) {
    const ci = c.search(
      /\bchance\s+(?:of|to)\s+(?:a\s+)?(?:performing|scoring|landing|evad|dodge)/i,
    );
    if (ci < 0 || ai < ci) return true;
  }
  if (/\bfor\s+"/i.test(c)) return true;
  return false;
};

/**
 * ¿Tras el % base aparece un escalado "(up to M%)"? Se usa el MÁXIMO (kit a
 * pleno potencial, criterio del guía). Si no, el % base.
 */
function maxIfScaled(c: string, m: RegExpMatchArray): number {
  const base = Number(m[1]);
  const after = (m.index ?? 0) + m[0].length;
  const up = c
    .slice(after, after + 30)
    .match(/\(\s*up\s+to\s+(\d+(?:\.\d+)?)\s*%\s*\)/i);
  return up ? Number(up[1]) : base;
}

/* ---------- Análisis de la unidad (textos en inglés de la fuente) ---------- */

/** Adicionales de la pasiva: garantizados + probabilísticos (con su q). */
export interface PassiveAdds {
  guaranteed: number;
  probs: number[];
}

interface Traits {
  affinity: UnitType;
  adds: PassiveAdds;
  passiveCrit: number; // % (SUMA de todas las de la pasiva)
  passiveDodge: number; // % (SUMA de todas las de la pasiva)
  /** ¿El SU sube ATK/DEF durante 6-99 turnos (o stacking/indefinite)? */
  raiseLong: boolean;
}

/**
 * Evasión de una cláusula. dokkaninfo pone el % DESPUÉS de la frase
 * ("chance of evading enemy's attack 10%") o una etiqueta ANTES
 * ("High chance of evading…"). Un efecto ESCALADO "…10% (up to 50%)" se
 * valora por su MÁXIMO (kit completo). Las garantizadas condicionales
 * ("if HP is…") se ignoran para no inflar.
 */
function dodgeInClause(c: string): number {
  if (targetsAllies(c)) return 0;
  if (/\bguarantee\w*\b[^.]{0,60}\b(?:dodge|evad)/i.test(c)) return 100;
  // número ANTES: "70% chance of evading"
  let m = c.match(/(\d+(?:\.\d+)?)\s*%\s*chance\s+(?:of|to)\s+(?:an?\s+)?(?:dodge|evad\w*)/i);
  if (m) return Number(m[1]);
  // número DESPUÉS: "chance of evading enemy's attack 10% (up to 50%)"
  m = c.match(/chance\s+(?:of|to)\s+(?:an?\s+)?(?:dodge|evad\w*)[^\d%]{0,80}?(\d+(?:\.\d+)?)\s*%/i);
  if (m) return maxIfScaled(c, m);
  // etiqueta ANTES: "High chance of evading…"
  m = c.match(/\b(very\s+high|great|high|medium|rare)\s+chance\s+(?:of|to)\s+(?:an?\s+)?(?:dodge|evad\w*)/i);
  if (m) return CHANCE_WORD[m[1].toLowerCase().replace(/\s+/g, ' ')] ?? 0;
  // garantizada sin condición ("Evades enemy's attack")
  if (/\b(?:evades?|dodges?)\b[^.]{0,40}\battack/i.test(c) && !/\bif\b/i.test(c)) return 100;
  return 0;
}

/** Crítico de una cláusula (mismas formas que evasión, incl. escalado "up to"). */
function critInClause(c: string): number {
  if (targetsAllies(c)) return 0;
  // garantizado: "Performs a critical hit" (sin condición "if")
  if (/\bperforms?\s+a\s+critical\s+hit/i.test(c) && !/\bif\b/i.test(c)) return 100;
  // número ANTES
  let m = c.match(
    /(\d+(?:\.\d+)?)\s*%\s*chance\s+(?:of|to)\s+(?:a\s+)?(?:performing|scoring|landing)?\s*(?:a\s+)?critical\s+hit/i,
  );
  if (m) return Number(m[1]);
  // número DESPUÉS: "chance of performing a critical hit & damage reduction rate 25%"
  m = c.match(
    /chance\s+(?:of|to)\s+(?:a\s+)?(?:performing|scoring|landing)?\s*(?:a\s+)?critical\s+hit[^\d%]{0,80}?(\d+(?:\.\d+)?)\s*%/i,
  );
  if (m) return maxIfScaled(c, m);
  // etiqueta ANTES
  m = c.match(
    /\b(very\s+high|great|high|medium|rare)\s+chance\s+(?:of|to)\s+(?:a\s+)?(?:performing|scoring|landing)?\s*(?:a\s+)?critical\s+hit/i,
  );
  if (m) return CHANCE_WORD[m[1].toLowerCase().replace(/\s+/g, ' ')] ?? 0;
  return 0;
}

/**
 * SUMA todas las probabilidades del mismo tipo (no el máximo).
 * Soporte ("all allies' chance of…") y garantizadas condicionales no cuentan.
 */
export function parseDodge(text: string): number {
  let sum = 0;
  for (const c of clauses(text)) sum += dodgeInClause(c);
  return Math.min(sum, 100);
}

/** SUMA todas las probabilidades de crítico de la pasiva. */
export function parseCrit(text: string): number {
  let sum = 0;
  for (const c of clauses(text)) sum += critInClause(c);
  return Math.min(sum, 100);
}

/**
 * Adicionales de la pasiva. Por cláusula: "up to N" / "N additional" fija el
 * count; el LANZAMIENTO es probabilístico solo si la chance modifica a
 * "launching/performing an additional". El "…has a high chance of BECOMING a
 * Super Attack" es conversión a SU (el ataque se lanza siempre) → garantizado.
 */
export function parseAdditionals(text: string): PassiveAdds {
  const out: PassiveAdds = { guaranteed: 0, probs: [] };
  for (const c0 of clauses(text)) {
    // Efectos de apoyo (dirigidos a aliados) no dan adicionales propios.
    if (targetsAllies(c0)) continue;
    const c = c0;
    if (!/additional\s+(?:super\s+)?attacks?/i.test(c)) continue;
    const upTo = c.match(/up\s+to\s+(\d+)\s*(?:times?|additional\s+attacks?|attacks?)/i)?.[1];
    const explicit = c.match(/\b(\d+)\s+additional\s+(?:super\s+)?attacks?/i)?.[1];
    const n = Math.min(Math.max(Number(upTo ?? explicit ?? 1), 1), 5);
    // ¿el lanzamiento es por probabilidad?
    let q = 1;
    let m = c.match(
      /(\d+(?:\.\d+)?)\s*%\s*chance\s+(?:of\s+)?(?:launching|performing)\s+an?\s+additional/i,
    );
    if (m) q = Math.min(Number(m[1]) / 100, 1);
    else if (
      (m = c.match(
        /\b(very\s+high|great|high|medium|rare)\s+chance\s+(?:of\s+)?(?:launching|performing)\s+an?\s+additional/i,
      ))
    )
      q = (CHANCE_WORD[m[1].toLowerCase().replace(/\s+/g, ' ')] ?? 0) / 100;
    else if (
      (m = c.match(
        /chance\s+(?:of\s+)?(?:launching|performing)\s+an?\s+additional[^\d%]{0,60}?(\d+(?:\.\d+)?)\s*%/i,
      ))
    )
      q = Math.min(Number(m[1]) / 100, 1);
    for (let i = 0; i < n; i += 1) {
      if (q >= 1) out.guaranteed += 1;
      else out.probs.push(q);
    }
  }
  return out;
}

/**
 * ¿El SU (o la pasiva al lanzar SU) sube ATK/DEF durante 6-99 turnos?
 * Buffs de stacking / indefinite/permanent también cuentan: acumulan y
 * perduran (es el caso de uso del método). Un buff de <6 turnos, no.
 */
export function raisesLongBuff(saTexts: string[], passive: string): boolean {
  for (const t of [...saTexts, passive]) {
    if (!/\b(rais\w+|stack\w+)\b/i.test(t)) continue;
    if (!/\b(atk|def|attack|defense)\b/i.test(t)) continue;
    if (/\b(indefinitel\w*|permanentl\w*|stack\w*)\b/i.test(t)) return true;
    for (const m of t.matchAll(/for\s+(\d+)\s+turns?/gi)) {
      const n = Number(m[1]);
      if (n >= 6 && n <= 99) return true;
    }
  }
  return false;
}

function analyze(summary: UnitSummary, full: UnitFull | null): Traits {
  const passive = (full?.passiveSkill ?? summary.passiveSkill)?.description?.trim() ?? '';
  const saTexts = (full?.superAttacks ?? []).map((s) => s.description);
  return {
    affinity: summary.type,
    adds: parseAdditionals(passive),
    passiveCrit: parseCrit(passive),
    passiveDodge: parseDodge(passive),
    raiseLong: raisesLongBuff(saTexts, passive),
  };
}

/* ---------- Fórmulas ---------- */

/** Conversión puntos → probabilidad. */
const PER_POINT: Record<Skill, number> = { additional: 0.02, critical: 0.02, evasion: 0.01 };

/** Prob. de que la pasiva lance al menos un adicional. */
function passiveAdditionalChance(adds: PassiveAdds): number {
  if (adds.guaranteed > 0) return 1;
  let f = 1;
  for (const q of adds.probs) f *= 1 - q;
  return 1 - f;
}

/** Adicional total del HP: 1 − ∏ factores. Cada garantizado (incl. el ataque inicial) → (1−p); cada q → (1−p·q). */
export function additionalTotal(p: number, adds: PassiveAdds): number {
  const guaranteed = 1 + adds.guaranteed; // ataque inicial + garantizados
  let f = Math.pow(1 - p, guaranteed);
  for (const q of adds.probs) f *= 1 - p * q;
  return 1 - f;
}

/** Crítico total = 1 − (fallo pasiva × fallo HP). */
export function critTotal(passive: number, pts: number): number {
  const pC = passive / 100;
  const h = Math.min(pts * PER_POINT.critical, 1);
  return 1 - (1 - pC) * (1 - h);
}

/** Evasión total = 1 − (fallo pasiva × fallo HP). */
export function dodgeTotal(passive: number, pts: number): number {
  const pD = passive / 100;
  const h = Math.min(pts * PER_POINT.evasion, 1);
  return 1 - (1 - pD) * (1 - h);
}

/* ---------- Elección de la distribución ---------- */

/** Las 6 permutaciones válidas de (15, 6, 0). */
const DIST: Ranking[] = [
  ['additional', 'critical', 'evasion'],
  ['additional', 'evasion', 'critical'],
  ['critical', 'additional', 'evasion'],
  ['critical', 'evasion', 'additional'],
  ['evasion', 'additional', 'critical'],
  ['evasion', 'critical', 'additional'],
];

type Ranking = [Skill, Skill, Skill];

/** Puntos repartidos (15/6/0) + afinidad, para un ranking dado. */
function levelsOf(ranking: Ranking, affinitySkill: Skill): HpLevels {
  const lv: HpLevels = { additional: 0, critical: 0, evasion: 0 };
  lv[ranking[0]] = 15;
  lv[ranking[1]] = 6;
  lv[affinitySkill] += 5;
  return lv;
}

/** Ganancia en puntos porcentuales de una distribución frente a la pasiva sola. */
function totalGain(levels: HpLevels, t: Traits): number {
  const pAdd = passiveAdditionalChance(t.adds);
  const gAdd = additionalTotal(levels.additional * PER_POINT.additional, t.adds) - pAdd;
  const gCrit = critTotal(t.passiveCrit, levels.critical) - t.passiveCrit / 100;
  const gDodge = dodgeTotal(t.passiveDodge, levels.evasion) - t.passiveDodge / 100;
  return gAdd + gCrit + gDodge;
}

/** Formato 2 decimales con coma decimal (español). */
const f2 = (x: number): string => (x * 100).toFixed(2).replace('.', ',');
/** Formato para valores que YA vienen en % (0-100): 82.5 → "82,5". */
const pct0 = (x: number): string => (Math.round(x * 10) / 10).toString().replace('.', ',');

/** Construye el resumen con el cálculo paso a paso. */
function runAlgorithm(t: Traits): { levels: HpLevels; distributed: HpLevels; totals: HpTotals; steps: string[]; note: string } {
  const affSkill = AFFINITY_SKILL[t.affinity];
  const pAdd = passiveAdditionalChance(t.adds);
  const addDesc =
    t.adds.guaranteed > 0 || t.adds.probs.length > 0
      ? `${t.adds.guaranteed} garantizado(s)${t.adds.probs.length ? `, ${t.adds.probs.map((q) => `${Math.round(q * 100)} %`).join(' / ')} por prob.` : ''}`
      : 'ninguno';

  // 1) Datos de entrada.
  const steps: string[] = [
    `1) Entrada — afinidad ${t.affinity} (→ +5 ${SKILL_LABEL[affSkill]}). Pasiva: crítico ${pct0(t.passiveCrit)} %, evasión ${pct0(t.passiveDodge)} %, adicional ${addDesc}. ¿Sube ATK/DEF 6-99 turnos al lanzar SU? ${t.raiseLong ? 'SÍ' : 'no'}.`,
  ];

  // 2) Prioridad del buff.
  const usePriority = t.raiseLong || pAdd === 0;
  if (t.raiseLong) {
    steps.push('2) Prioridad del buff de 6-99 turnos: APLICADA → 15 en Adicional (por encima de todo cálculo).');
  } else if (pAdd === 0) {
    steps.push('2) Sin buff de 6-99 turnos y sin adicionales en la pasiva → 15 en Adicional (regla fija).');
  } else {
    steps.push('2) Sin prioridad: la unidad sí tiene adicionales en la pasiva → se comparan TODAS las distribuciones válidas por ganancia total.');
  }

  // Candidatas permitidas.
  const candidates = usePriority ? DIST.filter((r) => r[0] === 'additional') : DIST;

  // 3) Cálculos de ganancia de cada opción.
  let best = candidates[0];
  let bestGain = -Infinity;
  const gainLines: string[] = [];
  for (const r of candidates) {
    const lv = levelsOf(r, affSkill);
    const g = totalGain(lv, t);
    if (g > bestGain) {
      bestGain = g;
      best = r;
    }
    if (usePriority || candidates.length <= 2) {
      gainLines.push(
        `   · ${r[0]} 15 · ${r[1]} 6 (+5 afinidad si aplica) · ${r[2]} 0 → ganancia total ${f2(g)} pp`,
      );
    }
  }
  if (gainLines.length) {
    steps.push('3) Ganancia de cada opción (total con HP − pasiva sola):');
    steps.push(...gainLines);
  } else {
    steps.push(`3) Ganancia total de la mejor distribución (${best[0]} 15 · ${best[1]} 6): ${f2(bestGain)} pp.`);
  }

  // 4) Reparto final (indicando afinidad).
  const levels = levelsOf(best, affSkill);
  const distributed: HpLevels = { additional: 0, critical: 0, evasion: 0 };
  distributed[best[0]] = 15;
  distributed[best[1]] = 6;
  steps.push(
    `4) Reparto — ${SKILL_LABEL.additional} ${levels.additional} (${distributed.additional} +${levels.additional - distributed.additional} afinidad) · ${SKILL_LABEL.critical} ${levels.critical} (${distributed.critical} +${levels.critical - distributed.critical} afinidad) · ${SKILL_LABEL.evasion} ${levels.evasion} (${distributed.evasion} +${levels.evasion - distributed.evasion} afinidad).`,
  );

  // 5) Tabla final.
  const addT = additionalTotal(levels.additional * PER_POINT.additional, t.adds);
  const totals: HpTotals = {
    additional: addT,
    additionalSuper: addT / 2,
    additionalNormal: addT / 2,
    critical: critTotal(t.passiveCrit, levels.critical),
    evasion: dodgeTotal(t.passiveDodge, levels.evasion),
  };
  steps.push(
    `5) Totales — Adicional ${f2(addT)} % (${f2(totals.additionalSuper)} % Super / ${f2(totals.additionalNormal)} % normal) · Crítico ${f2(totals.critical)} % · Evasión ${f2(totals.evasion)} %.`,
  );

  const note = t.raiseLong
    ? 'Prioridad absoluta: el SU sube ATK/DEF 6-99 turnos → 15 en Adicional para acumular.'
    : pAdd === 0
      ? 'Sin adicionales propios: el Adicional es su vía de daño extra, así que va a 15.'
      : 'Distribución con mayor ganancia total comparando todas las válidas.';

  return { levels, distributed, totals, steps, note };
}

/* ---------- API pública ---------- */

/** Recomienda el Hidden Potential para el estado vigente de la unidad. */
export function recommendHp(
  summary: UnitSummary,
  full: UnitFull | null,
  seed: HpSeed | null,
): HpSummary {
  const affSkill = AFFINITY_SKILL[summary.type];
  const affinity = { type: summary.type, skill: affSkill, points: 5 };

  // 1) Guía curated (autor citado, edición manual en hidden_potential.json).
  const ezaLive = !!summary.releaseDates.eza && Date.parse(summary.releaseDates.eza) <= Date.now();
  const wantVariant = ezaLive ? 'eza' : 'base';
  const curated =
    seed?.entries.find((e) => e.unitId === summary.id && (e.variant ?? 'base') === wantVariant) ??
    seed?.entries.find((e) => e.unitId === summary.id && (e.variant ?? 'base') === 'base');
  if (curated) {
    const levels: HpLevels = {
      additional: curated.levels?.additional ?? 0,
      critical: curated.levels?.critical ?? 0,
      evasion: curated.levels?.evasion ?? 0,
    };
    const addT = additionalTotal(levels.additional * PER_POINT.additional, { guaranteed: 0, probs: [] });
    return {
      kind: 'curated',
      levels,
      distributed: levels,
      affinity,
      totals: {
        additional: addT,
        additionalSuper: addT / 2,
        additionalNormal: addT / 2,
        critical: levels.critical * PER_POINT.critical,
        evasion: levels.evasion * PER_POINT.evasion,
      },
      steps: ['Distribución verificada de la guía (no se recalcula).'],
      note: curated.note ?? 'Distribución según la guía verificada de esta unidad.',
      source: `Source: ${curated.source}`,
      sourceUrl: curated.sourceUrl,
      guideDate: curated.guideDate,
    };
  }

  // 2) Método de cálculo local (reglas del prompt).
  const passive = (full?.passiveSkill ?? summary.passiveSkill)?.description?.trim();
  if (passive) {
    const t = analyze(summary, full);
    const r = runAlgorithm(t);
    return {
      kind: 'algorithm',
      levels: r.levels,
      distributed: r.distributed,
      affinity,
      totals: r.totals,
      steps: r.steps,
      note: r.note,
      source: 'Cálculo local (reglas del método)',
    };
  }

  // 3) Estimación por rol (fallback cuando la fuente no trae texto de pasiva).
  const attacker = summary.stats.atk.max >= summary.stats.def.max;
  const levels: HpLevels = attacker
    ? { additional: 15 + (affSkill === 'additional' ? 5 : 0), critical: 6 + (affSkill === 'critical' ? 5 : 0), evasion: affSkill === 'evasion' ? 5 : 0 }
    : { additional: 6 + (affSkill === 'additional' ? 5 : 0), critical: affSkill === 'critical' ? 5 : 0, evasion: 15 + (affSkill === 'evasion' ? 5 : 0) };
  const addT = additionalTotal(levels.additional * PER_POINT.additional, { guaranteed: 0, probs: [] });
  return {
    kind: 'estimated',
    levels,
    distributed: {
      additional: attacker ? 15 : 6,
      critical: attacker ? 6 : 0,
      evasion: attacker ? 0 : 15,
    },
    affinity,
    totals: {
      additional: addT,
      additionalSuper: addT / 2,
      additionalNormal: addT / 2,
      critical: levels.critical * PER_POINT.critical,
      evasion: levels.evasion * PER_POINT.evasion,
    },
    steps: ['Sin texto de pasiva: estimación por rol (ATK ≥ DEF → ofensivo).'],
    note: attacker
      ? 'Estimación por rol ofensivo (ATK ≥ DEF): prioriza Adicional y Crítico.'
      : 'Estimación por rol defensivo (DEF > ATK): prioriza la Evasión.',
    source: 'Estimated',
  };
}
