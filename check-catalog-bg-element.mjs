import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const { stdout } = await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', 'https://dokkaninfo.com/cards'], { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });

// Extract v-bind:cardsjson
const m = stdout.match(/v-bind:cardsjson\s*=\s*(["'])/);
if (m) {
  const quote = m[0].slice(-1);
  const start = m.index + m[0].length;
  const end = stdout.indexOf(quote, start);
  const jsonStr = stdout.slice(start, end);

  const decode = (s) => s
    .replace(/"/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');

  const cards = JSON.parse(decode(jsonStr));

  // Check if any card has bg_element
  const withBgElement = cards.filter(c => c.bg_element !== undefined);
  console.log('Cards with bg_element:', withBgElement.length);
  if (withBgElement.length > 0) {
    console.log('Sample:', JSON.stringify(withBgElement[0], null, 2));
  }

  // Check all keys in first card
  console.log('\nKeys in first card:', Object.keys(cards[0]));
}