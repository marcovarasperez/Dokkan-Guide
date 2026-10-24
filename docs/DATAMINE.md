# Datos directamente del juego (datamine) — investigación y plan

> Investigación: ¿se pueden obtener los datos de DOKKAN BATTLE directamente del
> cliente del juego, sin depender de fansites (dokkaninfo/dokkan.fyi)?
> Fecha: octubre 2026 · Proyecto fan no comercial. Esto NO es asesoramiento
> legal: ver §7 (riesgos).

## 1. Veredicto

**Sí es posible — y ya está probado con una PoC real** (§2): se descargó un
volcado público de la BD del juego (de la instalación de *otro* jugador — los
archivos son idénticos en todas las instalaciones), se descifró y se leyeron
las tablas reales. Matiz importante sobre frescura y mantenimiento:

1. **Es un pipeline de PC, no algo que la app pueda hacer sola.** Android no
   permite a una app leer los archivos privados de otra (sandbox): el APK de
   esta guía **nunca** podrá descifrar "su propio" Dokkan en el móvil. Pero
   tampoco hace falta: sirve **cualquier volcado de la versión actual** (el
   tuyo, el de un emulador, o los que publica la comunidad).
2. **Es mantenimiento continuo**: cada update del juego puede cambiar cifrados
   y esquemas. Bandai ya respondió a las filtraciones tocando la "data
   download" (feb 2025) y despliega SafetyNet/Play Integrity.

## 2. PoC verificada (octubre 2026) ✅

Se ejecutó el pipeline completo de extremo a extremo en este PC, sin dispositivo:

| Paso | Resultado |
|---|---|
| Fuente | Volcado público `database.db` (531 KB) del repo `Bouncer011/Dokkan` (cliente **Global v5.23.0**; el `ver.json` del repo confirma versión y "GLOBAL") |
| Clave | Passphrase pública de 64 hex, localizada en `pawelorzech/dokkan-battle-bot` (`decryptor.py`). El decryptor clásico `bensnilloc/…Database-Decryptor` la publica truncada |
| Algoritmo | SQLCipher estilo antiguo: **página 1024 B, reserve 48 B (IV 16 + HMAC 32), PBKDF2‑HMAC‑SHA1 64000, AES‑256‑CBC**; página 1: los primeros 16 B son la sal (no se cifran) y la cabecera "SQLite format 3" se reconstruye |
| Implementación | `tools/game_sync.mjs` (entregado): Node puro (`node:crypto` + `node:sqlite`), **sin dependencias** — descifra, normaliza y valida (`PRAGMA cipher_compatibility = 3` = mismos parámetros) |
| Resultado | **137 tablas reales** del juego abiertas y consultables |

### Pipeline de producción: `tools/game_sync.mjs` ✅

Herramienta entregada que convierte cualquier `database.db` volcado en la
semilla de la app (`units.index.json` + `meta.json`, hashes FNV-1a idénticos a
`sync.mjs`). Modo análisis por defecto; `--write` para regenerar la semilla.

**Validación cruzada contra la semilla actual de dokkan.fyi** (19 unidades en
común del dump de 2018):

| Campo | Discrepancias |
|---|---|
| name, rarity, type, **class**, cost, stats (hp/atk/def max), links | **0/19** ✅ |
| leader | 11/19 — mismo contenido; el dump es de 2018 (pre-EZA) y fyi reformatea "," → " and " |
| passive | 19/19 — el dump trae el **texto crudo** del juego ("ATK +7000; attacks…\ncon salto duro"); fyi lo re-formatea en viñetas con `{passiveImg}` |

Descubrimientos clave de la validación:
- **Clase Super/Extreme = `cards.awakening_element_type`** (1=Super, 2=Extreme) — verificado 19/19.
- **Tipos**: `element % 10` → 0=AGL, 1=TEQ, 2=INT, 3=STR, 4=PHY.
- **Raridades**: 0=N, 1=R, 2=SR, 3=SSR, 4=UR, 5=LR.
- **Miniaturas**: `cdn.dokkan.fyi` las sirve por id de carta del juego
  (`card_{id}_thumb`) → `thumbnailId = cards.id`, sin dependencia de fansites.
