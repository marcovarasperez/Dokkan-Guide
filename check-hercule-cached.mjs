import { readFileSync } from 'node:fs';

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