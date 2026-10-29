import { readFileSync, writeFileSync } from 'node:fs';

const content = readFileSync('tools/sync.mjs', 'utf8');

// The current line 77: .replace(/"/g, '"')
// We need: .replace(/"/g, '"')

// In the actual file, the text is: .replace(/"/g, '"')
// Where the regex pattern is /"/g (matches literal ")
// Need to change to /"/g (matches the HTML entity ")

const oldLine = '.replace(/"/g, \'"\')';
const newLine = '.replace(/"/g, \'"\')';

const fixed = content.replace(oldLine, newLine);

if (fixed === content) {
  console.log('No change with string replace, trying regex');
  // Try regex replace
  const fixed2 = content.replace(/\.replace\(\/""/g, '"'\)/, '.replace(/"/g, \'"\')');
  console.log('Fixed2 same:', fixed2 === content);
  if (fixed2 !== content) {
    writeFileSync('tools/sync.mjs', fixed2);
    console.log('Fixed with regex!');
  }
} else {
  writeFileSync('tools/sync.mjs', fixed);
  console.log('Fixed with string replace!');
}

// Show the new line 77
const lines = fixed.split('\n');
console.log('New line 77:', lines[76]);