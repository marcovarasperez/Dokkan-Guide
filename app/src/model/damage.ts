/**
 * MODELO · Daño efectivo de una unidad (para comparar unidades de la misma época).
 *
 *   daño = ATK × (1 + 2 · líder %) × (1 + pasiva %) × (mejor Súper % + subida de ATK del Súper %)
 *
 *  - líder: los DOS huecos de líder con la mejor leader skill que la cubre
 *    (ranking `two_hundred_leaders` de dokkaninfo);
 *  - pasiva: suma de las subidas de ATK propias (kit completo: "(up to X%)" cuenta X);
 *  - Súper: el mayor multiplicador entre Super / Ultra / EX / Unit Super Attack a su
 *    nivel máximo (increase_rate + lv_bonus · (nivel − 1)) más su subida de ATK.
 *
 * Sin imports: lo usan la app (Vite) y `tools/damage_sync.mjs` (Node) a la vez.
 * shortcut: ignora el multiplicador de Ki, links y apoyos de aliados; vale para comparar, no para el daño exacto.
 */

/** Mayor % de una leader skill que suba ATK ("Ki +3 and HP, ATK & DEF +220%" → 220). */
export function leaderAtkPct(text: string): number {
  let best = 0;
  for (const m of text.matchAll(/ATK[^%\n]{0,40}?\+\s*(\d+)%/gi)) best = Math.max(best, Number(m[1]));
  return best;
}

/** Suma de las subidas de ATK PROPIAS de la pasiva (sin aliados ni bajadas). */
export function passiveAtkPct(text: string): number {
  let sum = 0;
  const lines = text
    .replace(/\{passiveImg:down[^}]*\}/g, ' [DOWN] ')
    .replace(/\{passiveImg:[^}]*\}/g, '')
    .split(/\n(?=- |\*)/);
  for (const line of lines) {
    const l = line.replace(/\s+/g, ' ');
    if (!l.startsWith('- ') || /\[DOWN\]|allies|for "/i.test(l)) continue;
    // "ATK & DEF 200%", "ATK 120% (up to 500%)": se toma el máximo si es escalado.
    const m = l.match(/\bATK(?: & DEF)? (\d+)%(?:\s*\(up to (\d+)%\))?/i);
    if (m) sum += Number(m[2] ?? m[1]);
  }
  return sum;
}

export interface SaInput {
  rate: number; // increase_rate (%)
  lvBonus: number; // lv_bonus (% por nivel)
  atkRaise: number; // subida de ATK del propio Súper (%)
}

/** Mayor (multiplicador al nivel máximo + subida de ATK) entre todos los Súper. */
export function bestSaPct(sas: SaInput[], maxLv: number): number {
  let best = 100; // sin datos: ataque normal
  for (const s of sas) best = Math.max(best, s.rate + s.lvBonus * Math.max(maxLv - 1, 0) + s.atkRaise);
  return best;
}

export function effectiveDamage(atk: number, leaderPct: number, passivePct: number, saPct: number): number {
  return Math.round(atk * (1 + (2 * leaderPct) / 100) * (1 + passivePct / 100) * (saPct / 100));
}

/** Índice generado por tools/damage_sync.mjs: id → { daño efectivo, fecha (salida/EZA/SEZA, epoch s) }. */
export type DamageIndex = Record<string, { d: number; t: number }>;

const WINDOW_S = 180 * 86400; // ±6 meses

/**
 * Daño efectivo de la unidad / percentil 75 del daño de las UR/LR de su época
 * (±6 meses de su última fecha). < 1 = pega menos que las buenas unidades de su
 * momento. undefined si la unidad no está en el índice o hay poca muestra.
 */
export function damageVsPeers(id: number, index: DamageIndex | null): number | undefined {
  const me = index?.[String(id)];
  if (!index || !me || !me.t) return undefined;
  const peers = Object.entries(index)
    .filter(([k, v]) => k !== String(id) && Math.abs(v.t - me.t) <= WINDOW_S)
    .map(([, v]) => v.d)
    .sort((a, b) => a - b);
  if (peers.length < 20) return undefined;
  return me.d / peers[Math.floor(peers.length * 0.75)];
}
