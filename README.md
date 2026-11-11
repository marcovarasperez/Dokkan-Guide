# Dokkan Fan Guide (Global)

Guía **fan no comercial** de personajes de *DBZ Dokkan Battle (Global)* con su **Hidden Potential óptimo**, con aspecto visual inspirado en dokkaninfo.com.

> **Atribución y legal**: todos los datos (unidades, habilidades, stats, fechas, banners, eventos, misiones, noticias y Tienda de Baba) y todas las imágenes (arte de unidades, eventos, banners, noticias, drops, objetos y detalle) se sirven desde **[DOKKANINFO.COM](https://dokkaninfo.com)** con las cabeceras de un cliente de navegador, citándolo como fuente en cada vista ("Datos: DOKKANINFO"). Las imágenes se cargan en caliente (`<img>` directo con `referrer: no-referrer`, ya que Cloudflare devuelve 403 con Referer ajeno, y las de datos por el **transporte nativo**); sin redistribuirlas en el bundle, para que el WebView las cachee. La semilla local empaquetada (`units.index.json`, generado con `tools/sync.mjs`) comparte formato con la fuente y solo sirve como **caché offline de primera apertura**; desde la Fase 9 la fuente viva es dokkaninfo. La referencia visual es dokkaninfo.com: se ha reproducido su *identidad* (tema oscuro, retícula de tarjetas, paneles de detalle) con **CSS y componentes propios**, sin copiar su código. Este proyecto no está afiliado a Bandai Namco ni a dokkaninfo.com.

## Estado por fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Informe técnico (stack, fuentes, diseño) | ✅ Aprobada |
| 2 | Modelo de datos + listado con filtros + sincronización incremental | ✅ Aprobada |
| 3 | Ficha de detalle (EZA/SEZA) + Hidden Potential óptimo (2 columnas + resumen minimalista) | ✅ Aprobada |
| 4 | Herramienta de importación de guías HP (transcripción + IA) | ❌ Descartada (no requerida; las guías se editan a mano) |
| 5 | Noticias/Banners + shells de compilación (APK + .exe) | ✅ Aprobada |
| 6 | Superataques por grupos + sección "¿Dónde conseguirlo?" | ✅ Aprobada |
| 7 | Sección "Juego": Eventos, Quest, Historia DB, Z-Battles, Torneos, Misiones y Tienda de Baba | ✅ Aprobada |
| 8 | 5 secciones: Eventos con sub-pestañas, Tienda de Baba con detalle por joya, Banners activos/finalizados + detalle, obtención con imágenes y deep-links, HP por estado EZA/SEZA | ✅ Aprobada |
| 9 | Migración completa a dokkaninfo (fuente única viva): Eventos con foto + drops por etapa, Banners en 4 grupos (Recommended / Dragon Stone / Ticket / Friend Pts.), noticias con cuerpo completo, "Basic effect(s)" en naranja | ✅ Esta entrega |

> **Documentación de arquitectura, ubicación de cada fichero y flujo de la app: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).**

## Estructura

```
Proyecto predeterminado/
├── tools/
│   ├── sync.mjs                # Seed base de unidades (semilla offline; formato compatible con dokkaninfo)
│   ├── drops_sync.mjs          # Genera public/data/drops.index.json desde dokkaninfo (curl + UA; Node ≥18)
│   ├── zbattles_sync.mjs       # Genera public/data/zbattles.index.json (Z-Battle → título + carta objetivo)
│   └── wiki_sync.mjs           # Genera links.index.json (efectos Nv.1/Nv.10) y categories.index.json (líderes + miembros)
├── app/                        # Código de la app (Vite + TypeScript + Preact)
│   ├── public/data/            # Seeds empaquetados: units.index, meta, news.seed, hidden_potential, drops.index, zbattles.index, links.index, categories.index
│   ├── capacitor.config.ts     # Config de Capacitor → app/android (APK)
│   ├── android/                # Proyecto Gradle generado por Capacitor (compilación Android)
│   ├── src-tauri/              # Shell Tauri 2: Cargo.toml, tauri.conf.json, capabilities, iconos (.exe Windows)
│   └── src/
│       ├── model/              # types, adapter (URLs de arte), repository, sync, http (transportes nativos), html, dinfo (parsers dokkaninfo), detail (ficha + obtención), hp, news, bannerArchive (banners), game (Eventos + Baba), format
│       ├── controller/         # router, navigation (pestañas), un hook por vista
│       ├── view/               # App (router hash de 5 secciones), Header, FilterBar, UnitGrid (virtualizado), UnitCard, UnitDetail, NewsView, NewsDetail, BannersView, BannerDetail, EventosView, BabaView, InfoImg, SkillRich, gameShared
│       └── styles/             # Tema oscuro propio (variables + componentes)
├── docs/
│   ├── BUILD.md                # Compilación: APK (Capacitor) y .exe (Tauri)
│   └── hidden_potential_schema.md  # Esquema de las guías curated de Hidden Potential
```

