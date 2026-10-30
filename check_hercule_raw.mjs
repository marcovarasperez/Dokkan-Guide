import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function main() {
  const { stdout } = await run('curl.exe', ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', 'https://dokkaninfo.com/cards'], { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });

  const m = stdout.match(/v-bind:cardsjson=([\"'])(.*?)\1/);
  if (!m) return;

  let raw = m[2];

  // Build the entity strings explicitly
  const quot = String.fromCharCode(38, 113, 117, 111, 116, 59); // "
  const apos = String.fromCharCode(38, 35, 48, 51, 57, 59); // &#039;
  const lt = String.fromCharCode(38, 108, 116, 59); // <
  const gt = String.fromCharCode(38, 103, 116, 59); // >
  const amp = String.fromCharCode(38, 97, 109, 112, 59); // &
  const nbsp = String.fromCharCode(38, 110, 98, 115, 112, 59); // &nbsp;

  console.log('quot =', JSON.stringify(quot));
  console.log('raw starts with:', JSON.stringify(raw.substring(0, 20)));

  let decoded = raw
    .split(quot).join('"')
    .split(apos).join("'")
    .split(lt).join('<')
    .split(gt).join('>')
    .split(amp).join('&')
    .split(nbsp).join(' ');

  console.log('decoded starts with:', JSON.stringify(decoded.substring(0, 50)));

  try {
    const cards = JSON.parse(decoded);
    console.log('Total cards:', cards.length);
    const hercules = cards.filter(c => (c.name && c.name.includes('Hercule')) || (c.character_name && c.character_name.includes('Hercule')));
    for (const h of hercules) {
      console.log(`ID: ${h.id}, CharID: ${h.character_id}, Name: "${h.name}", CharName: "${h.character_name}", Rarity: ${h.rarity}, Type: ${h.type}, Element: ${h.element}, AwokenMax: ${h.awoken_max}`);
    }
  } catch (e) {
    console.log('Parse error:', e.message);
  }
}

main().catch(e => console.error(e));