- **Texto de pasiva**: si la semilla pasa a venir de la BD, el motor HP
  (`hp.ts`) debe normalizar el texto crudo (unir saltos duros, separar por
  ";"); el parser actual espera el formato enriquecido de fyi/dokkaninfo.

### Qué contiene la BD (esquema verificado con datos reales)

- **`cards`**: `name` (en inglés, p. ej. "Super Janemba"), `hp/atk/def` init y
  max, `rarity`, `element` (tipo AGL/STR/…), `lv_max`, `passive_skill_set_id`,
  `leader_skill_id`, **`link_skill1..7_id`**, **`card_category1..6_id`**,
  `potential_board_id`, **`open_at`** (fecha de salida real de la carta).
- **`leader_skills`**: `name` + `description` **en inglés** ("INT Type ATK +
  60%") **y** los valores estructurados (`efficacy_type1..5`, `eff1_value1..3`…).
- **`passive_skills`**: `description`, `efficacy_type`, `target_type`,
  **`probability`**, **`turn`**, `eff_value1..3` — exactamente los campos que
  necesita el motor de Hidden Potential (chances, turnos, escalados).
- **`link_skills`, `card_categories`, `card_unique_infos`, `characters`**.
- **`potential_boards`, `potential_squares`, `potential_skills`, …**: ¡los
  tableros de Hidden Potential del propio juego!
- Además: `quests`, `z_battle_stages`, `shops`, `missions`, `skill_labels`,
  `transformation_descriptions`, `effect_packs`…

### Limitación de esta muestra concreta

El dump público de Bouncer011 es un **subconjunto de prueba** (56 cartas de la
era 2016‑2018; la mayoría de tablas con 0 filas). La **estructura y el
descifrado están 100 % verificados**; para producción hace falta un dump
**completo y actual** (§6).

## 3. Cómo obtiene el juego sus datos

- Al abrir, el cliente descarga **paquetes de datos** ("Data Download", hasta
  ~1,5 GB en cambios grandes) desde servidores de Bandai.
- En el almacenamiento privado de la app quedan la **BD `database.db`**
  (SQLCipher) y paquetes **`.cpk`/`.pck`** (assets, textos de localización).
- Tras las filtraciones de 2025, Bandai **eliminó tablas de calendarios del
  cliente** ("area availables", "RM/ST battles", "shop on sale items"…) para
  que los datamines no puedan vaticinar eventos: esos datos ya no están en la
  BD (la app puede cubrirlos con dokkaninfo, como hoy).

## 4. Ecosistema de la comunidad (2025‑2026)

- **Datamines activos**: videos "DATA DOWNLOAD! JP UPDATE 5.9.0" (oct 2026),
  flair de Datamine en r/DBZDokkanBattle, etc.
- **Servidores privados vivos**: Dokkan Eclipse anuncia **6.5.0 en ago 2026**;
  Dokkan Entropy (iOS). Replican el cliente completo → dominan el formato.
- **SafetyNet**: Bandai lo despliega para bloquear mods/emuladores/privados;
  analistas temen que complique el acceso a los archivos ("data mining is
  going to halt"), aunque la comunidad sigue publicando datos en 2026
  (clientes modificados / dispositivos no afectados).
- **Fansites = consumidores de ese datamine**: dokkanstats.com, dokkandb.com,
  dokkan.fyi (fuente actual de la semilla).

## 5. Cobertura frente a las necesidades de esta app

| Necesidad de la app | ¿En la BD del juego? |
|---|---|
| Unidades: stats, líder, pasiva, SU, links, categorías, EZA/SEZA | ✅ verificado (schema real, datos reales) |
| Texto inglés de líderes/pasivas | ✅ verificado en líderes (`description`); pasivas con schema idéntico |
| Fecha de salida de cada carta | ✅ verificado (`cards.open_at`) |
| Hidden Potential (tableros del juego) | ✅ tablas `potential_*` presentes |
| Etapas/Z-Battles/drops/misiones/tienda | ✅ tablas presentes (vacías en esta muestra) |
| Calendarios de eventos ("area availables") | ❌ eliminados del cliente por Bandai (2025) |
| Noticias en vivo | ⚠ feed de servidores de Bandai → seguir con dokkaninfo |
| Rankings propios de dokkaninfo (partners) | ❌ cálculos de la web (recalculables en la app) |

## 6. Qué falta para producción

1. **Dump completo y actual** (único paso manual):
   - **Desde tu móvil** (fuente que controlas): cable USB + "Depuración USB"
     activada → `adb shell pm list packages | findstr -i dokkan` (paquete del
     juego) → `adb pull /sdcard/Android/data/<paquete>/files ./game_files` →
     buscar `database.db` en el volcado. (Si el cliente guarda en almacenamiento
     interno `/data/data/` hace falta root; con SafetyNet el juego puede negarse
     a arrancar en móviles con root — probar primero.)
   - **De la comunidad**: los dataminers/privados (Discord de datamines,
     servidores privados tipo Eclipse) publican datos tras cada "data download".
2. ✅ **`tools/game_sync.mjs` entregado**: descarga/lectura del dump →
   descifrado (params verificados) → normalización a `units.index.json`/
   `meta.json` (mismo esquema y hashes FNV-1a) → validación automática contra
   la semilla actual. Con un dump completo quedan por perfilar los campos
   [FULL]: EZA/SEZA (detección de cartas de EZA), `hpGains` (tablas
   `potential_*`) y active/standby skills (`specials`/`card_specials`).
3. **Publicar los JSON** — ya hay configuración lista en el proyecto:
   - `.github/workflows/datamine-pages.yml` publica `units.index.json` +
     `meta.json` (+ índices auxiliares) en **GitHub Pages** con cada push que
     toque `app/public/data/` (sin Cloudflare, CORS abierto, gratis).
   - Pasos (una sola vez): crea el repo en GitHub, sube el proyecto y activa
     Settings → Pages → Source = "GitHub Actions".
   - Flujo recurrente: `node tools/game_sync.mjs <dump> --write` → commit +
     push → el feed se publica solo.
   - Activa el feed en la app: fija la URL en `app/src/data/sources.ts`
     (`DATAMINE_BASE = 'https://<usuario>.github.io/<repo>'`) y recompila.
     La app ya está cableada: el feed es la fuente **primaria** de
     autoactualización (meta.json ~30 KB por comprobación; units.index.json
     solo si hay cambios) y dokkaninfo queda como respaldo/noticias. Incluye
     guarda anti-incompleto (>10 % menos unidades → no aplica) y el scope de
     Tauri ya permite `*.github.io`.
4. **Mantenimiento**: repetir el paso 1 tras cada data download del juego
   (minutos cuando el pipeline funciona); riesgo de rotura por cambios de
   formato (ya ocurrió en 2025).

## 7. Riesgos

- **ToS/copyright**: ingeniería inversa prohibida por Bandai; los textos son
  copyright de Bandai/Bird Studio/Toei. Uso personal = práctica habitual;
  **redistribuirlos empaquetados en un APK** sube la exposición frente a un
  fansite web.
- **SafetyNet**: puede cortar el acceso a archivos desde dispositivos normales
  → depender del ecosistema de dumps de la comunidad.
- **Rotura por update**: clave/esquema pueden cambiar; mitigación = seguir la
  práctica de la comunidad (los privados lo resuelven cada versión).
- **Frescura**: un dump manual solo se actualiza cuando alguien lo refresca.

## 8. Comparativa con la solución 403 ya preparada

| | Fix 403 (dokkaninfo + respaldo dokkan.fyi) | Datamine directo |
|---|---|---|
| Esfuerzo | ya listo, solo compilar | pipeline de ingesta + fuente de dumps (1‑2 días + acoplar al ritmo de la comunidad) |
| Actualización automática en la app | ✅ sin intervención | ⚠ requiere paso de PC por cada data download |
| Independencia de fansites | parcial (fyi = datamine publicado) | total |
| Riesgo legal | nulo | zona gris ToS/copyright |
| Riesgo de rotura | bajo | medio (cada update del juego) |

**Recomendación por fases**:
1. **Fase 1 (en cola)**: tarjeta HP mínima + fix 403 definitivo → APK.
2. **Fase 2 (hecha)**: PoC de descifrado ✅ + **`tools/game_sync.mjs` entregado y
   validado** (0 discrepancias en campos núcleo vs dokkan.fyi).
3. **Fase 3 (pendiente de dump completo)**: perfilar campos [FULL] (EZA/SEZA,
   hpGains, actives) + normalizar texto crudo en hp.ts + JSON publicado →
   autoupdate propio sin 403.