## Requisitos

- Node.js ≥ 18 (probado con 24) y npm — suficiente para desarrollo y build web.
- Para compilar APK/.exe: ver `docs/BUILD.md` (JDK+Android SDK para APK; Rust+MSVC para .exe).

## Comandos

```powershell
# 1) Regenerar los índices de obtención (drops y Z-Battle de EZA/SEZA)
node tools\drops_sync.mjs        # eventos → cartas; usa caché local (tools\.drops-cache.json); --force la ignora
node tools\zbattles_sync.mjs     # Z-Battle → título + carta objetivo (caché 7 días)

# 2) Desarrollo
cd app
npm install
npm run dev        # → http://localhost:5173 (proxy /dinfo → dokkaninfo.com)

# 3) Build web (base de los shells Tauri/Capacitor)
npm run build

# 4) Shells (detalles en docs/BUILD.md)
npx cap sync android      # tras cada build: copia dist/ al proyecto Android
npm run tauri dev         # app de escritorio con recarga
npx tauri build --no-bundle   # solo .exe portable (sin instaladores NSIS/MSI)
```

## Arquitectura (capas)

- **`src/model`** — lógica y acceso a datos, sin UI:
  - `types.ts`: modelo (`UnitSummary`, `SeedMeta`, `SyncState`).
  - `dinfo.ts`: parsers de dokkaninfo — índice de `/cards` (`v-bind:cardsjson`), página de carta (`datajson` → resumen + ficha completa), listados y **detalle de eventos** (niveles, etapas, recompensas), misiones y noticias; mapas `element` → tipo/clase y `rarity` (verificados con 1.458 muestras, conflictos 0); URLs de assets (eventos, thumbs, objetos).
  - `adapter.ts`: URLs de **arte** de unidades (thumbs/marcos/iconos desde el CDN para cachear en el WebView) + colores por tipo.
  - `repository.ts`: caché en dos niveles — **seed empaquetado** (apertura instantánea) + **delta en localStorage** (unidades nuevas/modificadas detectadas en caliente).
  - `sync.ts`: sincronización incremental con **hash por fila** (FNV-1a): escanea `/cards`, compara fila vs. resumen local y re-descarga las cartas cambiadas/nuevas (máx. 12 por corrida, nuevas primero); integra el refresco de noticias.
  - `html.ts`: utilidades compartidas de HTML (decodificación de entidades).
  - `detail.ts`: ficha perezosa con **caché en IndexedDB** (invalidada por hash); descarga `dokkaninfo.com/cards/{id}` (`datajson` → stats, leader/passive/active, SA con estilo/ki/multiplicadores, links, categorías, transformations, EZA live, `eza_open_date` → "EZA previsto") y compone "¿Dónde conseguirlo?" con los **banners del datajson** (separados por moneda: gemas vs tickets) y el **índice de drops** (`drops.index.json`), más la sección propia "¿Dónde conseguir el EZA/SEZA?" con el **Z-Battle propio** (`zbattles.index.json`, cruce por carta o por nombre) y las **medallas** (`eza_medals`). Expone además los **mejores líderes 200%+** (`two_hundred_leaders`), los **mejores linking partners** (`similar_links`, con los links compartidos) y las **formas transformadas** (con icono) que alimentan el selector de la ficha. Recomienda Hidden Potential de 3 fuentes (curated → **método de Playmaker** → estimación) sobre el **estado vigente** de la carta.
  - `news.ts`: noticias (lista paginada `news_json` + **cuerpo completo** por detalle, cacheado) con seed empaquetado para la primera apertura; el refresco corre dentro del mismo ciclo de sync (discreto, con throttle).
  - `http.ts`: transporte — proxy Vite (`/dinfo`) en dev; en producción, **import dinámico** del transporte nativo correspondiente (Tauri `plugin-http` / Capacitor `CapacitorHttp`): coste cero en web, sin CORS en los shells. `fetchInfoText`/`fetchInfoImage` envían UA + Accept-Language (dokkaninfo filtra peticiones sin cabeceras de navegador) y descargan imágenes como blob (el `<img>` directo queda bloqueado por **ORB**).
  - `game.ts`: contenido de **Eventos** (6 sub-pestañas: Eventos, Quest, Historia DB, Z-Battles, Torneos, Misiones) leído de dokkaninfo — foto por evento + **detalle perezoso con niveles/etapas y drops** (cacheado en `localStorage`) — y **Tienda de Baba** (4 secciones, con detalle por joya: precio en joyas, stock y vigencia), con caché por sección.
  - `bannerArchive.ts`: archivo de banners de dokkaninfo (listados **activos/finalizados** vía `/api/banners?status=` —con **carga completa** de todas las páginas para la vista de activos— y detalle por banner con sus destacados), con caché en `localStorage`.
