import { useEffect, useRef, useState } from 'preact/hooks';
import { newsState, fetchNewsBody } from '../data/news';
import { formatDate } from '../data/format';
import { fetchInfoImage } from '../data/http';

/**
 * Lector de noticias dentro de la app: renderiza el cuerpo que trae
 * dokkaninfo.com (/news/{id}, SSR) con un saneado que solo permite formato
 * básico, imágenes (cargadas vía transporte nativo porque ORB bloquea los
 * <img> directos a dokkaninfo) y enlaces a eventos de la propia app
 * (/events/{type}/{id} → #/eventos?ev={type}/{id}).
 * Las noticias del seed empaquetado conservan su HTML legado (CDN de fyi).
 */

const ALLOWED_TAGS = new Set([
  'DIV', 'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN',
  'IMG', 'A', 'UL', 'OL', 'LI', 'TABLE', 'TBODY', 'TR', 'TD', 'TH',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SMALL', 'SUB', 'SUP', 'CENTER', 'FONT',
]);

const DK_ORIGIN = 'https://dokkaninfo.com';

/** Fecha legible del componente Vue `unix-to-date` (su texto lo pinta la app). */
function timestampToText(el: Element): string {
  const raw =
    el.getAttribute('v-bind:timestamp') ?? el.getAttribute('timestamp') ?? '';
  const t = Number(raw.replace(/[^\d]/g, ''));
  return t > 0 ? formatDate(new Date(t * 1000).toISOString()) : '';
}

/** Sanea el HTML del artículo: sin scripts/handlers, solo formato + imágenes. */
function sanitize(raw: string): string {
  if (!raw) return '';
  const parsed = new DOMParser().parseFromString(raw, 'text/html');

  // Los componentes Vue vacíos (fechas) se convierten en su texto legible.
  for (const el of Array.from(parsed.body.querySelectorAll('unix-to-date'))) {
    const text = timestampToText(el);
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(parsed.createTextNode(text || ' '), el);
    }
  }

  const clean = (el: Element): void => {
    for (const child of Array.from(el.children)) clean(child);
    if (!ALLOWED_TAGS.has(el.tagName)) {
      // Elemento no permitido: se "desenvuelve" conservando su contenido.
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
      return;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const keep =
        name === 'style' ||
        name === 'color' ||
        name === 'size' ||
        name === 'alt' ||
        (el.tagName === 'IMG' && name === 'src') ||
        (el.tagName === 'A' && name === 'href');
      if (!keep || name.startsWith('on')) el.removeAttribute(attr.name);
    }
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') ?? '';
      const ok =
        /^https:\/\/[a-z0-9.-]*dokkan\.fyi\//i.test(src) || // seed legado
        src.startsWith('/assets/') || // ruta relativa de dokkaninfo
        src.startsWith(`${DK_ORIGIN}/`);
      if (!ok) {
        el.removeAttribute('src');
      } else if (!/^https?:/i.test(src)) {
        // Ruta relativa → absoluta + marca para recargar bytes vía ORB.
        el.setAttribute('src', `${DK_ORIGIN}${src}`);
        el.setAttribute('data-dinfo', '1');
      }
    }
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? '';
      // Enlaces a eventos de dokkaninfo → deep-link en-app.
      const ev = href.match(/^(?:https?:\/\/dokkaninfo\.com)?\/events\/([a-z]+)\/(\d+)/i);
      if (ev) el.setAttribute('href', `#/eventos?ev=${ev[1]}/${ev[2]}`);
      else if (href.startsWith('#/')) el.setAttribute('href', href);
      else {
        // Sin navegación fuera de la app: el ancla se desenvuelve.
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        }
      }
    }
  };
  Array.from(parsed.body.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) clean(node as Element);
  });
  return parsed.body.innerHTML;
}

/** Noticia completa dentro de la app: #/noticias/{id}. */
export default function NewsDetail({ id }: { id: number }) {
  const item = newsState.value.cache?.news.find((n) => n.id === id);
  const [dkBody, setDkBody] = useState<string | null>(item?.source === 'dk' ? item.bodyHtml : null);
  const [loadingBody, setLoadingBody] = useState(item?.source === 'dk' && item.bodyHtml === null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Cuerpo del artículo de dokkaninfo (perezoso + cacheado en localStorage).
  useEffect(() => {
    if (!item || item.source !== 'dk' || item.bodyHtml !== null) return;
    let alive = true;
    setLoadingBody(true);
    fetchNewsBody(id)
      .then((body) => {
        if (!alive) return;
        setDkBody(body);
        setLoadingBody(false);
      })
      .catch(() => {
        if (alive) setLoadingBody(false);
      });
    return () => {
      alive = false;
    };
  }, [id, item?.source]);

  // Imágenes del artículo: bytes por el transporte nativo (ORB bloquea <img>).
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img[data-dinfo]'))) {
      const url = img.getAttribute('src') ?? '';
      fetchInfoImage(url)
        .then((blobUrl) => {
          img.removeAttribute('data-dinfo');
          img.src = blobUrl;
        })
        .catch(() => img.removeAttribute('data-dinfo'));
    }
  }, [dkBody]);

  if (!item) {
    return (
      <div class="feed-scroll">
        <div class="feed">
          <p class="detail-back-row">
            <a class="detail-back" href="#/noticias">← Noticias</a>
          </p>
          <p class="empty-state">Esta noticia ya no está en la caché local.</p>
        </div>
      </div>
    );
  }

  const useDkBody = item.source === 'dk' && !!dkBody;
  const hasSeedBodies = item.bodies.length > 0;

  return (
    <div class="feed-scroll">
      <article class="feed feed--article">
        <p class="detail-back-row">
          <a class="detail-back" href="#/noticias">← Noticias</a>
        </p>
        <div class="news-card__meta">
          {item.tab && <span class="news-card__tab">{item.tab}</span>}
          {item.category && <span class="news-card__cat">{item.category}</span>}
          <time datetime={item.startAt ?? undefined}>{formatDate(item.startAt)}</time>
        </div>
        <h2 class="news-article__title">{item.title}</h2>

        {useDkBody ? (
          <div
            class="news-body__text news-body__text--dk"
            ref={bodyRef}
            dangerouslySetInnerHTML={{ __html: sanitize(dkBody ?? '') }}
          />
        ) : hasSeedBodies ? (
          item.bodies.map((b) => (
            <div class="news-body" key={b.id}>
              {b.image && <img class="news-body__img" src={b.image} alt="" loading="lazy" decoding="async" />}
              {b.description && <div class="news-body__text" dangerouslySetInnerHTML={{ __html: sanitize(b.description) }} />}
            </div>
          ))
        ) : item.source === 'dk' && loadingBody ? (
          <p class="news-card__summary">Cargando artículo…</p>
        ) : item.summary ? (
          <p class="news-card__summary">{item.summary}</p>
        ) : (
          <p class="news-card__summary">
            Sin conexión: solo está disponible el resumen. Se cargará en la próxima actualización.
          </p>
        )}

        <p class="detail-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </article>
    </div>
  );
}
