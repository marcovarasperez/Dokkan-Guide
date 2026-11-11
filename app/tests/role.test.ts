// Autocomprobación del detector de roles: `node tests/role.test.ts` (Node ≥ 23, sin dependencias).
import assert from 'node:assert/strict';
import { identifyRole, losesBuffWhenHit, needsHits, restSkill } from '../src/model/role.ts';
import { bestSaPct, damageVsPeers, effectiveDamage, leaderAtkPct, passiveAtkPct } from '../src/model/damage.ts';

const base = { passive: '', superText: '', passiveCrit: 0, passiveDodge: 0, addsCount: 0, raiseLong: false };

// Tanque: reducción de daño con icono de dokkaninfo en medio + guard.
const tank = identifyRole({ ...base, passive: '- Damage reduction rate 40%{passiveImg:up_g}\n- Guards all attacks' });
assert.equal(tank.id, 'tank');
assert.equal(tank.scores.tank, 80);

// 1 % de evasión NO es 100 % (bug del pct() original).
assert.notEqual(identifyRole({ ...base, passiveDodge: 1 }).id, 'dodge');

// Esquiva alta → tanque de esquiva; buff largo → stacker; crítico + adicionales → nuker.
assert.equal(identifyRole({ ...base, passiveDodge: 60, passiveCrit: 30 }).id, 'dodge'); // con daño real: tanque de esquiva
assert.equal(identifyRole({ ...base, raiseLong: true, passiveDodge: 90 }).id, 'stacker');
assert.equal(identifyRole({ ...base, passiveCrit: 50, addsCount: 2 }).id, 'nuker');
assert.equal(identifyRole({ ...base, passive: "- All allies' ATK & DEF 30%\n- All allies' Ki +2" }).id, 'support');

console.log('role.test.ts OK');

// Superviviente: Hercule INT EZA (pasiva real de dokkaninfo): esquiva, reducción 50–90 %, sin daño propio.
const hercule = identifyRole({
  ...base,
  passive:
    "*Basic effect(s)*\n- High chance of evading enemy's attack\n*When HP is 50% or more*\n- Chance of evading enemy's attack 10%{passiveImg:up_g}\n*When attacking with 12 or more Ki*\n- ATK & DEF 150%{passiveImg:up_g}\n*The less HP remaining*\n- Damage reduction rate{passiveImg:up_g} (50% - 90%)",
  superText: 'Greatly raises ATK & DEF for 1 turn and causes supreme damage with a high chance of stunning the enemy',
  passiveDodge: 60,
});
assert.equal(hercule.id, 'survivor');
assert.ok(hercule.scores.tank >= 90); // el rango "(50% - 90%)" cuenta por su máximo
// Poco daño (crítico 10 %) sigue siendo superviviente; con crítico 30 % ya no.
assert.equal(identifyRole({ ...base, passiveDodge: 60, passiveCrit: 10 }).id, 'survivor');
assert.notEqual(identifyRole({ ...base, passiveDodge: 60, passiveCrit: 30 }).id, 'survivor');

console.log('superviviente OK');

// Trunks (Teen) INT "Battle at the Intergalactic World Tournament": crítico y adicional en el
// texto, pero kit de esquiva y daño efectivo muy por debajo de su época → superviviente.
assert.equal(identifyRole({ ...base, passiveDodge: 60, passiveCrit: 60, addsCount: 1, dmgVsPeers: 0.5 }).id, 'survivor');
// …pero si la pasiva ya esquiva ≥ 70 % (criterio de Playmaker: Krillin INT, Pan GT) no lo es.
assert.notEqual(identifyRole({ ...base, passiveDodge: 70, dmgVsPeers: 0.3 }).id, 'survivor');
// Mismo kit con daño de su época → no.
assert.notEqual(identifyRole({ ...base, passiveDodge: 60, passiveCrit: 60, addsCount: 1, dmgVsPeers: 1.1 }).id, 'survivor');

