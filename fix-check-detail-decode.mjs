import { readFileSync, writeFileSync } from 'node:fs';

const content = readFileSync('check-elements-detail.mjs', 'utf8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('.replace(/"/g')) {
    console.log(`Found at line ${i + 1}:`, lines[i]);

    const regexSlashPos = lines[i].indexOf('/');
    const prefix = lines[i].substring(0, regexSlashPos + 1);
    const suffixStart = lines[i].indexOf('/g', regexSlashPos);
    const suffix = lines[i].substring(suffixStart);

    const htmlEntity = String.fromCharCode(38, 113, 117, 111, 116, 59);
    lines[i] = prefix + htmlEntity + suffix;
    console.log(`Fixed line ${i + 1}:`, lines[i]);
    break;
  }
}

const fixed = lines.join('\n');
writeFileSync('check-elements-detail.mjs', fixed);
console.log('Fixed check-elements-detail.mjs');