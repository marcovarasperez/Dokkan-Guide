const fs = require('fs'), path = require('path');
function walk(d, out = [], skip = ['node_modules', 'dist']) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out, skip);
    else if (/\.(ts|tsx|js|mjs|cjs|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const srcFiles = walk('src').concat(['index.html']);
const allSrc = srcFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const css = fs.readFileSync('src/styles/app.css', 'utf8');

// Class names appearing in CSS selectors
const cssClasses = new Set();
const re = /\.([A-Za-z][A-Za-z0-9_-]*)/g;
let m;
while ((m = re.exec(css))) cssClasses.add(m[1]);

// A class token boundary in source: preceded by non-class-char, followed by non-class-char
// class chars = letters, digits, _, -, (and we must NOT treat - as boundary since classes contain -)
function classTokenPresent(name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // must not be followed by a class-continuing char (letter/digit/_/-)
  const re2 = new RegExp('(?<![A-Za-z0-9_-])' + esc + '(?![A-Za-z0-9_-])');
  return re2.test(allSrc);
}

function dynamicModifierPossible(name) {
  // name = base--mod  → look for template "base--${" or "base--$" in source
  const idx = name.lastIndexOf('--');
  if (idx <= 0) return false;
  const prefix = name.slice(0, idx + 2);
  return allSrc.includes(prefix + '$');
}

const unused = [...cssClasses].filter(c => !classTokenPresent(c) && !dynamicModifierPossible(c));
console.log('CSS classes in selectors: ' + cssClasses.size);
console.log('UNUSED (' + unused.length + '):');
console.log(unused.sort().join('\n'));
