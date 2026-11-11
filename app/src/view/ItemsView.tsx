import { itemsSlug } from '../controller/router';
import { ITEM_PAGES } from '../model/dkPage';
import DkPageView from './DkPageView';
import SubTabs from './SubTabs';

/**
 * VISTA · "Items": una sub-pestaña por categoría del menú Items de
 * dokkaninfo (`ITEM_PAGES`). Cada una se pinta con el visor de páginas de
 * catálogo (`DkPageView`), que conserva la maquetación de la fuente.
 */
export default function ItemsView() {
  const page = ITEM_PAGES.find((p) => p.slug === itemsSlug.value) ?? ITEM_PAGES[0];
  return (
    <DkPageView
      key={page.path}
      path={page.path}
      title={`Items · ${page.label}`}
      header={<SubTabs section="items" label="Tipos de items" />}
    />
  );
}
