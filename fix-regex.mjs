import { readFileSync, writeFileSync } from 'node:fs';

const content = readFileSync('tools/sync.mjs', 'utf8');
const lines = content.split('\n');

console.log('Line 77 before:', lines[76]);
console.log('Line 77 char codes:', [...lines[76]].map((c, i) => `${i}:${c.charCodeAt(0)}`));

const line = lines[76];
const regexSlashPos = line.indexOf('/');
const suffixStart = line.indexOf('/g', regexSlashPos);
const prefix = line.substring(0, regexSlashPos + 1);
const suffix = line.substring(suffixStart);

// Use explicit character codes for " entity: & q u o t ; = 38, 113, 117, 111, 116, 59
const htmlEntity = String.fromCharCode(38, 113, 117, 111, 116, 59);
console.log('htmlEntity:', htmlEntity, 'codes:', [...htmlEntity].map(c => c.charCodeAt(0)));

const newLine = prefix + htmlEntity + suffix;
lines[76] = newLine;

console.log('Line 77 after:', newLine);
console.log('New line char codes:', [...newLine].map((c, i) => `${i}:${c.charCodeAt(0)}`));

const fixed = lines.join('\n');
writeFileSync('tools/sync.mjs', fixed);
console.log('Fixed!');