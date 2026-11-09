/**
 * Tema de la aplicación (dark/light) — fuente única de verdad para leer,
 * aplicar y guardar el tema (lo usan `App` al arrancar y `SettingsView`).
 */

/** Temas disponibles. */
export type Theme = 'dark' | 'light';

/** Lee el tema guardado o usa 'dark' por defecto. */
export function getSavedTheme(): Theme {
  try {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}
  return 'dark';
}

/** Aplica el tema al documento. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/** Aplica el tema al documento y lo guarda. */
export function saveTheme(theme: Theme): void {
  applyTheme(theme);
  try { localStorage.setItem('theme', theme); } catch {}
}
