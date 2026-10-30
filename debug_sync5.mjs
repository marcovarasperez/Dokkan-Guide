import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function fetchText(url) {
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

async function main() {
  const cardsHtml = await fetchText('https://dokkaninfo.com/cards');

  const m = cardsHtml.match(/v-bind:cardsjson=([\"'])(.*?)\1/);
  if (m) {
    console.log('Matched!');
    console.log('Raw first 500:', m[2].substring(0, 500));

    const decoded = decode(m[2]);
    console.log('Decoded first 500:', decoded.substring(0, 500));

    // Check for the first few characters
    console.log('Char codes of first 10:', [...decoded.substring(0, 10)].map(c => c.charCodeAt(0)));

    // Try to find the actual JSON start
    const jsonStart = decoded.indexOf('[{');
    if (jsonStart > 0) {
      console.log('Found JSON at position:', jsonStart);
      console.log('Chars before JSON:', decoded.substring(0, jsonStart));
    }
  }
}

main().catch(e => console.error(e));