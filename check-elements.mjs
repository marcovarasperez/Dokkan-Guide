import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';

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

(async () => {
  const html = await fetchText('https://dokkaninfo.com/cards');
  const cards = extractVBind(html, 'cardsjson');

  const elements = new Set();
  const count = {};
  cards.forEach(c => {
    elements.add(c.element);
    count[c.element] = (count[c.element] || 0) + 1;
  });
  const result = {
    uniqueElements: Array.from(elements).sort(),
    counts: count
  };
  writeFileSync('element-analysis.json', JSON.stringify(result, null, 2));
  console.log('Saved to element-analysis.json');
  console.log('Unique element values:', result.uniqueElements);
  console.log('Element counts:', result.counts);
})();