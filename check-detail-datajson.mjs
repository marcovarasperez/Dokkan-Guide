import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const { stdout } = await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', 'https://dokkaninfo.com/cards/1000010'], { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });

// Extract v-bind:datajson
const m = stdout.match(/v-bind:datajson\s*=\s*(["'])/);
if (m) {
  const quote = m[0].slice(-1);
  const start = m.index + m[0].length;
  const end = stdout.indexOf(quote, start);
  const jsonStr = stdout.slice(start, end);

  // Decode HTML entities
  const decode = (s) => s
    .replace(/"/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');

  const data = JSON.parse(decode(jsonStr));
  console.log('Keys:', Object.keys(data));
  if (data.card) {
    console.log('Card keys:', Object.keys(data.card));
    console.log('Card data:', JSON.stringify(data.card, null, 2));
  }
}