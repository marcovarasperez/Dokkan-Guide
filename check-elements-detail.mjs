import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function fetchText(url) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const { stdout } = await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url], { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
  return stdout;
}

function decode(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
}

function extractVBind(html, name) {
  const m = html.match(new RegExp(`v-bind:${name}\\s*=\\s*(["'])`));
  if (!m) return null;
  const quote = m[0].slice(-1);
  const start = m.index + m[0].length;
  const end = html.indexOf(quote, start);
  if (end < 0) return null;
  return JSON.parse(decode(html.slice(start, end)));
}

async function main() {
  const html = await fetchText('https://dokkaninfo.com/cards');
  const cards = extractVBind(html, 'cardsjson');

  // Check specific character IDs and their element values
  const targetIds = [
    1000051, // Frieza (1st Form) SSR
    1000061, // Frieza (1st Form) SSR
    10001580, // Frieza (Final Form) SSR
    10001581, // Frieza (Final Form) UR
    10002100, // Golden Frieza SSR
    10002101, // Golden Frieza UR
    1000071,  // Cell (1st Form) SSR
    1000081,  // Cell (1st Form) SSR
    10001690, // Perfect Cell SSR
    10001691, // Perfect Cell UR
    10001930, // Majin Vegeta SSR
    10001931, // Majin Vegeta UR
    10001970, // Buu (Kid) SSR
    10001971, // Buu (Kid) UR
    1000010,  // Super Saiyan Goku SSR
    1000011,  // Super Saiyan Goku UR
    1000020,  // Super Saiyan Vegeta SSR
    1000021,  // Super Saiyan Vegeta UR
  ];

  console.log('Element values for specific cards:');
  for (const id of targetIds) {
    const card = cards.find(c => c.id === id);
    if (card) {
      console.log(`ID ${id}: ${card.name}`);
      console.log(`  element: "${card.element}" (first digit: ${String(card.element)[0]})`);
      console.log(`  rarity: ${card.rarity}, raw_attributes: ${JSON.stringify(card.raw_attributes)}`);
    } else {
      console.log(`ID ${id}: NOT FOUND`);
    }
  }

  // Also check all unique element values and their first digits
  const elements = new Set();
  cards.forEach(c => elements.add(c.element));
  console.log('\nAll unique element values:', Array.from(elements).sort());

  // Group by first digit
  const byFirstDigit = {};
  elements.forEach(el => {
    const first = String(el)[0];
    if (!byFirstDigit[first]) byFirstDigit[first] = [];
    byFirstDigit[first].push(el);
  });
  console.log('\nGrouped by first digit:');
  Object.keys(byFirstDigit).sort().forEach(d => {
    console.log(`  ${d}: ${byFirstDigit[d].join(', ')}`);
  });
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });