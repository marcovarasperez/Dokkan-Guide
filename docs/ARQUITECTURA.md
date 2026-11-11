# Arquitectura y flujo de la app (MVC)

App Android (APK con **Capacitor 8**) escrita en **TypeScript + Preact** (Vite). No usa ninguna API propia: **todos los datos se leen de las páginas de dokkaninfo.com** (JSON embebido en atributos `v-bind:*` o HTML renderizado en servidor) y se guardan en una base de datos local (IndexedDB) para funcionar sin conexión.

> ¿Por qué TypeScript y no Kotlin? El parseo de dokkaninfo usa `DOMParser` y el mismo código genera el APK (Capacitor) y el `.exe` (Tauri). En Android la app corre en el WebView del sistema y las peticiones salen por un plugin nativo Java (`OkHttpPlugin`, HTTP/2) para que Cloudflare no las bloquee.

## Dónde está cada cosa

```
app/
├── index.html                 Punto de entrada HTML (meta referrer no-referrer para las imágenes)
├── public/data/*.json         Semillas empaquetadas (primer arranque offline)
├── android/                   Proyecto Gradle (Capacitor) → APK
│   └── app/src/main/java/fan/dokkanguide/global/
│       ├── MainActivity.kt    Registra el plugin OkHttp
│       ├── OkHttpPlugin.java  Transporte HTTP/2 hacia dokkaninfo
│       └── sync/              Worker de sincronización en segundo plano
└── src/
    ├── main.tsx               Arranque: monta <App/>, carga la base local y lanza la sync
    ├── model/                 MODELO: datos, descargas, parseo, caché (sin UI)
    ├── controller/            CONTROLADOR: rutas, navegación y lógica de cada vista (hooks)
    ├── view/                  VISTA: componentes Preact que solo pintan
    └── styles/app.css         Tema (claro/oscuro) y estilos de todas las vistas
```

### Modelo (`src/model`)

| Fichero | Qué hace |
|---|---|
| `http.ts` | Transporte a dokkaninfo: proxy `/dinfo` en desarrollo, OkHttp/CapacitorHttp en Android, plugin http en Tauri. Reintentos y espaciado de peticiones. `fetchInfoText`, `fetchInfoImage`. |
| `dinfo.ts` | Parsers de dokkaninfo: índice de cartas, ficha (`datajson`), listados y detalle de eventos, misiones, noticias. |
| `dkPage.ts` | Páginas de catálogo genéricas (Items, Panel Missions, Schedule, Tips, Awakening Medals, páginas de links y cualquier enlace interno): recorte de `div.container-1220`, saneado, reescritura de enlaces a rutas de la app. Define `ITEM_PAGES`. |
| `game.ts` | Eventos (13 categorías, `EVENT_TYPES`, `loadEventType`), detalle de evento, misiones, Tienda de Baba (`BABA_SHOPS`). |
| `bannerArchive.ts` | Banners activos/finalizados y detalle. |
| `news.ts` | Noticias y cuerpo de cada noticia. |
| `detail.ts` | Ficha completa de un personaje (stats, habilidades, formas, obtención, líderes 200 %, partners). |
| `hp.ts` | **Hidden Potential**: parser de la pasiva y recomendación (guía curated → cálculo → estimación). |
| `constants.ts` | Constantes; `potentialFlatBonus` = bonus de la columna 55 % (regla exacta de dokkaninfo). |
| `repository.ts` | Unidades en memoria: seed empaquetado + caché IndexedDB. |
| `sync.ts` | Sincronización incremental (hash por fila) al abrir y cada 5 min. |
| `localDb.ts` | IndexedDB (stores de unidades, noticias, eventos/páginas, banners). |
| `wiki.ts` | Semillas de links y categorías. |
| `types.ts`, `adapter.ts`, `date.ts`, `html.ts`, `hash.ts`, `theme.ts`, `notifications.ts`, `cardAnim.ts` | Tipos, URLs de arte, fechas, utilidades, tema, avisos, animación LWF. |

### Controlador (`src/controller`)

| Fichero | Qué hace |
|---|---|
| `router.ts` | Rutas hash (`#/…`) → señal `view` y parámetros (`detailId`, `eventsType`, `itemsSlug`, `babaShop`, `dkPath`…). |
| `navigation.ts` | **Árbol de pestañas y sub-pestañas** (espejo del menú de dokkaninfo). Lo usan la cabecera y las barras de sub-pestañas. Para añadir/quitar una pestaña se toca solo aquí (y su ruta en `router.ts`). |
| `listController.ts` | Búsqueda, filtros y orden del listado de cartas. |
| `unitDetailController.ts` | Ficha de personaje (estados EZA/SEZA, formas, stats 55 %/100 %, Hidden Potential). |
| `eventsController.ts` | Categoría de eventos activa (desde la ruta), deep-links `?ev=tipo/id`, paginación. |
| `dkPageController.ts` | Carga de páginas de catálogo + reintento nativo de imágenes bloqueadas. |
| `toolsController.ts` | Link Tool, 200%+ Leader Skill, buscador de personajes, índice de links. |
| `babaController.ts`, `bannersController.ts`, `bannerDetailController.ts`, `categoryController.ts`, `newsController.ts`, `newsDetailController.ts` | Lógica de cada una de esas vistas. |

### Vista (`src/view`)

`App.tsx` (shell: cabecera + vista según `view`), `Header.tsx` (pestañas con desplegables), `SubTabs.tsx` (barra de sub-pestañas), y una vista por sección: `RecentView`, `NewsView`/`NewsDetail`, `BannersView`/`BannerDetail`, `FilterBar` + `UnitGrid` + `UnitCard` (Cards), `UnitDetail` (ficha), `CategoryView`, `LinksView`, `EventosView` (+ `gameShared`), `ItemsView`, `MissionsView`, `BabaView`, `ToolsView`, `DkPageView` (visor genérico), `InfoView`, `SettingsView`.

## Pestañas y sub-pestañas (igual que dokkaninfo)

| Pestaña | Sub-pestañas | Ruta |
|---|---|---|
| Recientes | — | `#/recientes` |
| News | — | `#/noticias[/{id}]` |
| Banners | Banners | `#/banners[/{id}]` |
| Cards | Cards · Categories · Links · Schedule | `#/cartas`, `#/cartas/categorias[/{id}]`, `#/cartas/links`, `#/cartas/calendario`, ficha `#/characters/{id}` |
| Events | Burst Mode · Bonus · Challenge · DB Stories · Extreme Z Battle · Growth · Limited · Pettan Battle · Quest · Story · Dokkan Frontier · Ultimate Clash · World Tournament | `#/eventos/{slug}`, deep-link `#/eventos?ev={tipo}/{id}` |
| Items | Act Items · Awakening Medals · Equipment · Keys · Potential Items · Special Items · Stickers · Support Items · Support Memories · Tips · Training Fields · Training Items · Treasure Items · Wallpapers | `#/items/{slug}` |
| Missions | Missions · Panel Missions | `#/misiones`, `#/misiones/panel` |
| Baba's Shop | Trade Pts. · Zeni · Treasure Items · Secret Treasure Chests | `#/baba/{intercambio\|zeni\|tesoro\|cofres}` |
| Tools | Link Tool · 200%+ Leader Skill | `#/herramientas/link-tool`, `#/herramientas/leader-skill` |
| Info · Ajustes | — | `#/info`, `#/ajustes` |
| (enlaces internos) | — | `#/dk/{ruta de dokkaninfo}` |

No incluidas: *Users* (requiere cuenta en dokkaninfo), *Skills* y *Banner Animations* (dokkaninfo las pinta solo en cliente / con animaciones LWF).

## Flujo de la aplicación

```
Arranque (main.tsx)
  └─ repository.loadRepository()     seed empaquetado o caché IndexedDB (la más reciente)
  └─ sync.ts                          comprobación en segundo plano (al abrir y cada 5 min)
        └─ http.fetchInfoText('/cards') → dinfo.parseCardsIndex → hash por fila
        └─ cartas nuevas/cambiadas → /cards/{id} → repository.applySyncResult → IndexedDB
App.tsx
  └─ router.initRouter()             hash → señal `route` → `view`
  └─ Header (navigation.NAV_TABS)    pestañas + desplegables
  └─ vista según `view`
        └─ controller (hook)          pide datos al modelo
              └─ model                1) caché IndexedDB  2) red (dokkaninfo)  3) guarda en caché
        └─ la vista pinta; señales de Preact repintan cuando llegan datos
```

Ejemplo — abrir *Events › Burst Mode*: enlace `#/eventos/burst` → `router.eventsType = 'burstmode'` → `EventosView` → `useEventsController` → `game.loadEventType('burstmode')` → caché o `GET /events/burstmode` → `dinfo.parseEventList` (JSON `genkai_battles_json`) → `eventLists` → la vista pinta las tarjetas; al desplegar una, `loadEventDetail` descarga `/events/burstmode/{id}`.

Ejemplo — abrir una ficha: `#/characters/{id}` → `UnitDetail` → `useUnitDetail` → `detail.fetchUnitDetail` (`/cards/{id}`, caché IndexedDB) → stats, habilidades y `hp.recommendHp(...)`.

## Hidden Potential

