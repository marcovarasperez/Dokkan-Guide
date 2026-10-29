import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', '-o', 'cards-page.html', 'https://dokkaninfo.com/cards'], {
  maxBuffer: 64 * 1024 * 1024,
  encoding: 'utf8',
  stdio: ['ignore', 'ignore', 'pipe']
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

const hercules = validCards.filter(c => c.name.toLowerCase().includes('hercule') || c.name.toLowerCase().includes('satan'));
console.log('Hercule/Satan cards in live data:', hercules.length);
hercules.forEach(h => {
  console.log('  ID:', h.id, 'Name:', h.name, 'Rarity:', h.rarity, 'Element:', h.element, 'bg_element:', h.bg_element, 'awakening_number:', h.awakening_number, 'awoken_max:', h.awoken_max, 'icon_id:', h.icon_id);
});