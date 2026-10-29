import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', '-o', 'cards-page.html', 'https://dokkaninfo.com/cards'], {
  maxBuffer: 64 * 1024 * 1024,
  encoding: 'utf8',
  stdio: ['ignore', 'ignore', 'ignore']
});

const html = readFileSync('cards-page.html', 'utf8');
const m = html.match(/v-bind:cardsjson\s*=\s*(["'])/);
if (!m) { console.log('No v-bind:cardsjson found'); process.exit(1); }
const quote = m[0].slice(-1);
const start = m.index + m[0].length;
const end = html.indexOf(quote, start);
const jsonStr = html.slice(start, end);

const decode = (s) => s
  .replace(/"/g, '"')
  .replace(/&#039;/g, "'")
  .replace(/&apos;/g, "'")
  .replace(/'/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/</g, '<')
  .replace(/>/g, '>')
  .replace(/&/g, '&');

const decoded = decode(jsonStr);
const cards = JSON.parse(decoded);

const validCards = cards.filter(c => Number(c.rarity ?? 0) >= 3 && Number(c.id ?? 0) > 0 && !String(c.id).startsWith('9'));

const typeMap = { '0': 'AGL', '1': 'TEQ', '2': 'INT', '3': 'STR', '4': 'PHY' };

const hercules = validCards.filter(c => c.name.toLowerCase().includes('hercule') || c.name.toLowerCase().includes('satan'));
console.log('Hercule/Satan cards in live data (SSR+):', hercules.length);
hercules.forEach(h => {
  const type = typeMap[String(h.bg_element ?? h.element[0])] ?? 'AGL';
  console.log('  ID:', h.id, '| Name:', h.name, '| Rarity:', h.rarity, '| Type:', type, '| bg_element:', h.bg_element, '| element:', h.element, '| awakening_number:', h.awakening_number, '| awoken_max:', h.awoken_max, '| icon_id:', h.icon_id);
});

// Group by name+type
const groups = {};
hercules.forEach(h => {
  const type = typeMap[String(h.bg_element ?? h.element[0])] ?? 'AGL';
  const key = h.name + '|' + type;
  if (!groups[key]) groups[key] = [];
  groups[key].push(h);
});

console.log('\nGroups by name+type:');
Object.entries(groups).forEach(([k,v]) => {
  console.log(' ', k, '->', v.length, 'cards');
  v.forEach(c => console.log('    ID:', c.id, 'Rarity:', c.rarity));
});