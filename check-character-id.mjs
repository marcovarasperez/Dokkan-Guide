import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, readFileSync } from 'node:fs';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Download to file
await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', '-o', 'cards-page.html', 'https://dokkaninfo.com/cards'], { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });

const html = readFileSync('cards-page.html', 'utf8');

const m = html.match(/v-bind:cardsjson\s*=\s*(["'])/);
if (m) {
  const quote = m[0].slice(-1);
  const start = m.index + m[0].length;
  const end = html.indexOf(quote, start);
  const jsonStr = html.slice(start, end);

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

  // Find cards with same character_id
  const groups = {};
  cards.filter(c => Number(c.rarity) >= 3 && Number(c.id) > 0 && !String(c.id).startsWith('9')).forEach(c => {
    const key = c.character_id;
    if (!groups[key]) groups[key] = [];
    groups[key].push({id: c.id, name: c.name, rarity: c.rarity, element: c.element, bg_element: c.bg_element, awakening_number: c.awakening_number, optimal_awakening_step: c.optimal_awakening_step, awoken_max: c.awoken_max});
  });

  // Show groups with multiple forms
  let output = '';
  Object.entries(groups).filter(([k,v]) => v.length > 1).slice(0, 10).forEach(([k,v]) => {
    output += 'character_id: ' + k + '\n';
    v.forEach(c => output += '  ' + JSON.stringify(c) + '\n');
    output += '\n';
  });

  writeFileSync('character-id-analysis.txt', output);
  console.log('Analysis saved to character-id-analysis.txt');
}