import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';

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

  // Filter valid cards (rarity >= 3)
  const validCards = cards.filter(c => Number(c.rarity ?? 0) >= 3 && Number(c.id ?? 0) > 0 && !String(c.id).startsWith('9'));

  // Check bg_element distribution
  const bgElementCounts = {};
  const elementCounts = {};

  validCards.forEach(c => {
    const bg = c.bg_element;
    const el = c.element;
    bgElementCounts[bg] = (bgElementCounts[bg] || 0) + 1;
    elementCounts[el] = (elementCounts[el] || 0) + 1;
  });

  const typeMap = { '0': 'AGL', '1': 'TEQ', '2': 'INT', '3': 'STR', '4': 'PHY' };

  let output = 'bg_element distribution (all valid cards):\n';
  Object.keys(bgElementCounts).sort().forEach(k => {
    output += `  ${k} (${typeMap[k] || 'UNKNOWN'}): ${bgElementCounts[k]}\n`;
  });

  output += '\nelement distribution (first digit only):\n';
  const firstDigitCounts = {};
  validCards.forEach(c => {
    const first = String(c.element)[0];
    firstDigitCounts[first] = (firstDigitCounts[first] || 0) + 1;
  });
  Object.keys(firstDigitCounts).sort().forEach(k => {
    output += `  ${k} (${typeMap[k] || 'UNKNOWN'}): ${firstDigitCounts[k]}\n`;
  });

  // Show some examples where element first digit != bg_element
  output += '\nCards where element first digit != bg_element:\n';
  const mismatches = validCards.filter(c => String(c.element)[0] !== String(c.bg_element));
  output += `Total mismatches: ${mismatches.length}\n`;
  mismatches.slice(0, 50).forEach(c => {
    output += `  ID ${c.id}: ${c.name} | element="${c.element}" (first=${String(c.element)[0]}=${typeMap[String(c.element)[0]]}) | bg_element="${c.bg_element}" (${typeMap[c.bg_element]})\n`;
  });

  writeFileSync('bg-element-analysis.txt', output);
  console.log('Analysis saved to bg-element-analysis.txt');
}