- **Tabla de stats 55 % / 100 %** (`constants.potentialFlatBonus`): igual que dokkaninfo, el MISMO bonus se suma a HP/ATK/DEF según `potential_board_id`: 10–14 → +1200 · 20–24 y 120–124 → +2000 · 30–34 → +2800 · resto → +1600. 100 % = máx. + `hp_hipo/atk_hipo/def_hipo`.
- **Recomendación de nodos** (`model/hp.ts`): guía curated (`public/data/hidden_potential.json`) → cálculo con la pasiva de la ficha → estimación por rol. La tarjeta indica el origen (Guía / Cálculo / Estimación), las probabilidades totales y los pasos.
- Correcciones aplicadas: los efectos con flecha roja (`down_r`) ya no suman; "nullify attacks that are guaranteed to hit" ya no cuenta como esquiva garantizada; "Evades…/Performs a critical hit" con condición en la línea ya no cuentan como 100 %; las guías curated incluyen la pasiva en sus totales; la tarjeta no muestra la estimación mientras carga la ficha.

### Roles (`model/role.ts`)

El cálculo detecta el **rol** de la unidad con el texto de su pasiva y sus Súper (dokkaninfo): Acumulador (buff largo), Tanque de esquiva (evasión ≥ 40 %), Tanque (reducción de daño, guard, contra…), Daño (crítico, adicionales, anula guard…), Soporte (buffs a aliados, curas, debuffs), **Superviviente** (kit centrado en esquivar —evasión de la pasiva ≥ 40 % o Súper que esquiva— , sin llegar ya al 70 % de esquiva por pasiva (criterio de Playmaker: ahí más Evasión no se nota)— y poco daño: puntuación de daño del texto < 20 o **daño efectivo** < 70 % del percentil 75 de los UR/LR de su época (±6 meses de su salida/EZA/SEZA), ver abajo; p. ej. Hercule INT EZA o Trunks (Teen) del Torneo Intergaláctico: reparto fijo 15 Evasión + 6 Adicional, más la afinidad) o Híbrido. Cada rol multiplica la ganancia de Adicional / Crítico / Evasión (`ROLE_WEIGHTS`) al elegir el reparto, así que el Hidden Potential recomendado cambia según el rol. La tarjeta muestra el rol, su slot y, en «Cómo se ha calculado», las pistas que lo justifican. Test: `node app/tests/role.test.ts`.

### Daño efectivo (`model/damage.ts` + `tools/damage_sync.mjs`)

`daño = ATK × (1 + 2 · líder %) × (1 + pasiva %) × (mejor Súper % + subida de ATK del Súper %)`, con el estado vigente (base/EZA/SEZA):
- **2 líderes**: la mejor leader skill del ranking 200%+ de la unidad en dokkaninfo, en los dos huecos.
- **Pasiva**: suma de las subidas de ATK propias (escalados por su máximo; sin buffs a aliados ni bajadas).
- **Súper**: el mayor multiplicador a nivel máximo entre Super, Ultra, EX y Unit Super Attack, más su subida de ATK.

`node tools/damage_sync.mjs` lo calcula para todas las UR/LR (≈1.900 peticiones; caché de 7 días en `tools/.damage-cache.json`) y escribe `app/public/data/damage.index.json`; la ficha lo carga y `damageVsPeers` compara con su época. No incluye multiplicador de Ki, links ni apoyos.

### Hidden Potential por estado

Cada estado de la unidad (**Normal, EZA y SEZA**) tiene su propio Hidden Potential: la ficha recalcula con la pasiva y los Súper del estado elegido en los chips (`unitDetailController` → `recommendHp(..., state)`), así que el reparto, el rol y las probabilidades pueden cambiar entre estados. Las guías curated admiten `variant: "base" | "eza" | "seza"`. La comparación de daño con su época solo se aplica al estado vigente (el índice guarda ese estado).

### Criterios de las guías de Playmaker

El reparto sigue la lógica de sus guías de Hidden Potential (playlist «Hidden Potentials y Ataques Farmeables»; transcripciones leídas: guía de Año Nuevo 2026 y «Cómo armar los Hidden Potentials de tu primer equipo F2P»):
1. **Full adicionales (15)** es la base: más Súper = más ATK/DEF por Súper y más stacks.
2. **El resto (6)** va a Crítico o Evasión: la que menos tenga ya la pasiva, porque pasiva y Hidden Potential se combinan multiplicando (`1 − fallo pasiva × fallo HP`) y repetir lo que ya tiene renta poco. Se pondera por rol.
3. **Necesita recibir golpes** para potenciarse (ATK/DEF/crítico «por ataque recibido» o «tras recibir», revivir): nada de Evasión, el resto a Crítico (`needsHits`).
4. **Build puramente defensiva**: defensa que se pierde al recibir golpes («Before receiving N attacks»): Evasión 15 y el resto en Adicional (`losesBuffWhenHit`). El rol Superviviente usa el mismo reparto.
La afinidad de tipo (+5) se suma siempre. Detectores y tests en `model/role.ts` y `app/tests/role.test.ts`.
