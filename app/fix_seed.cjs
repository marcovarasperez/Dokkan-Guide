const fs = require('fs');
const https = require('https');

const units = JSON.parse(fs.readFileSync('public/data/units.index.json', 'utf8'));
const meta = JSON.parse(fs.readFileSync('public/data/meta.json', 'utf8'));

console.log('1/3 Recalculando latest/latestType para', units.length, 'unidades...');
for (const u of units) {
  const cands = [];
  if (u.releaseDates.initial) cands.push(['initial', u.releaseDates.initial]);
  if (u.releaseDates.eza) cands.push(['eza', u.releaseDates.eza]);
  if (u.releaseDates.seza) cands.push(['seza', u.releaseDates.seza]);
  if (cands.length) {
    const latest = cands.reduce((a,b) => a[1] >= b[1] ? a : b);
    u.releaseDates.latest = latest[1];
    u.releaseDates.latestType = latest[0];
  } else {
    u.releaseDates.latest = null;
    u.releaseDates.latestType = null;
  }
  u.characterId = null;
  u.isExchangeForm = false;
}

// Entidades HTML
const ENTITIES = {
  'quot': '"', 'amp': '&', 'lt': '<', 'gt': '>', 'nbsp': ' ',
  'iexcl': '¡', 'cent': '¢', 'pound': '£', 'curren': '¤', 'yen': '¥',
  'brvbar': '¦', 'sect': '§', 'uml': '¨', 'copy': '©', 'ordf': 'ª',
  'laquo': '«', 'not': '¬', 'shy': '', 'reg': '®', 'macr': '¯',
  'deg': '°', 'plusmn': '±', 'sup2': '²', 'sup3': '³', 'acute': '´',
  'micro': 'µ', 'para': '¶', 'middot': '·', 'cedil': '¸', 'sup1': '¹',
  'ordm': 'º', 'raquo': '»', 'frac14': '¼', 'frac12': '½', 'frac34': '¾',
  'iquest': '¿', 'Agrave': 'À', 'Aacute': 'Á', 'Acirc': 'Â', 'Atilde': 'Ã',
  'Auml': 'Ä', 'Aring': 'Å', 'AElig': 'Æ', 'Ccedil': 'Ç', 'Egrave': 'È',
  'Eacute': 'É', 'Ecirc': 'Ê', 'Euml': 'Ë', 'Igrave': 'Ì', 'Iacute': 'Í',
  'Icirc': 'Î', 'Iuml': 'Ï', 'ETH': 'Ð', 'Ntilde': 'Ñ', 'Ograve': 'Ò',
  'Oacute': 'Ó', 'Ocirc': 'Ô', 'Otilde': 'Õ', 'Ouml': 'Ö', 'times': '×',
  'Oslash': 'Ø', 'Ugrave': 'Ù', 'Uacute': 'Ú', 'Ucirc': 'Û', 'Uuml': 'Ü',
  'Yacute': 'Ý', 'THORN': 'Þ', 'szlig': 'ß', 'agrave': 'à', 'aacute': 'á',
  'acirc': 'â', 'atilde': 'ã', 'auml': 'ä', 'aring': 'å', 'aelig': 'æ',
  'ccedil': 'ç', 'egrave': 'è', 'eacute': 'é', 'ecirc': 'ê', 'euml': 'ë',
  'igrave': 'ì', 'iacute': 'í', 'icirc': 'î', 'iuml': 'ï', 'eth': 'ð',
  'ntilde': 'ñ', 'ograve': 'ò', 'oacute': 'ó', 'ocirc': 'ô', 'otilde': 'õ',
  'ouml': 'ö', 'divide': '÷', 'oslash': 'ø', 'ugrave': 'ù', 'uacute': 'ú',
  'ucirc': 'û', 'uuml': 'ü', 'yacute': 'ý', 'thorn': 'þ', 'yuml': 'ÿ',
};

function decodeEntities(s) {
  return s.replace(/&[#\w]+;/g, (m) => {
    if (m.startsWith('&#x')) return String.fromCharCode(parseInt(m.slice(3, -1), 16));
    if (m.startsWith('&#')) return String.fromCharCode(parseInt(m.slice(2, -1), 10));
    const entity = m.slice(1, -1);
    return ENTITIES[entity] ?? m;
  });
}

function extractVBind(html, name) {
  const re = new RegExp(`v-bind:${name}\\s*=\\s*["']`);
  const m = re.exec(html);
  if (!m) return null;
  const quote = html[m.index + m[0].length - 1];
  const start = m.index + m[0].length;
  const end = html.indexOf(quote, start);
  if (end < 0) return null;
  try {
    return JSON.parse(decodeEntities(html.slice(start, end)));
  } catch { return null; }
}

const INFO = 'https://dokkaninfo.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const DELAY = 120;