// Calculadora de daño (damage.ts) con textos reales de dokkaninfo.
assert.equal(leaderAtkPct(`"Final Trump Card" or
"Majin Buu Saga" Category
Ki +3 and HP, ATK & DEF +220%`), 220);
assert.equal(
  passiveAtkPct(`*Basic effect(s)*
- ATK & DEF 200%{passiveImg:up_g}
- "Movie Heroes" Category allies' Ki +2,
ATK 60%{passiveImg:up_g}
*For every Rainbow Ki Sphere obtained*
- ATK & DEF 50%{passiveImg:up_g} (up to 150%)
- Chance of performing a critical hit & damage reduction rate 7%{passiveImg:down_r}`),
  350, // 200 + 150 (máximo del escalado); el buff a aliados no cuenta
);
assert.equal(bestSaPct([{ rate: 200, lvBonus: 5, atkRaise: 0 }, { rate: 150, lvBonus: 10, atkRaise: 100 }], 20), 440);
assert.equal(effectiveDamage(10000, 200, 100, 300), 300000);
// Época: 40 unidades con daño 100–139 y una con 50 → 50 / p75 (130) ≈ 0,38.
const idx: Record<string, { d: number; t: number }> = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(i), { d: 100 + i, t: 1000 }]));
idx['999'] = { d: 50, t: 1000 };
assert.ok(damageVsPeers(999, idx)! < 0.4);
assert.equal(damageVsPeers(12345, idx), undefined); // fuera del índice
console.log('daño OK');

// Criterios de Playmaker con pasivas reales.

const kidBuu = `*Basic effect(s)*
- Ki +3 and ATK & DEF 250%{passiveImg:up_g}
*Before receiving 6 attacks in battle*
- DEF 100%{passiveImg:up_g}
- Damage reduction rate 20%{passiveImg:up_g}
*After receiving an attack*
- Recovers 20% HP at the end of turn`;
assert.equal(losesBuffWhenHit(kidBuu), true); // full evasión
assert.equal(needsHits(kidBuu), false); // curarse al recibir no es "necesitar golpes"
assert.equal(needsHits(`*After receiving an attack*\n- ATK 300%{passiveImg:up_g}`), true);
assert.equal(needsHits(`*For every attack received or evaded*\n- ATK & DEF 50%`), false); // esquivar también cuenta
assert.equal(needsHits(`*When receiving an attack*\n- DEF 200%`), false);
console.log('playmaker OK');

// Resto del reparto (6 puntos) con casos de las guías de Playmaker.
const rest = (o: Partial<Parameters<typeof restSkill>[0]>) => restSkill({ crit: 0, dodge: 0, needsHits: false, allTypes: false, affinity: 'additional', ...o });
assert.equal(rest({ dodge: 70, affinity: 'evasion' }), 'critical'); // Krillin INT / Pan GT: ya esquiva 70 %
assert.equal(rest({ crit: 80 }), 'evasion'); // Goku SS3 (Angel): empieza con 80 % de crítico
assert.equal(rest({ crit: 60, affinity: 'critical' }), 'evasion'); // Trunks STR GT: 60 % de crítico
assert.equal(rest({ crit: 50, dodge: 50, affinity: 'evasion' }), 'critical'); // Super Baby 2 INT: iguales → la que no da su tipo
assert.equal(rest({ crit: 50, dodge: 50, affinity: 'critical' }), 'evasion'); // Goku SS3 GT STR: iguales y ya trae 5 de crítico
assert.equal(rest({ allTypes: true }), 'evasion'); // Shadow Dragons: súper efectivos por pasiva
assert.equal(rest({ needsHits: true, crit: 58 }), 'critical'); // Ultimate Gohan: necesita recibir un golpe
assert.equal(rest({ affinity: 'critical' }), 'evasion'); // sin nada en la pasiva: STR ya trae 5 de crítico
console.log('resto OK');