- **`src/view`** — componentes Preact + señales; lista **virtualizada** (solo pinta las filas visibles; clave para ~1.500 tarjetas con imágenes). `FilterBar` implementa el **panel de clasificación** estilo juego del listado: filtros por tipo, **clase** (Súper/Extremo) y **rareza** (N→LR) más **orden multi-criterio** (más recientes · nombre · rareza · HP · ATK · DEF · coste) con conmutador de dirección ▲/▼. Incluye `SkillRich`, renderizador de habilidades con formato rico: encabezados en MAYÚSCULAS **todos en naranja** (incluido el efecto base "Basic effect(s)", igual que el resto de condiciones), puntos de lista con **flechita** de color, iconos inline `{passiveImg}` (PNG del CDN), números (`120%`, `+2`) y stats (`ATK`/`DEF`/`HP`) resaltados. `InfoImg` comparte la descarga nativa de imágenes dokkaninfo (blob en caché por sesión).

## Presentación de ficha

- **Separación de estados (sin EZA · EZA · SEZA)**: dokkaninfo publica la carta tal y como está en juego, y su catálogo trae **siempre el estado base**. Para unidades con historia, la ficha muestra chips de **estado** —**Sin EZA**, **EZA** y **SEZA** (el vigente marcado)… ¡y al cambiar de estado cambia la tabla de stats por completo! Los stats EZA salen de la **fórmula exacta de la fuente** (`máx. + redondeo del 48,39 % del margen min→máx`, la columna "EZA B. Max" del sitio) o del valor EZA real guardado en la semilla local; la columna **+55%** usa el **bonus plano por tablero de potential** de la fuente (1200/2000/2800/1600; ≈55 % lineal sin ficha viva) y **+100%** suma las ganancias reales del potential. Como la fuente solo publica los textos del estado vigente, los estados pasados muestran sus stats con un **aviso honesto** en líder/pasiva/SA. Los LR (que van directo a SEZA) no muestran chip EZA, igual que la propia fuente. Un EZA no liberado sigue apareciendo como chip **"EZA previsto"** con su fecha.
- **Selector de formas**: formas transformadas de `transformationPath`, cada una con su leader/passive/SAs/stats reales de su propia página.
- **Pasiva estructurada** (secciones + viñetas) en lugar de texto crudo, con los iconos/flechas del CDN en color. Todos los encabezados de condición **y el efecto base** van en **naranja**.
- **Superataques con todos los datos y todas las variantes**: divididos en **Super Attack**, **Ultra Super Attack** (Ki ≥ 18 / estilo `Hyper`), **Unit Super Attack** y **EX Super Attack** (estilo `EX`; lo no catalogado cae en "Otras"), con **bloque con tinte** amarillo/morado/rojo, **Condición** de activación cuando la SA la tiene y **multiplicador** (Nv. 1 → nivel máximo vigente).
- **Fondo teñido por afinidad de tipo** mediante `--type-tint`; **Hidden Potential a todo color** (`pot_skill_0X_on/off.png`).
- En pantallas anchas: **dos columnas** (lado fijo con arte, stats y Hidden Potential; lado principal con las habilidades) para minimizar el scroll, con el contenedor ampliado a **1400 px** para aprovechar el ancho de pantalla.
- **Clasificación estilo juego**: chips de tipo/clase/rareza/coste más rankings vivos de la fuente — nº de **líderes 200%+** que la cubren, nº de **linking partners** con 5+ links en común y su **mejor partner**.
- **Mejores líderes (200%+)** y **mejores linking partners**: rejillas de miniaturas enlazadas a cada ficha con los **links compartidos** destacados, según el ranking que publica dokkaninfo (`two_hundred_leaders` / `similar_links`).

## Hidden Potential (resumen minimalista)

- Tarjeta destacada en la columna fija: **Adicional X · Crítico Y · Evasión Z**, badge de **afinidad de tipo**, tabla de **probabilidades totales** (pasiva + Hidden Potential) y los **pasos del método** paso a paso. Cadena de fuentes (prioridad):
  1. `app/public/data/hidden_potential.json` — guías **curated** con autor citado (esquema en `docs/hidden_potential_schema.md`; se edita a mano);
  2. **método de Playmaker** (cálculo local, sin comunidad), con estas reglas:
     - **21 puntos** para repartir: máx. **15** en una categoría y **6** en otra; la tercera queda a 0 salvo la **afinidad de tipo** (AGL→Adicional, STR/TEQ→Crítico, INT→Evasión, PHY→Adicional), que aporta **+5 iniciales** en su categoría (se suman al reparto manual).
     - Conversión: Adicional y Crítico = **2 % por punto**, Evasión = **1 % por punto**.
     - Las probabilidades del **mismo tipo en la pasiva se SUMAN** (no se toma el máximo).
     - Fórmulas: evasión/crítico totales `1 − (fallo pasiva · fallo HP)`; adicional total `1 − ∏` (cada ataque —inicial y cada adicional de la pasiva— tira su dado: los garantizados aportan `(1−p)` y los probables `(1−p·q)`), y siempre se divide 50 % Super / 50 % normal.
     - **Prioridad de buff**: si el SU sube ATK/DEF durante **6-99 turnos** (o stacking/indefinito), van **15 puntos a Adicional**; si no y la pasiva no tiene adicionales, también 15 a Adicional.
     - El resto se asigna a la opción con **mayor ganancia** = (total con HP) − (pasiva sola), comparando todas las distribuciones válidas;
  3. **estimación por rol** (ofensivo: Adicional → Crítico → Evasión; defensivo: Evasión → Adicional → Crítico), siempre etiquetada "Estimación".
- El cálculo usa la **pasiva y stats del estado vigente** (`full.passiveSkill`/`full.stats`, con fallback al resumen del índice). El parser analiza la pasiva **por cláusulas** (bullets y sus cabeceras de sección de dokkaninfo) y distingue los efectos **propios** de los de **aliados** según el **destino** (`allies' …` o `for "Unidad"` = aliados); los efectos propios escalados `…% (up to …%)` se valoran por su **máximo** (kit completo). Entiende chances por palabras (rare 15 % · medium 30 % · high 50 % · great 70 % · very high 82,5 %), porcentajes explícitos (delante o detrás) y garantías ("guaranteed dodge", "Performs a critical hit", "…high chance of **becoming** a Super Attack").

## Noticias y banners

- **Rutas** `#/noticias`, `#/noticias/{id}` (lector en-app), `#/banners` y `#/banners/{id}` (detalle de banner; router por hash).
- **Noticias**: lista `news_json` (4 páginas en el refresco); al pulsar una noticia se descarga su **cuerpo completo** (`/news/{id}`) y se muestra dentro de la app — HTML saneado (solo formato e imágenes; imágenes cargadas vía transporte nativo porque ORB bloquea el `<img>` directo; los enlaces a `/events/…` se re-mapean a deep-links en-app). Títulos con "unix-to-date" se desenvuelven a fecha legible. Semilla `news.seed.json` para la primera apertura offline.
- **Banners en 4 grupos**: la pestaña "Activos" agrupa el listado completo de dokkaninfo en **Recommended** (Dokkan Festival y partidas), **Dragon Stone** (Elder Kai / Mysterious Ritual), **Ticket** (`TicketGasha`) y **Friend Pts.** (`PointGasha` + `TutorialGasha`); "Finalizados" es el archivo histórico paginado. Cualquier tarjeta abre `#/banners/{id}`: imagen, fechas, estado y **destacados como fichas en-app** (por id de personaje).
- El refresco (incluido el detalle de banners) corre dentro del ciclo de sincronización (1 por apertura, ≥15 min) con estado discreto en la cabecera; si falla, se sigue mostrando la caché.