function fetchPage(id) {
  return new Promise((resolve) => {
    const req = https.get(INFO + '/cards/' + id, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Normaliza nombre base: quita sufijos de tipo [AGL], [TEQ], etc. Y sufijos de forma (1st Form, Final Form, etc.)
function baseName(name) {
  return name
    .replace(/\s*\[(AGL|TEQ|INT|STR|PHY)\]\s*$/i, '')
    .replace(/\s*\((1st|2nd|3rd|4th|5th|Final|Perfect|Full Power|Base|Awakened|Transformed|Giant Ape|Angel|Xeno|Clone|Fused|Supervillain|Power Awakening|Ultimate|Teen|Youth|Kid|Future|GT|EZA|SEZA|LR|UR|SSR|SR|R|N)\s*(Form|Forma)?\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Orden de rareza
const rarityOrder = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5 };

async function main() {
  console.log('2/3 Fetching character_id para detectar awakening/exchange...');
  const charMap = new Map(); // characterId -> { baseName -> [units] }
  let done = 0;
  let total = units.length;

  for (const u of units) {
    const html = await fetchPage(u.id);
    if (html) {
      const data = extractVBind(html, 'datajson');
      if (data && data.card && data.card.character_id != null) {
        const cid = data.card.character_id;
        u.characterId = cid;
        if (!charMap.has(cid)) charMap.set(cid, new Map());
        const nameGroups = charMap.get(cid);
        const bn = baseName(u.name);
        if (!nameGroups.has(bn)) nameGroups.set(bn, []);
        nameGroups.get(bn).push(u);
      }
    }
    done++;
    if (done % 50 === 0) console.log('  ', done, '/', total);
    await new Promise(r => setTimeout(r, DELAY));
  }

  console.log('3/3 Procesando grupos y marcando exchange/transform...');
  let exchangeCount = 0;
  let awakeningFiltered = 0;

  for (const [cid, nameGroups] of charMap) {
    for (const [bn, list] of nameGroups) {
      if (list.length <= 1) continue; // solo una variante, nada que hacer

      // Agrupar por rareza
      const byRarity = new Map();
      for (const u of list) {
        const r = u.rarity;
        if (!byRarity.has(r)) byRarity.set(r, []);
        byRarity.get(r).push(u);
      }

      const rarities = Array.from(byRarity.keys()).sort((a,b) => rarityOrder[b] - rarityOrder[a]);
      const maxRarity = rarities[0];
      const maxRarityList = byRarity.get(maxRarity);

      if (rarities.length > 1) {
        // Hay progresión de rareza (awakening): UR → LR, etc.
        // Mantener SOLO la máxima rareza (forma final)
        for (const r of rarities.slice(1)) {
          for (const u of byRarity.get(r)) {
            u.isExchangeForm = true;
            awakeningFiltered++;
          }
        }
        // En la rareza máxima, si hay varias con MISMO nombre base -> son variantes de tipo, mantener todas
        // Si hay nombres DISTINTOS en la rareza máxima -> posible exchange, mantener la más antigua
        if (maxRarityList.length > 1) {
          // Verificar si tienen nombres base distintos (ya los agrupamos por baseName, así que aquí ya son mismo baseName)
          // Las variantes de tipo tienen mismo baseName, diferentes element
          // Si element es diferente, son variantes de tipo -> mantener todas
          const elements = new Set(maxRarityList.map(u => u.type));
          if (elements.size > 1) {
            // Variantes de tipo: mantener todas, no hacer nada
          } else {
            // Mismo element y misma rareza máxima -> duplicados reales o exchange
            // Ordenar por open_at y mantener la más antigua
            maxRarityList.sort((a,b) => (a.releaseDates.initial||0) - (b.releaseDates.initial||0));
            for (let i = 1; i < maxRarityList.length; i++) {
              maxRarityList[i].isExchangeForm = true;
              exchangeCount++;
            }
          }
        }
      } else {
        // Una sola rareza en este grupo de nombre base
        // Si hay múltiples, son variantes de tipo (diferente element) -> mantener todas
        const elements = new Set(list.map(u => u.type));
        if (elements.size === 1) {
          // Mismo element, misma rareza, mismo nombre base -> duplicados, mantener la más antigua
          list.sort((a,b) => (a.releaseDates.initial||0) - (b.releaseDates.initial||0));
          for (let i = 1; i < list.length; i++) {
            list[i].isExchangeForm = true;
            exchangeCount++;
          }
        }
      }
    }
  }

  // Limpiar meta
  for (const u of units) {
    if (u.isExchangeForm) delete meta.hashes[String(u.id)];
  }

  fs.writeFileSync('public/data/units.index.json', JSON.stringify(units));
  fs.writeFileSync('public/data/meta.json', JSON.stringify(meta));

  const totalFiltered = units.filter(u => u.isExchangeForm).length;
  const finalCount = units.filter(u => !u.isExchangeForm).length;
  console.log('Listo. Unidades totales:', units.length);
  console.log('Awakening pre-forms filtradas:', awakeningFiltered);
  console.log('Exchange/dup filtrados:', exchangeCount);
  console.log('Total ocultadas:', totalFiltered);
  console.log('Formas finales en listado:', finalCount);
}

main().catch(console.error);