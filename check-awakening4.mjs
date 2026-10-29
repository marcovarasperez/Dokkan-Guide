import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Download with curl, suppress stdout
await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', '-o', 'cards-page.html', 'https://dokkaninfo.com/cards'], {
  maxBuffer: 64 * 1024 * 1024,
  encoding: 'utf8',
  stdio: ['ignore', 'ignore', 'pipe']
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

console.log('Extracted JSON length:', jsonStr.length);
console.log('First 500 chars:', jsonStr.slice(0, 500));

// Save for debugging
writeFileSync('extracted.json', jsonStr);

const decode = (s) => s
  .replace(/"/g, '"')
  .replace(/&#039;/g, "'")
  .replace(/&apos;/g, "'")
  .replace(/</g, '<')
  .replace(/>/g, '>')
  .replace(/&/g, '&');

const decoded = decode(jsonStr);
console.log('Decoded first 500:', decoded.slice(0, 500));

try {
  const cards = JSON.parse(decoded);
  console.log('Parsed successfully! Count:', cards.length);
} catch (e) {
  console.log('ERROR parsing JSON:', e.message);
  console.log('Position:', e.message.match(/position (\d+)/)?.[1]);
  if (e.message.includes('position')) {
    const pos = parseInt(e.message.match(/position (\d+)/)[1]);
    console.log('Context around error:', decoded.slice(Math.max(0, pos-50), pos+50));
  }
}