## "¿Dónde conseguirlo?" (composición dokkaninfo)

- **Banners**: el histórico completo del `datajson` de la carta (`banners[]`, con imágenes y fechas); los vigentes llevan el chip **"Activo ahora mismo"**, los pasados "Finalizado". Cada tarjeta enlaza a `#/banners/{id}`.
- **Eventos donde cae**: generado por `tools/drops_sync.mjs` → `drops.index.json` (701 eventos × detalle → cartas por etapa, con nivel y dificultad); cada tarjeta muestra la **foto del evento** y enlaza a `#/eventos?ev={type}/{id}` (abre la pestaña correcta, carga el evento y lo desplaza).
- Cada grupo (**Banner de gemas**, **Banner de tickets** y **Eventos**) muestra sus **6 primeras entradas** y el resto detrás del botón **"Mostrar más"**.
- **chips**: Free to Play / Obtenible por Summons (`summonable`); si no hay datos concretos, una nota genérica con enlaces a Banners, Eventos y Tienda de Baba.

## "¿Dónde conseguir el EZA/SEZA?" (sección propia)

- **Evento Z-Battle propio de la unidad**: el `extreme_z_battles` del `datajson` **no está restringido a la carta** (para Perfect Cell devuelve 49 eventos de otras unidades), así que `tools/zbattles_sync.mjs` genera `zbattles.index.json` (210 eventos → título + carta objetivo + cartel). La ficha cruza primero por **id de la carta** (base y formas) y, si no hay match, por **nombre exacto**; la tarjeta muestra el **título real** del evento, su **foto** y enlaza a `#/eventos?ev=zbattle/{id}`.
- **Medallas necesarias**: `eza_medals` del `datajson`, agrupadas por nombre y con la **cantidad total** (una entrada por escalón → se suman), por ejemplo `Perfect Cell [Silver] ×20`.
- Los **Z-Battles ya no aparecen** en "¿Dónde conseguirlo?" (son mejoras, no obtención de la carta). Si la unidad tiene EZA/SEZA y el índice no enlaza ningún evento, se muestra una nota de respaldo.

## 5 secciones: Eventos y Tienda de Baba

La app se divide en **exactamente 5 secciones** en el encabezado: **Personajes** (`#/`), **Banners** (`#/banners`), **Eventos** (`#/eventos`), **Tienda de Baba** (`#/baba`) y **Noticias** (`#/noticias`). La ruta antigua `#/juego` redirige a Eventos.

### Eventos (`#/eventos`)

- **Seis sub-pestañas**: **Eventos** (limited + story + growth + challenge + bonus), **Quest**, **Historia DB**, **Z-Battles**, **Torneos** y **Misiones** — todas leídas de dokkaninfo, con **caché en `localStorage` por sección** (apertura instantánea + offline) y **refresco manual**.
- **Tarjetas con foto del evento** (imagen `InfoImg`), nombre, badge **Activo** cuando aplica y la unidad enlazada en Z-Battles (enriquecida hasta 12 activos con el detalle de la página).
- **Al desplegar una tarjeta**: detalle perezoso del evento (`/events/{type}/{id}`, cacheado 6 h, máx. 40) con sus **niveles y etapas** (ID, dificultad, STA, EXP, Zeni, tasa de link) y **recompensas por etapa**: *Clear Reward* y *Drop Reward* con iconos; las **cartas** enlazan a su ficha en-app y los objetos se muestran con su miniatura.
- **Misiones**: categorías paginadas con nº de misiones, vigencia y recompensas (cartas enlazadas).
- **Deep-link**: `#/eventos?ev={type}/{id}` (por ejemplo `?ev=quest/12` o `?ev=zbattle/42`) abre la pestaña correcta, carga el evento si hace falta, lo despliega y lo enfoca.

### Tienda de Baba (`#/baba`)

