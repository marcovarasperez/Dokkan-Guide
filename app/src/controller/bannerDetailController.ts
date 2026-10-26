import { useEffect } from 'preact/hooks';
import { bannerDetailState, closeBannerDetail, loadBannerDetail } from '../model/bannerArchive';

/**
 * CONTROLADOR · Detalle de un banner (#/banners/{id}).
 *
 * Aquí vive la lógica de la vista `view/BannerDetail.tsx`; la vista solo pinta
 * lo que este hook devuelve (imagen, fechas, descripción y destacados):
 *
 *  - descarga del banner con caché (`model/bannerArchive.ts` → dokkaninfo
 *    /banners/{id}) y su cierre al salir de la vista;
 *  - estado de carga / error del archivo;
 *  - `detail`: el detalle vigente SOLO si corresponde al `id` pedido (si se
 *    cambia de banner, el dato anterior no se pinta mientras llega el nuevo).
 *
 * Los destacados se muestran como ficha in-app cuando los conocemos (por id de
 * personaje) o como enlace con su nombre: ese dibujo se queda en la vista.
 */
export function useBannerDetailController(id: number) {
  const st = bannerDetailState.value;

  useEffect(() => {
    void loadBannerDetail(id);
    return () => closeBannerDetail();
  }, [id]);

  const detail = st.id === id ? st.detail : null;

  return {
    /** Estado global del detalle (status, id y detail descargado). */
    st,
    /** Detalle del banner `id` actual (null mientras carga o si falló). */
    detail,
  };
}
