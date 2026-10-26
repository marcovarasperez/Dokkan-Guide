/**
 * Extrae el motor LWF (renderizador de animaciones de cartas de Dokkan) del
 * bundle de dokkaninfo.com a `app/public/vendor/lwf.js`.
 *
 * dokkaninfo anima la carta con un <canvas> + el motor LWF (formato .lwf de
 * los propios assets del juego). El motor viene embebido en su app.js, así
 * que este script:
 *   1. pide una ficha (curl.exe, porque el TLS de Node recibe 403),
 *   2. localiza el <script type=module> (build/assets/app.<hash>.js),
 *   3. descarga el bundle y aísla el IIFE del motor con un escáner léxico
 *      (cadenas, plantillas, comentarios y regex incluidos),
 *   4. escribe app/public/vendor/lwf.js si `node --check` lo valida.
 *
 * Uso:  node tools/lwf_extract.mjs [--force]
 *       (sin --force no sobrescribe si el fichero ya existe)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'app/public/vendor/lwf.js');
const CARD_URL = 'https://dokkaninfo.com/cards/1034761';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const curl = (url, out) =>
  execFileSync('curl.exe', ['-s', '-A', UA, '-H', 'accept-language: en-US,en;q=0.9', url, '-o', out, '--max-time', '120'], {
    encoding: 'utf8',
  });

if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.log(`Ya existe ${OUT} (${statSync(OUT).size} bytes). Usa --force para regenerar.`);
  process.exit(0);
}

// ── 1. URL del bundle ────────────────────────────────────────────────
const tmp = tmpdir();
const page = resolve(tmp, 'lwf_page.html');
curl(CARD_URL, page);
const html = readFileSync(page, 'utf8');
const bundlePath = (html.match(/(?:https:\/\/dokkaninfo\.com)?\/build\/assets\/app\.[0-9a-f]+\.js/) ?? [])[0];
if (!bundlePath) {
  console.error('No se encontró la URL del bundle en la página de la ficha.');
  process.exit(1);
}
const bundleUrl = bundlePath.startsWith('http') ? bundlePath : `https://dokkaninfo.com${bundlePath}`;
console.log('Bundle:', bundleUrl);

const jsPath = resolve(tmp, 'lwf_bundle.js');
curl(bundleUrl, jsPath);
const js = readFileSync(jsPath, 'utf8');
console.log('Bundle descargado:', js.length, 'chars');

// ── 2. Aísla el IIFE del motor ───────────────────────────────────────
const MARKER = 'var e="lwf.js"';
const m = js.indexOf(MARKER);
if (m < 0) {
  console.error('No se encontró el marcador del motor LWF.');
  process.exit(1);
}
// El IIFE va precedido de la asignación `global = window` (necesaria: dentro
// del motor se usa `global.LWF`).
const head = js.lastIndexOf('typeof global>"u"&&typeof window<"u"?global=window', m);
if (head < 0) {
  console.error('No se encontró la cabecera (global = window).');
  process.exit(1);
}
const open = js.lastIndexOf('(function(){var e="lwf.js"', m + MARKER.length);
if (open < 0 || open < head) {
  console.error('No se encontró el inicio del IIFE.');
  process.exit(1);
}

const end = matchParens(js, open);
if (end < 0) {
  console.error('No se pudo acotar el IIFE (paréntesis desbalanceados).');
  process.exit(1);
}
// Incluye la cola de la expresión: `(function(){…}).call(globalThis);`
let stop = end + 1;
{
  let k = stop;
  while (k < js.length) {
    const c = js[k];
    if (c === ';') {
      k++;
      break;
    }
    if (c === '.' || /[A-Za-z0-9_$]/.test(c) || /\s/.test(c)) {
      k++;
      continue;
    }
    if (c === '(') {
      const cp = matchParens(js, k);
      if (cp < 0) break;
      k = cp + 1;
      continue;
    }
    break;
  }
  stop = k;
}
while (stop < js.length && /[;\s]/.test(js[stop])) stop++;

const engine = js.slice(head, stop);
console.log(`Motor LWF aislado: ${engine.length} chars (${(engine.length / 1024).toFixed(0)} KB)`);
console.log('contexto final:', JSON.stringify(js.slice(Math.max(head, stop - 120), stop + 60)));

// ── 3. Validación sintáctica ─────────────────────────────────────────
const check = resolve(tmp, 'lwf_check.js');
writeFileSync(check, engine, 'utf8');
try {
  execFileSync(process.execPath, ['--check', check], { encoding: 'utf8', stdio: 'pipe' });
} catch (e) {
  console.error('El motor extraído no pasa `node --check`:\n' + (e.stderr || e.message));
  process.exit(1);
}

// ── 4. Escritura ─────────────────────────────────────────────────────
const header = `/**
 * Motor LWF (Lightweight SWF) — renderizador de animaciones de cartas.
 * Extraído de https://dokkaninfo.com (build/assets/app.<hash>.js) con
 * tools/lwf_extract.mjs para reproducir la animación de la carta en el
 * <canvas> de la ficha. Expone \`window.LWF\`.
 * LWF es software de código abierto (https://github.com/gree/lwf).
 */
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, header + engine, 'utf8');
console.log('OK →', OUT, statSync(OUT).size, 'bytes');
rmSync(check, { force: true });

/* ── helpers ─────────────────────────────────────────────────────── */

/** Escáner léxico: devuelve el índice del ')' que cierra el '(' de `open`. */
function matchParens(src, open) {
  let depth = 0;
  let i = open;
  const prevMeaningful = (idx) => {
    for (let k = idx - 1; k >= 0; k--) {
      const c = src[k];
      if (!/\s/.test(c)) return c;
    }
    return '';
  };

  while (i < src.length) {
    const c = src[i];
    // comentarios
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      if (close < 0) return -1;
      i = close + 2;
      continue;
    }
    // cadenas
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') i += 2;
        else if (src[i] === q) { i++; break; }
        else if (src[i] === '\n') return -1; // cadena sin cerrar
        else i++;
      }
      continue;
    }
    // plantillas literales
    if (c === '`') {
      i++;
      while (i < src.length) {
        if (src[i] === '\\') i += 2;
        else if (src[i] === '`') { i++; break; }
        else if (src[i] === '$' && src[i + 1] === '{') {
          // subexpresión: se salta hasta la llave equivalente
          let j = i + 2;
          let d = 1;
          while (j < src.length && d > 0) {
            const ch = src[j];
            if (ch === '{') d++;
            else if (ch === '}') d--;
            else if (ch === '"' || ch === "'" || ch === '`') {
              const q2 = ch;
              j++;
              while (j < src.length) {
                if (src[j] === '\\') j += 2;
                else if (src[j] === q2) break;
                else j++;
              }
            }
            j++;
          }
          i = j;
          continue;
        }
        i++;
      }
      continue;
    }
    // literales regex
    if (c === '/') {
      const p = prevMeaningful(i);
      if (p === '' || '(,=:[!&|?{};+-*%~^<>'.includes(p) || /\b(return|typeof|case|in|of|new|delete|void|do|else|yield|await)$/.test(src.slice(Math.max(0, i - 8), i))) {
        i++;
        let inClass = false;
        while (i < src.length) {
          const ch = src[i];
          if (ch === '\\') i += 2;
          else if (ch === '[') { inClass = true; i++; }
          else if (ch === ']') { inClass = false; i++; }
          else if (ch === '/' && !inClass) { i++; break; }
          else if (ch === '\n') return -1;
          else i++;
        }
        while (i < src.length && /[a-z]/.test(src[i])) i++;
        continue;
      }
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}
