import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function fetchText(url) {
  const { stdout } = await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url], { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
  return stdout;
}

function decode(s) {
  return s.replace(/"/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'").replace(/'/g, "'").replace(/&nbsp;/g, ' ').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}

async function main() {
  const cardsHtml = await fetchText('https://dokkaninfo.com/cards');

  const m = cardsHtml.match(/v-bind:cardsjson=([\"'])(.*?)\1/);
  if (m) {
    console.log('Matched!');
    console.log('Quote:', m[1]);
    console.log('Raw length:', m[2].length);
    console.log('First 200 chars:', m[2].substring(0, 200));

    // Try parsing without decode
    try {
      const cards = JSON.parse(m[2]);
      console.log('Parsed without decode! Total:', cards.length);

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
      console.log('Parse without decode failed:', e.message);
    }

    // Try with decode
    try {
      const decoded = decode(m[2]);
      console.log('Decoded first 200:', decoded.substring(0, 200));
      const cards = JSON.parse(decoded);
      console.log('Parsed with decode! Total:', cards.length);
    } catch (e) {
      console.log('Parse with decode failed:', e.message);
    }
  } else {
    console.log('No match');
  }
}

main().catch(e => console.error(e));