import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchNewsBody, newsState } from '../model/news';
import { fetchInfoImage } from '../model/http';

/**
 * CONTROLADOR · Lector de noticias dentro de la app (#/noticias/{id}).
 *
 * Aquí vive la lógica de la vista `view/NewsDetail.tsx`; la vista solo pinta
 * (y sanea el HTML con su helper local `sanitize`):
 *
 *  - `item`: noticia pedida tomada de la caché local de `model/news.ts`
 *    (null → la vista muestra «ya no está en la caché local»);
 *  - descarga perezosa del CUERPO del artículo de dokkaninfo cuando la fuente
 *    es `dk` y aún no está (`fetchNewsBody`, cacheado en IndexedDB/localStorage);
 *  - `bodyRef` + refresco de las imágenes del artículo: los bytes se piden con
 *    transporte nativo porque ORB bloquea los <img> directos a dokkaninfo
 *    (el efecto recorre el DOM que la vista monta con `dangerouslySetInnerHTML`);
 *  - flags derivados que usa el JSX: `useDkBody` (pintar el cuerpo de
 *    dokkaninfo) y `hasSeedBodies` (noticias del seed empaquetado con HTML
 *    legado del CDN de fyi).
 */
export function useNewsDetailController(id: number) {
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

  return {
    /** Noticia pedida (undefined → fuera de la caché local). */
    item,
    /** Cuerpo descargado de dokkaninfo (null mientras no llegue). */
    dkBody,
    /** ¿Hay una descarga de cuerpo en curso? */
    loadingBody,
    /** Nodo donde la vista monta el HTML saneado (para recargar sus imágenes). */
    bodyRef,
    /** ¿Pintar el cuerpo de dokkaninfo en lugar del seed/resumen? */
    useDkBody: !!item && item.source === 'dk' && !!dkBody,
    /** ¿La noticia trae cuerpos empaquetados (HTML legado del seed)? */
    hasSeedBodies: (item?.bodies.length ?? 0) > 0,
  };
}
