import { useEffect, useRef, useState } from 'preact/hooks';
import { loadDkPage } from '../model/dkPage';
import type { DkPageData } from '../model/dkPage';
import { fetchInfoImage } from '../model/http';

/**
 * CONTROLADOR · Visor de páginas de catálogo de dokkaninfo (`view/DkPageView.tsx`).
 *
 *  - descarga perezosa (con caché local) de la página `path` vía `model/dkPage.ts`;
 *  - `reload`: refresco manual ignorando la caché;
 *  - `bodyRef`: nodo donde la vista monta el HTML saneado. Las imágenes se
 *    piden primero en directo (<img>, cacheado por el WebView gracias a
 *    `referrer: no-referrer`) y, si el WebView las bloquea (ORB / 403), se
 *    reintentan por el transporte nativo y se pintan como blob.
 */
export function useDkPageController(path: string) {
  const [data, setData] = useState<DkPageData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [nonce, setNonce] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    loadDkPage(path, { force: nonce > 0 })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setStatus('ok');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [path, nonce]);

  // Fallback de imágenes bloqueadas → transporte nativo (blob).
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const onError = (ev: Event): void => {
      const img = ev.target as HTMLImageElement;
      if (img.tagName !== 'IMG' || !img.hasAttribute('data-dinfo')) return;
      img.removeAttribute('data-dinfo'); // un solo reintento por imagen
      fetchInfoImage(img.src)
        .then((blobUrl) => {
          img.src = blobUrl;
        })
        .catch(() => {
          img.style.visibility = 'hidden';
        });
    };
    root.addEventListener('error', onError, true);
    return () => root.removeEventListener('error', onError, true);
  }, [data]);

  return {
    data,
    status,
    bodyRef,
    reload: (): void => setNonce((n) => n + 1),
  };
}
