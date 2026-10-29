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
  return JSON.parse(decode(html.slice(start, end)));
}

function parseInertiaProps(html, url) {
  const m = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`No se encontró data-page en ${url}`);
  return JSON.parse(m[1]).props;
}

async function main() {
  // First, let's check the catalog page to see what URLs the character links point to
  const html = await fetchText('https://dokkaninfo.com/cards');

  // Look for character links in the HTML
  const linkMatches = html.matchAll(/href="(\/cards\/[^"]+)"/g);
  const urls = new Set();
  for (const match of linkMatches) {
    urls.add(match[1]);
    if (urls.size >= 5) break;
  }

  console.log('Character URLs found in catalog:');
  for (const url of urls) {
    console.log(`  ${url}`);
  }

  // Try the first few URLs
  for (const url of urls) {
    try {
      const fullUrl = `https://dokkaninfo.com${url}`;
      const detailHtml = await fetchText(fullUrl);
      const props = parseInertiaProps(detailHtml, fullUrl);
      const card = props.card;
      if (card) {
        console.log(`\n${fullUrl}:`);
        console.log(`  name: ${card.name}`);
        console.log(`  type_text: ${card.type_text}`);
        console.log(`  element: ${card.element}`);
        console.log(`  rarity_text: ${card.rarity_text}`);
        console.log(`  awakening_type_text: ${card.awakening_type_text}`);
        console.log(`  raw_attributes: ${JSON.stringify(card.raw_attributes)}`);
      }
    } catch (e) {
      console.log(`  ${url}: ERROR - ${e.message}`);
    }
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });