import { fetchInfoText } from './http';
import { dbGet, dbSet, STORE_EVENTS } from './localDb';
import { decodeEntities } from './html';
import { INFO_ASSET, INFO_CDN } from './constants';

/**
 * MODELO · Páginas "de catálogo" de dokkaninfo.com (Items, Panel Missions,
 * Schedule, Tips, Awakening Medals… y cualquier enlace interno).
 *
 * dokkaninfo pinta estas secciones en el servidor dentro de
 * `div.container-1220`; aquí se descarga la página, se recorta ese bloque, se
 * sanea (solo etiquetas de formato, imágenes y enlaces; sin scripts, estilos
 * ni anuncios) y se reescriben:
 *   - imágenes `/assets/…` → URL absoluta del CDN (la vista las pide por el
 *     transporte nativo, porque ORB bloquea el <img> directo);
 *   - enlaces internos → rutas de la app (#/characters/{id}, #/eventos?ev=…,
 *     #/banners/{id}, #/noticias/{id}…) o al visor genérico #/dk/{ruta}.
 *
 * Las secciones que dokkaninfo pinta en el cliente (Vue + JSON embebido en
 * `v-bind:*`) tienen su parser propio: Tips, Awakening Medals y Schedule.
 *
 * Caché: base de datos local (store `events`, clave `page:{ruta}`), 6 h.
 */

/** Categorías del menú Items de dokkaninfo (mismo orden y URL). */
export const ITEM_PAGES = [
  { slug: 'act-items', label: 'Act Items', path: 'items/actitems' },
  { slug: 'medallas-despertar', label: 'Awakening Medals', path: 'items/awakeningitems' },
  { slug: 'equipamiento', label: 'Equipment', path: 'items/equipment' },
  { slug: 'llaves', label: 'Keys', path: 'items/keys' },
  { slug: 'objetos-potencial', label: 'Potential Items', path: 'items/potentialitems' },
  { slug: 'objetos-especiales', label: 'Special Items', path: 'items/specialitems' },
  { slug: 'stickers', label: 'Stickers', path: 'items/stickers' },
  { slug: 'objetos-apoyo', label: 'Support Items', path: 'items/supportitems' },
  { slug: 'memorias-apoyo', label: 'Support Memories', path: 'items/supportmemories' },
  { slug: 'tips', label: 'Tips', path: 'items/tips' },
  { slug: 'campos-entrenamiento', label: 'Training Fields', path: 'items/trainingfields' },
  { slug: 'objetos-entrenamiento', label: 'Training Items', path: 'items/trainingitems' },
  { slug: 'objetos-tesoro', label: 'Treasure Items', path: 'items/treasureitems' },
  { slug: 'wallpapers', label: 'Wallpapers', path: 'items/wallpapers' },
] as const;

/** Bloque de contenido normalizado que pinta la vista. */
export type DkBlock =
  | { kind: 'html'; html: string }
  | { kind: 'tiles'; tiles: DkTile[] }
  | { kind: 'cards'; cards: { id: number; name: string; thumbnailId: number; date: number | null }[] };

/** Ficha simple (tip, medalla…): imagen + título + texto. */
export interface DkTile {
  title: string;
  text: string;
  image: string | null;
  group?: string;
}

export interface DkPageData {
  title: string;
  blocks: DkBlock[];
}

const TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_VERSION = 2;

/* ---------- Saneado y reescritura ---------- */

/** Etiquetas permitidas (el resto se desenvuelve: se queda su contenido). */
const ALLOWED = new Set([
  'div', 'span', 'p', 'b', 'strong', 'i', 'em', 'u', 'br', 'hr', 'img', 'a',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'small', 'center',
]);
/** Etiquetas que se eliminan con todo su contenido. */
const DROP = new Set(['script', 'style', 'iframe', 'noscript', 'form', 'input', 'button', 'select', 'svg', 'ins', 'video', 'audio', 'object', 'embed']);
/** Clases de maquetación de dokkaninfo que se conservan (la app las estiliza en app.css, prefijo .dk-page). */
const KEEP_CLASS = /^(row|col(-[a-z]{2})?(-\d+)?|card-icon(-item)?|img-fluid|bg-(main|second|third|container)|font-size-[\w]+|border(-\d)?|text-center|align-items-center|justify-content-center|margin-\d+|padding-[\w-]+)$/;

/** Ruta de dokkaninfo → ruta de la app. */
export function rewriteInfoHref(href: string): string | null {
  let p = href.trim();
  if (!p || p.startsWith('#') || /^javascript:/i.test(p)) return null;
  p = p.replace(/^https?:\/\/(www\.)?dokkaninfo\.com/i, '');
  if (/^https?:\/\//i.test(p)) return p; // enlace externo: se abre fuera
  if (!p.startsWith('/')) p = `/${p}`;
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/cards\/(\d+)/))) return `#/characters/${m[1]}`;
  if ((m = p.match(/^\/events\/([a-z]+)\/(\d+)(?:$|[/?])/))) return `#/eventos?ev=${m[1]}/${m[2]}`;
  if ((m = p.match(/^\/events\/([a-z]+)\/?$/))) return `#/eventos/${m[1]}`;
  if ((m = p.match(/^\/banners\/(\d+)/))) return `#/banners/${m[1]}`;
  if ((m = p.match(/^\/news\/(\d+)/))) return `#/noticias/${m[1]}`;
  if ((m = p.match(/^\/categories\/(\d+)/))) return `#/cartas/categorias/${m[1]}`;
  if (p === '/missions') return '#/misiones';
  if (p === '/panels') return '#/misiones/panel';
  const item = ITEM_PAGES.find((i) => `/${i.path}` === p);
  if (item) return `#/items/${item.slug}`;
  return `#/dk/${encodeURIComponent(p.slice(1))}`;
}

/** URL absoluta de un asset de dokkaninfo (o null si no es suyo). */
function absAsset(src: string): string | null {
  const s = src.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return /dokkaninfo\.com/i.test(s) ? s : null;
  if (s.startsWith('/')) return `${INFO_CDN}${s}`;
  return null;
}

function sanitizeNode(node: Element, doc: Document): void {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (DROP.has(tag) || /\bad(s|-|_)|venatus|ramp|banner-ad/i.test(child.className || '') || child.id?.startsWith('pw-')) {
      child.remove();
      continue;
    }
    sanitizeNode(child, doc);
    if (!ALLOWED.has(tag)) {
      // Componente/etiqueta desconocida: se conserva solo su contenido.
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }
    // Atributos: solo los necesarios.
    const keepClass = (child.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((c) => KEEP_CLASS.test(c))
      .join(' ');
    const href = tag === 'a' ? child.getAttribute('href') : null;
    const src = tag === 'img' ? (child.getAttribute('src') ?? child.getAttribute('data-src')) : null;
    const alt = tag === 'img' ? (child.getAttribute('alt') ?? '') : null;
    for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
    if (keepClass) child.setAttribute('class', keepClass);
    if (tag === 'a') {
      const to = href ? rewriteInfoHref(href) : null;
      if (to) child.setAttribute('href', to);
      if (to && /^https?:/.test(to)) {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener');
      }
    }
    if (tag === 'img') {
      const abs = src ? absAsset(src) : null;
      if (!abs) {
        child.remove();
        continue;
      }
      child.setAttribute('src', abs);
      child.setAttribute('data-dinfo', '1');
      child.setAttribute('alt', alt ?? '');
      child.setAttribute('loading', 'lazy');
    }
  }
}

/** Recorta y sanea el contenido principal (`div.container-1220`) de una página. */
export function extractMainHtml(html: string): string | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = Array.from(doc.querySelectorAll('div.container-1220'));
  if (!blocks.length) return null;
  const wrap = doc.createElement('div');
  for (const b of blocks) wrap.appendChild(b.cloneNode(true));
  sanitizeNode(wrap, doc);
  const out = wrap.innerHTML.replace(/<div>\s*<\/div>/g, '').trim();
  return out && (wrap.textContent ?? '').trim().length + wrap.querySelectorAll('img').length > 0 ? out : null;
}

/** Título de la página (`<title>X | Dokkan Info!</title>`). */
function pageTitle(html: string, fallback: string): string {
  const m = html.match(/<title>([^<|]+)/);
  return m ? decodeEntities(m[1]).trim() : fallback;
}

/** `v-bind:NAME="{json}"` embebido (JSON con entidades HTML). */
function vbind<T>(html: string, name: string): T | null {
  const m = new RegExp(`v-bind:${name}\\s*=\\s*"([^"]*)"`).exec(html);
  if (!m) return null;
  try {
    return JSON.parse(decodeEntities(m[1])) as T;
  } catch {
    return null;
  }
}

/* ---------- Secciones pintadas en cliente (JSON embebido) ---------- */

function parseTips(html: string): DkBlock | null {
  const rows = vbind<{ title?: string; description?: string; image?: string }[]>(html, 'tipsjson');
  if (!Array.isArray(rows)) return null;
  return {
    kind: 'tiles',
    tiles: rows.map((r) => ({
      title: r.title ?? '',
      text: r.description ?? '',
      image: r.image ? absAsset(r.image.replace(/\/\/+/g, '/')) : null,
    })),
  };
}

const MEDAL_RARITY = ['N', 'R', 'SR', 'SSR', 'UR', 'LR'];

function parseAwakening(html: string): DkBlock | null {
  const groups = vbind<{ rarity: number; awakeningItem?: { id: number; name: string; description?: string }[] }[]>(
    html,
    'awakening_items_rarities',
  );
  if (!Array.isArray(groups)) return null;
  const tiles: DkTile[] = [];
  for (const g of groups) {
    for (const it of g.awakeningItem ?? []) {
      tiles.push({
        title: it.name,
        text: it.description ?? '',
        // Misma ruta que construye dokkaninfo (verificada con 200).
        image: `${INFO_ASSET}/item/awaken/en/thumb/thumb_awaken_items_${String(it.id).padStart(5, '0')}/thumb_awaken_items_${String(it.id).padStart(5, '0')}.png`,
        group: MEDAL_RARITY[g.rarity] ?? `Rareza ${g.rarity}`,
      });
    }
  }
  return { kind: 'tiles', tiles };
}

function parseSchedule(html: string): DkBlock | null {
  const rows = vbind<{ id: number; name: string; icon_id?: number; open_at?: number }[]>(html, 'cards');
  if (!Array.isArray(rows)) return null;
  return {
    kind: 'cards',
    cards: rows.map((r) => ({ id: r.id, name: r.name, thumbnailId: r.icon_id ?? r.id, date: r.open_at ?? null })),
  };
}

/** Todas las cartas embebidas como `v-bind:card="{json}"` (sin duplicados). */
function embeddedCards(html: string): { id: number; name: string; thumbnailId: number; date: number | null }[] {
  const out = new Map<number, { id: number; name: string; thumbnailId: number; date: number | null }>();
  for (const m of html.matchAll(/v-bind:card="([^"]*)"/g)) {
    try {
      const c = JSON.parse(decodeEntities(m[1])) as { id?: number; name?: string; icon_id?: number | null };
      if (typeof c.id === 'number' && !out.has(c.id)) {
        out.set(c.id, { id: c.id, name: c.name ?? '', thumbnailId: c.icon_id ?? c.id, date: null });
      }
    } catch {
      /* fila no parseable: se ignora */
    }
  }
  return Array.from(out.values());
}

/** Parsea una página descargada a bloques pintables. */
export function parseDkPage(path: string, html: string): DkPageData {
  const title = pageTitle(html, path);
  const special =
    path === 'items/tips' ? parseTips(html) : path === 'items/awakeningitems' ? parseAwakening(html) : path === 'schedule' ? parseSchedule(html) : null;
  const blocks: DkBlock[] = [];
  if (special) blocks.push(special);
  else {
    const main = extractMainHtml(html);
    if (main) blocks.push({ kind: 'html', html: main });
    // Componentes Vue `<card-icon v-bind:card="{…}">` (personajes de la página,
    // p. ej. en /links/{id} o /items/equipment): el HTML saneado los pierde,
    // así que se recogen del JSON y se pintan como miniaturas enlazadas.
    const cards = embeddedCards(html);
    if (cards.length) blocks.push({ kind: 'cards', cards });
  }
  return { title, blocks };
}

/* ---------- Carga con caché ---------- */

/** Descarga (o lee de la caché local) una página de dokkaninfo ya parseada. */
export async function loadDkPage(path: string, opts: { force?: boolean } = {}): Promise<DkPageData> {
  const key = `page:v${CACHE_VERSION}:${path}`;
  const cached = await dbGet<{ ts: number; data: DkPageData }>(STORE_EVENTS, key);
  if (cached && !opts.force && Date.now() - cached.ts < TTL_MS) return cached.data;
  try {
    const data = parseDkPage(path, await fetchInfoText(`/${path}`));
    void dbSet(STORE_EVENTS, key, { ts: Date.now(), data });
    return data;
  } catch (e) {
    if (cached) return cached.data; // sin conexión: se muestra lo guardado
    throw e;
  }
}
