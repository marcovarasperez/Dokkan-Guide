import { useEffect, useState } from 'preact/hooks';
import { fetchInfoImage } from '../model/http';

/**
 * Imágenes desde dokkaninfo.com. El navegador bloquea esos <img> directos
 * (ORB), así que los bytes se descargan por el transporte nativo y se
 * muestran como blob. Caché de sesión URL real → blob URL.
 * Compartido por: Tienda de Baba, banners (activos/finalizados) y la
 * sección de obtención de la ficha de personaje.
 */

const imgBlobCache = new Map<string, string>();

export const hideBroken = (e: { currentTarget: HTMLImageElement }): void => {
  e.currentTarget.classList.add('img-broken');
};

export function InfoImg({
  url,
  alt = '',
  cls = 'baba-item__icon',
}: {
  url: string;
  alt?: string;
  cls?: string;
}) {
  const [src, setSrc] = useState<string | null>(() => imgBlobCache.get(url) ?? null);
  useEffect(() => {
    if (src) return;
    let alive = true;
    fetchInfoImage(url)
      .then((blobUrl) => {
        imgBlobCache.set(url, blobUrl);
        if (alive) setSrc(blobUrl);
      })
      .catch(() => {
        /* sin imagen: el bloque sigue siendo legible */
      });
    return () => {
      alive = false;
    };
  }, [url, src]);
  if (!src) return <span class={`${cls} ${cls}--pending`} aria-hidden="true" />;
  return <img class={cls} src={src} alt={alt} loading="lazy" decoding="async" onError={hideBroken} />;
}

export default InfoImg;
