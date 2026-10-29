import { readFileSync, writeFileSync } from 'node:fs';

const content = readFileSync('test-extract.mjs', 'utf8');
const lines = content.split('\n');

// Find the decode function line with the buggy replace
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('.replace(/"/g')) {
    console.log(`Found at line ${i + 1}:`, lines[i]);

    // Replace the regex pattern from /"/g to /"/g
    const regexSlashPos = lines[i].indexOf('/');
    const prefix = lines[i].substring(0, regexSlashPos + 1);
    const suffixStart = lines[i].indexOf('/g', regexSlashPos);
    const suffix = lines[i].substring(suffixStart);

    // Use explicit char codes for " entity
    const htmlEntity = String.fromCharCode(38, 113, 117, 111, 116, 59);
    lines[i] = prefix + htmlEntity + suffix;
    console.log(`Fixed line ${i + 1}:`, lines[i]);
    break;
  }
}

const fixed = lines.join('\n');
writeFileSync('test-extract.mjs', fixed);
console.log('Fixed test-extract.mjs');