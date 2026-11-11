// Autocomprobación de hp.ts: `npx esbuild tests/hp.test.ts --bundle --platform=node --outfile=dist/hp.test.cjs && node dist/hp.test.cjs`
import { raisesLongBuff } from '../src/model/hp';
import assert from 'node:assert/strict';
assert.equal(raisesLongBuff(['Greatly raises DEF and \ncauses colossal damage to enemy'], ''), true);
assert.equal(raisesLongBuff(['Raises ATK & DEF for 1 turn and \ncauses supreme damage'], ''), false);
assert.equal(raisesLongBuff(['Raises DEF by 58%, \nraises ATK by 158% for 1 turn and \ncauses damage'], ''), true); // la DEF sí acumula
assert.equal(raisesLongBuff(['Raises ATK & DEF by 58% for 1 turn, causes damage'], ''), false);
assert.equal(raisesLongBuff(['Massively raises ATK for 1 turn and \ncauses damage'], ''), false);
assert.equal(raisesLongBuff(['Raises ATK for 9 turns and causes damage'], ''), true);
console.log('stack OK');
