import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function fetchText(url) {
  const { stdout } = await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url], { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
  return stdout;
}

// Copied exactly from sync.mjs - the regex uses the 6-char HTML entity
function decode(s) {
  return s
    .replace(/"/g, '"')
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
  try {
    return JSON.parse(decode(html.slice(start, end)));
  } catch {
    return null;
  }
}

function extractCardsJson(html) {
  return extractVBind(html, 'cardsjson');
}

async function main() {
  const cardsHtml = await fetchText('https://dokkaninfo.com/cards');
  const cardsJson = extractCardsJson(cardsHtml);

  if (!Array.isArray(cardsJson)) {
    console.log('Failed to extract cardsjson');
    return;
  }

  console.log('Total cards:', cardsJson.length);

  const nr = cardsJson.filter(c => (c.rarity === 0 || c.rarity === 1 || c.rarity === 2));
  console.log('N/R/SR count:', nr.length);

  if (nr.length > 0) {
    const sampleN = nr.find(c => c.rarity === 0);
    const sampleR = nr.find(c => c.rarity === 1);
    const sampleSR = nr.find(c => c.rarity === 2);

    if (sampleN) console.log('Sample N:', JSON.stringify(sampleN, null, 2));
    if (sampleR) console.log('Sample R:', JSON.stringify(sampleR, null, 2));
    if (sampleSR) console.log('Sample SR:', JSON.stringify(sampleSR, null, 2));
  }

  const elements = new Set();
  for (const c of nr) {
    elements.add(c.element);
  }
  console.log('Unique element values for N/R/SR:', [...elements].sort());

  console.log('\nClass digit analysis for N/R/SR:');
  const classDigits = new Set();
  for (const c of nr) {
    const el = String(c.element ?? '');
    classDigits.add(el[0]);
  }
  console.log('Unique first char of element:', [...classDigits].sort());

  console.log('\nawoken_max analysis for N/R/SR:');
  const awokenValues = new Set();
  for (const c of nr) {
    awokenValues.add(c.awoken_max);
  }
  console.log('Unique awoken_max:', [...awokenValues].sort((a,b) => a-b));
}

main().catch(e => console.error(e));