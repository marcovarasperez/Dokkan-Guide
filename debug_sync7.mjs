import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function fetchText(url) {
  const { stdout } = await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url], { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
  return stdout;
}

// EXACT copy from sync.mjs
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

async function main() {
  const cardsHtml = await fetchText('https://dokkaninfo.com/cards');

  const m = cardsHtml.match(/v-bind:cardsjson=([\"'])(.*?)\1/);
  if (m) {
    console.log('Matched!');

    try {
      const decoded = decode(m[2]);
      const cards = JSON.parse(decoded);
      console.log('Parsed! Total:', cards.length);

      const nr = cards.filter(c => (c.rarity === 0 || c.rarity === 1 || c.rarity === 2));
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

      return;
    } catch (e) {
      console.log('Parse failed:', e.message);
    }
  }
}

main().catch(e => console.error(e));