- **Cuatro sub-pestañas**: **Puntos de Intercambio**, **Zeni**, **Tesoro** y **Cofres Secretos**, leídas de **dokkaninfo.com**.
- **Tesoro interactivo**: rejilla de joyas con su nombre real (catálogo `/items/treasureitems`); al pulsar una joya se abre la tienda de esa joya (`/babashop/treasureitems/{N}`) con lo que se puede comprar con ella — **precio en joyas, stock y vigencia** —, botón "← Todas las joyas" para volver y caché por joya (6 h).
- Los objetos de carta (`Card`) muestran la **miniatura real del personaje** y enlazan a su ficha en-app.
- Los **iconos de objeto** se descargan por el **transporte nativo** y se pintan como **blob** (ORB bloquea el `<img>` directo); caché de blobs en memoria por sesión (`InfoImg`).
- Cofres Secretos vía su API JSON (`/api/babashop/secrettreasurechests`); se indica disponibilidad y fechas.
- La vista cita "Datos DOKKANINFO.COM" y, si la fuente cambia de política o falla, muestra un estado de error con reintento sin romper la app.

## Sincronización incremental (cómo funciona)

1. El origen no ofrece ETag/Last-Modified → la detección de cambios se hace **por hash de fila** (FNV-1a sobre JSON estable): al escanear `/cards` se comparan nombre, rareza, tipo, niveles, stats, fechas y flags contra el resumen local; solo se re-descargan las cartas **nuevas** (rareza ≥ SR, sin ids stub) o **cambiadas** (máx. 12 por corrida).
2. Al abrir la app: se muestra la caché local al instante y, en segundo plano, **una** comprobación automática (máx. 1 por apertura, ≥15 min entre intentos). Estado discreto en el encabezado: "Actualizando…", "Al día", "Actualizado · +N nuevas", "Sin conexión — mostrando caché".
3. Botón **Actualizar** manual que fuerza la comprobación.
4. Para refrescar los índices de obtención: `node tools\drops_sync.mjs` (eventos donde cae) y `node tools\zbattles_sync.mjs` (Z-Battle de EZA/SEZA).

## Compilación (APK + .exe)

Todo el procedimiento está en **`docs/BUILD.md`**:

- **APK**: Capacitor 8 → proyecto Gradle en `app/android` (`npm run build` → `npx cap sync android` → `gradlew assembleDebug`).
- **.exe**: Tauri 2 → `app/src-tauri` (`npx tauri build --no-bundle` → solo exe portable; **sin instaladores NSIS/MSI** — decisión del usuario: nada de setup. Requiere Rust + MSVC).
- En ambos shells, `src/model/http.ts` activa el transporte nativo (sin CORS) automáticamente.

## Cómo actualizar los datos

- **En la app compilada**: la comprobación automática aplica deltas encima del seed empaquetado (unidades nuevas/cambiadas + noticias); el seed se refresca al compilar una nueva versión (APK: `npx cap sync android`).
- **Índice de drops**: `node tools\drops_sync.mjs` (recomendado antes de compilar; usa caché local de 24 h, `--force` la ignora).
- **Índice de Z-Battle**: `node tools\zbattles_sync.mjs` (título + carta objetivo de cada Z-Battle; caché local de 7 días, `--force` la ignora).
- **Guías de Hidden Potential**: editar `app/public/data/hidden_potential.json` a mano (esquema en `docs/hidden_potential_schema.md`), citando siempre el autor de la guía.

## Limitaciones conocidas

- **Imágenes**: todas (arte de unidades, marcos, iconos, banners, eventos…) se cargan en caliente desde los propios assets de dokkaninfo (hotlink directo con `referrer: no-referrer` y transporte nativo para los datos); sin conexión no hay imágenes nuevas (los datos sí, desde la caché).
- **Fechas de eventos**: dokkaninfo no publica vigencia en los listados de eventos (solo en Z-Battles/banners), así que el badge "Activo" solo aparece cuando la fuente lo permite.
- **Hidden Potential**: sin guías curated, la recomendación se calcula con el método de Playmaker a partir de la pasiva y los superataques (texto en inglés de la fuente); si la fuente no trae texto de pasiva, se usa la estimación por rol. Siempre etiquetada.
- **Sincronización**: cada comprobación reescanea el índice (`/cards`, ~12 MB) porque la fuente no expone ETag/Last-Modified; es 1 chequeo por apertura (≥15 min) y solo se **persisten** los cambios (máx. 12 fichas por corrida).
- **Semilla de unidades**: `units.index.json` empaquetado procede de la fuente original (formato compatible); las unidades nuevas de dokkaninfo entran por la sincronización en caliente.
- **APK**: instrucciones de compilación en `debug` (release requiere keystore propio); icono por defecto de Capacitor (personalizable).
- **.exe**: sin firma de código → SmartScreen puede mostrar un aviso (normal en builds locales); targets NSIS/MSI para Windows x64.
