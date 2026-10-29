import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, readFileSync } from 'node:fs';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

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

  // Filter valid cards
  const validCards = cards.filter(c => Number(c.rarity ?? 0) >= 3 && Number(c.id ?? 0) > 0 && !String(c.id).startsWith('9'));

  // Check character_id values
  const withCharId = validCards.filter(c => c.character_id !== undefined && c.character_id !== null);
  const withoutCharId = validCards.filter(c => c.character_id === undefined || c.character_id === null);

  console.log('Total valid:', validCards.length);
  console.log('With character_id:', withCharId.length);
  console.log('Without character_id:', withoutCharId.length);

  if (withCharId.length > 0) {
    // Group by character_id
    const groups = {};
    withCharId.forEach(c => {
      const key = c.character_id;
      if (!groups[key]) groups[key] = [];
      groups[key].push({id: c.id, name: c.name, rarity: c.rarity, character_id: c.character_id});
    });

    // Show groups with multiple forms
    console.log('\nGroups with multiple forms:');
    Object.entries(groups).filter(([k,v]) => v.length > 1).slice(0, 20).forEach(([k,v]) => {
      console.log('character_id:', k, '(' + v.length + ' forms)');
      v.forEach(c => console.log('  ID:', c.id, 'Name:', c.name, 'Rarity:', c.rarity));
      console.log('');
    });

    // Check unique character_id count
    console.log('Unique character_id values:', Object.keys(groups).length);
  }

  // Sample records without character_id
  console.log('\nSample records without character_id (first 5):');
  withoutCharId.slice(0, 5).forEach(c => {
    console.log('ID:', c.id, 'Name:', c.name, 'character_id:', c.character_id);
  });
}