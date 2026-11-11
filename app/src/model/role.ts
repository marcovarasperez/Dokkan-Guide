// src/model/role.ts
// Identifica el ROL de una unidad a partir del texto de su pasiva y su Súper (inglés, dokkaninfo.com)
// y devuelve unos pesos para ponderar la ganancia de Adicional / Crítico / Evasión en el HiPo.

export type RoleId = 'stacker' | 'dodge' | 'tank' | 'nuker' | 'support' | 'hybrid' | 'survivor';

export interface RoleInput {
  passive: string;      // texto de la pasiva
  superText: string;    // Súper + Ultra Súper concatenados
  passiveCrit: number;  // % crítico de la pasiva (0–100, como hp.ts)
  passiveDodge: number; // % evasión de la pasiva (0–100)
  addsCount: number;    // nº de adicionales de la pasiva (garantizados + probabilísticos)
  raiseLong: boolean;   // ¿el SU sube ATK/DEF 6–99 turnos o acumula?
  dmgVsPeers?: number;  // daño efectivo / p75 del de las UR/LR de su época (damage.ts → damageVsPeers); sin dato = undefined
}

export interface Weights { additional: number; critical: number; evasion: number; }

export interface RoleResult {
  id: RoleId;
  label: string;
  slot: string;                        // slot de rotación recomendado
  scores: { tank: number; damage: number; support: number; dodge: number };
  reasons: string[];                   // pistas encontradas en el texto
  weights: Weights;
}

// Pesos por rol: multiplican la ganancia (pp) de cada rama del árbol.
export const ROLE_WEIGHTS: Record<RoleId, Weights> = {
  stacker: { additional: 1.3, critical: 1.0, evasion: 0.8 }, // cada ataque extra acumula buff
  nuker:   { additional: 1.2, critical: 1.2, evasion: 0.7 }, // slot 2: daño
  hybrid:  { additional: 1.0, critical: 1.0, evasion: 1.0 }, // equilibrado
  tank:    { additional: 0.9, critical: 0.8, evasion: 1.3 }, // slot 1: aguantar golpes
  dodge:   { additional: 0.9, critical: 0.8, evasion: 1.4 }, // tanque por esquiva
  support: { additional: 0.8, critical: 0.8, evasion: 1.3 }, // slot 3: sobrevivir y apoyar
  survivor: { additional: 1.0, critical: 0.0, evasion: 1.5 }, // relleno sin daño: hp.ts fuerza Evasión 15 + Adicional 6
};

const LABELS: Record<RoleId, { label: string; slot: string }> = {
  stacker: { label: 'Acumulador (stacker)', slot: 'Slot 2' },
  nuker:   { label: 'Daño (nuker)',         slot: 'Slot 2' },
  hybrid:  { label: 'Híbrido',              slot: 'Slot 1 o 2' },
  tank:    { label: 'Tanque',               slot: 'Slot 1' },
  dodge:   { label: 'Tanque de esquiva',    slot: 'Slot 1' },
  support: { label: 'Soporte (floater)',    slot: 'Slot 3' },
  survivor: { label: 'Superviviente (relleno)', slot: 'Slot 3' },
};

// Suma todos los números capturados por la regex (grupo 1).
function sum(text: string, re: RegExp): number {
  let total = 0;
  for (const m of text.matchAll(re)) total += Number(m[1]);
  return total;
}

function count(text: string, re: RegExp): number {
  return [...text.matchAll(re)].length;
}

