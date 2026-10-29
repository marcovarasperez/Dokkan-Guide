import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Download with curl, suppress stdout
await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', '-o', 'cards-page.html', 'https://dokkaninfo.com/cards'], {
  maxBuffer: 64 * 1024 * 1024,
  encoding: 'utf8',
  stdio: ['ignore', 'ignore', 'pipe'] // suppress stdout/stderr
});

const html = readFileSync('cards-page.html', 'utf8');

const m = html.match(/v-bind:cardsjson\s*=\s*(["'])/);
if (!m) {
  console.log('ERROR: Could not find v-bind:cardsjson');
  process.exit(1);
}

const quote = m[0].slice(-1);
const start = m.index + m[0].length;
const end = html.indexOf(quote, start);
const jsonStr = html.slice(start, end);

const decode = (s) => s
  .replace(/"/g, '"')
  .replace(/&#039;/g, "'")
  .replace(/&apos;/g, "'")
  .replace(/</g, '<')
  .replace(/>/g, '>')
  .replace(/&/g, '&');

let cards;
try {
  cards = JSON.parse(decode(jsonStr));
} catch (e) {
  console.log('ERROR parsing JSON:', e.message);
  process.exit(1);
}

const validCards = cards.filter(c => Number(c.rarity ?? 0) >= 3 && Number(c.id ?? 0) > 0 && !String(c.id).startsWith('9'));

// Check awoken_max and optimal_awakening_step fields
const withAwokenMax = validCards.filter(c => c.awoken_max === 1);
const withOptimalStep = validCards.filter(c => c.optimal_awakening_step !== null && c.optimal_awakening_step !== undefined);

console.log('Total valid:', validCards.length);
console.log('awoken_max === 1:', withAwokenMax.length);
console.log('has optimal_awakening_step:', withOptimalStep.length);

// Group by name+type and check max rarity + awoken_max
const groups = {};
validCards.forEach(c => {
  const typeMap = { '0': 'AGL', '1': 'TEQ', '2': 'INT', '3': 'STR', '4': 'PHY' };
  const type = typeMap[String(c.bg_element ?? c.element[0])] ?? 'AGL';
  const key = c.name + '|' + type;
  if (!groups[key]) groups[key] = [];
  groups[key].push(c);
});

// For each group, check if any card has awoken_max=1 (can awaken further) or has LR
let hasLR = 0, hasAwokenMax1 = 0, neither = 0;
Object.entries(groups).forEach(([k,v]) => {
  const rarities = v.map(c => c.rarity);
  const maxRarity = Math.max(...rarities);
  const hasAwokenMax = v.some(c => c.awoken_max === 1);
  if (maxRarity === 5) hasLR++;
  else if (hasAwokenMax) hasAwokenMax1++;
  else neither++;
});

console.log('\nGroups with LR (rarity 5):', hasLR);
console.log('Groups without LR but has awoken_max=1:', hasAwokenMax1);
console.log('Groups without LR and no awoken_max=1:', neither);
console.log('Total groups:', Object.keys(groups).length);

// Show some groups without LR but with awoken_max=1
console.log('\nGroups without LR but awoken_max=1 (can awaken to LR?):');
Object.entries(groups).filter(([k,v]) => {
  const maxRarity = Math.max(...v.map(c => c.rarity));
  return maxRarity < 5 && v.some(c => c.awoken_max === 1);
}).slice(0, 20).forEach(([k,v]) => {
  console.log(' ', k, '-> rarities:', v.map(c => c.rarity).join(','), 'awoken_max:', v.map(c => c.awoken_max).join(','));
});