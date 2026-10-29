import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function fetch() {
  const { stdout } = await run('curl.exe', ['-s', '-A', UA, 'https://dokkaninfo.com/cards'], { maxBuffer: 64*1024*1024, encoding: 'utf8' });
  const m = stdout.match(/v-bind:cardsjson\s*=\s*(['"])(.*?)\1/);
  if (m) {
    const data = JSON.parse(m[2].replace(/"/g, '"').replace(/&#039;/g, "'"));
    console.log('Total records:', data.length);
    // Find a few real characters
    const chars = data.filter(r => r.rarity >= 3 && r.id > 0 && !String(r.id).startsWith('9')).slice(0,10);
    chars.forEach(c => console.log('ID:', c.id, 'Name:', c.name, 'element:', c.element, 'bg_element:', c.bg_element, 'raw_attributes:', c.raw_attributes));
  }
}
fetch();