export function identifyRole(input: RoleInput): RoleResult {
  // Los iconos {passiveImg:…} de dokkaninfo cortarían frases como "rate 20%{…}".
  const text = `${input.passive} ${input.superText}`.replace(/\{passiveImg:[^}]*\}/g, '').replace(/\s+/g, ' ');
  const crit = input.passiveCrit;
  const dodge = input.passiveDodge;
  const reasons: string[] = [];

  // ---------- TANQUE ----------
  const dr = sum(text, /(?:reduces damage received by|damage reduction rate)\s*\+?\(?(?:\d+%\s*-\s*)?(\d+)%/gi);
  const guard = /guards all attacks/i.test(text);
  const counter = /counters?\b/i.test(text);
  const bigDef = /(?:massively|greatly) raises DEF/i.test(input.superText);
  const onHit = /with each attack received/i.test(text);

  let tank = dr;
  if (dr) reasons.push(`reducción de daño ${dr} %`);
  if (guard) { tank += 40; reasons.push('guard'); }
  if (counter) { tank += 15; reasons.push('contraataque'); }
  if (bigDef) { tank += 15; reasons.push('Súper sube mucho DEF'); }
  if (onHit) { tank += 10; reasons.push('se potencia al recibir golpes'); }

  // ---------- DAÑO ----------
  const onSuper = /ATK \+\d+% when (?:performing|launching) a Super Attack/i.test(text);
  const noGuard = /disables (?:the )?(?:enemy's )?guard/i.test(text);
  const allTypes = /effective against all types/i.test(text);

  let damage = crit + input.addsCount * 20;
  if (crit) reasons.push(`crítico ${crit} %`);
  if (input.addsCount) reasons.push(`${input.addsCount} adicional(es)`);
  if (onSuper) { damage += 15; reasons.push('ATK al lanzar Súper'); }
  if (noGuard) { damage += 10; reasons.push('anula guard enemigo'); }
  if (allTypes) { damage += 10; reasons.push('eficaz contra todos los tipos'); }

  // ---------- SOPORTE ----------
  const allyBuffs = count(text, /all allies'|allies' /gi);
  const heals = count(text, /recovers? \d+% HP/gi);
  const debuffs = count(text, /lowers (?:the )?enemy's|seals|stuns/gi);

  const support = allyBuffs * 15 + heals * 10 + debuffs * 10;
  if (allyBuffs) reasons.push(`${allyBuffs} buff(s) a aliados`);
  if (heals) reasons.push('curación');
  if (debuffs) reasons.push('debuff al enemigo');

  if (dodge) reasons.push(`evasión ${dodge} %`);

  // ---------- SUPERVIVIENTE ----------
  // Kit centrado en esquivar (pasiva y/o Súper) y poco daño: por texto o porque su
  // DAÑO EFECTIVO (2 líderes + pasiva + mejor Súper) se queda muy corto frente a las
  // unidades de su época (salida / EZA / SEZA).
  const dodgeFocus = dodge >= 40 || /(?:evad|dodg)/i.test(input.superText);
  const weakAtk = input.dmgVsPeers !== undefined && input.dmgVsPeers < 0.7;
  if (input.dmgVsPeers !== undefined) reasons.push(`daño al ${Math.round(input.dmgVsPeers * 100)} % de las unidades de su época`);

  // ---------- DECISIÓN ----------
  let id: RoleId;
  if (input.raiseLong) id = 'stacker';
  // Relleno de huecos que solo necesita sobrevivir (Hercule INT EZA, Trunks (Teen) del Torneo Intergaláctico).
  // Criterio de Playmaker: si la pasiva YA esquiva ≥ 70 % (Krillin INT, Pan GT), más Evasión
  // no se nota → no es superviviente, va por full adicionales.
  else if (dodgeFocus && dodge < 70 && (damage < 20 || weakAtk)) id = 'survivor';
  else if (dodge >= 40 && dodge >= tank) id = 'dodge';
  else if (tank >= 40 && damage >= 40) id = 'hybrid';
  else if (support > tank && support > damage) id = 'support';
  else if (tank > damage) id = 'tank';
  else if (damage > 0) id = 'nuker';
  else id = 'hybrid'; // sin pistas → reparto neutro

  return {
    id,
    ...LABELS[id],
    scores: { tank, damage, support, dodge },
    reasons,
    weights: ROLE_WEIGHTS[id],
  };
}

// Ganancia ponderada por rol (las diferencias van en 0–1, igual que en hp.ts).
export function weightedGain(
  w: Weights,
  dAdditional: number,
  dCritical: number,
  dEvasion: number,
): number {
  return w.additional * dAdditional + w.critical * dCritical + w.evasion * dEvasion;
}

// Línea para steps[] con coma decimal española.
export function roleStep(r: RoleResult): string {
  const f = (n: number) => n.toFixed(1).replace('.', ',');
  const why = r.reasons.length ? r.reasons.join(', ') : 'sin pistas en el texto';
  return `Rol detectado — ${r.label} (${r.slot}) por: ${why}. ` +
    `Pesos → Adicional ×${f(r.weights.additional)} · Crítico ×${f(r.weights.critical)} · Evasión ×${f(r.weights.evasion)}.`;
}


/* ---------- Criterios de las guías de Playmaker (playlist "Hidden Potentials y Ataques Farmeables") ---------- */

/** Bloques `*cabecera*` + sus viñetas de la pasiva de dokkaninfo. */
function sections(passive: string): { head: string; body: string }[] {
  return passive
    .replace(/\{passiveImg:[^}]*\}/g, '')
    .split(/\n(?=\*)/)
    .map((s) => {
      const m = s.match(/^\*([^*]*)\*([\s\S]*)$/);
      return m ? { head: m[1].replace(/\s+/g, ' '), body: m[2] } : { head: '', body: s };
    });
}

/**
 * ¿Tiene una defensa que se PIERDE al recibir golpes ("Before receiving 6 attacks…")?
 * Esquivar la alarga → build puramente defensiva: Evasión 15 y el resto en Adicional.
 */
export function losesBuffWhenHit(passive: string): boolean {
  return sections(passive).some(
    (s) => /\b(?:before|until) receiving \d+ attacks?/i.test(s.head) && /DEF|damage reduction/i.test(s.body),
  );
}

/**
 * ¿NECESITA recibir golpes para potenciarse (ATK/DEF/crítico por golpe recibido, revivir)?
 * Entonces la Evasión va en su contra → el resto del reparto va a Crítico.
 */
export function needsHits(passive: string): boolean {
  if (/\breviv|survives K\.O\./i.test(passive)) return true;
  return sections(passive).some(
    (s) =>
      /(?:for every|with each|per) attack received(?! or evaded)|after receiving (?:an attack|\d+ (?:or more )?attacks?)/i.test(s.head) &&
      /\bATK\b|\bDEF\b|critical/i.test(s.body),
  );
}

/**
 * A qué rama van los 6 puntos que sobran tras "full adicionales", según las guías de Playmaker:
 *  - necesita recibir golpes → Crítico (la Evasión va en su contra);
 *  - ya es "efectivo contra todos los tipos" (y no esquiva ya ≥ 50 %) → Evasión;
 *  - la que MENOS tenga la pasiva si la diferencia es clara (≥ 20 puntos): mucho crítico →
 *    Evasión, mucha esquiva → Crítico; parecidas, la que NO da ya su afinidad de tipo
 *    (INT trae 5 de Evasión → Crítico; STR/TEQ traen 5 de Crítico → Evasión; AGL/PHY → Crítico).
 */
export function restSkill(o: {
  crit: number; // % crítico de la pasiva
  dodge: number; // % evasión de la pasiva
  needsHits: boolean;
  allTypes: boolean; // "Attacks are effective against all Types"
  affinity: 'additional' | 'critical' | 'evasion';
}): 'critical' | 'evasion' {
  if (o.needsHits) return 'critical';
  if (o.allTypes && o.dodge < 50) return 'evasion';
  // Diferencia clara (≥ 20 puntos): se refuerza la que menos tiene.
  if (Math.abs(o.crit - o.dodge) >= 20) return o.crit < o.dodge ? 'critical' : 'evasion';
  return o.affinity === 'critical' ? 'evasion' : 'critical';
}
