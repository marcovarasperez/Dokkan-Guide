import { readFileSync, writeFileSync } from 'node:fs';

const content = readFileSync('tools/sync.mjs', 'utf8');

// The current line 77 has: .replace(/"/g, '"')
// This regex pattern is "/" (matches literal quote character)
// Need to change to: .replace(/"/g, '"')
// This regex pattern is "/"" (matches HTML entity ")

const fixed = content.replace(
  '.replace(/"/g, \'"\')',
  '.replace(/"/g, \'"\')'
);

if (fixed === content) {
  console.log('String replace did not work, trying regex...');
  const fixed2 = content.replace(/\.replace\(\/""/g, '"'\)/, '.replace(/"/g, \'"\')');
  if (fixed2 !== content) {
    writeFileSync('tools/sync.mjs', fixed2);
    console.log('Fixed with regex!');
  } else {
    console.log('Regex also failed');
  }
} else {
  writeFileSync('tools/sync.mjs', fixed);
  console.log('Fixed with string replace!');
}

const lines = (fixed === content ? fixed2 : fixed).split('\n');
console.log('New line 77:', JSON.stringify(lines[76]));