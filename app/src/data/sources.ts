/**
 * Configuración de fuentes de datos de la app.
 *
 * DATAMINE_BASE: base URL del feed datamine (JSON propio publicado, p. ej.
 * GitHub Pages tras regenerar la semilla con tools/game_sync.mjs --write y
 * hacer push). Cuando está configurada, la app se autoactualiza desde su
 * propio feed (sin fansites y sin bloqueos 403) y dokkaninfo queda como
 * respaldo y fuente de noticias/detalles.
 *
 * Vacío = feed desactivado: la app funciona exactamente como hasta ahora
 * (solo dokkaninfo). Pasos de publicación en docs/DATAMINE.md §6.
 *
 * Para probar sin recompilar (consola de la app):
 *   localStorage.setItem('dk.datamineBase', 'https://usuario.github.io/repo')
 */
export const DATAMINE_BASE = '';

/** Base efectiva del feed datamine (sin barra final); '' = desactivado. */
export function datamineBase(): string {
  try {
    const override = localStorage.getItem('dk.datamineBase');
    if (override != null) return override.trim().replace(/\/+$/, '');
  } catch {
    /* sin storage accesible → se usa la constante */
  }
  return DATAMINE_BASE.replace(/\/+$/, '');
}
