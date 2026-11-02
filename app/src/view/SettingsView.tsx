import { useSignal, useSignalEffect } from '@preact/signals';
import { manualRefresh, syncState } from '../model/sync';
import { getUpdatedAt, getUnitsForList, loadRepository } from '../model/repository';
import { formatDateTime } from '../model/date';
import { clearCacheAndReload } from '../model/cache';

/** Temas disponibles */
type Theme = 'dark' | 'light';

/** Lee el tema guardado o usa 'dark' por defecto */
function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}
  return 'dark';
}

/** Lee la preferencia de animaciones */
function getInitialAnimations(): boolean {
  try {
    const stored = localStorage.getItem('animations');
    return stored !== 'false'; // true por defecto
  } catch {}
  return true;
}

/** Aplica el tema al documento y lo guarda */
function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('theme', theme); } catch {}
}

/** Guarda la preferencia de animaciones */
function saveAnimations(enabled: boolean): void {
  try { localStorage.setItem('animations', String(enabled)); } catch {}
}

export function SettingsView() {
  const lastSync = useSignal<string>('—');
  const unitCount = useSignal<number>(0);
  const theme = useSignal<Theme>(getInitialTheme());
  const animationsEnabled = useSignal<boolean>(getInitialAnimations());
  const showCacheModal = useSignal<boolean>(false);

  const handleRefresh = async () => {
    await manualRefresh();
  };

  const handleThemeChange = (newTheme: Theme) => {
    theme.value = newTheme;
    applyTheme(newTheme);
  };

  const handleAnimationsChange = (enabled: boolean) => {
    animationsEnabled.value = enabled;
    saveAnimations(enabled);
    // Aplicar/quitar clase global para desactivar animaciones CSS
    document.documentElement.classList.toggle('no-animations', !enabled);
  };

  // Aplicar tema y animaciones al montar
  useSignalEffect(() => {
    applyTheme(theme.value);
  });

  useSignalEffect(() => {
    document.documentElement.classList.toggle('no-animations', !animationsEnabled.value);
  });

  // Cargar info al montar y cuando cambia el estado de sincronización
  useSignalEffect(() => {
    syncState.value; // suscripción reactiva a cambios de sync
    const at = getUpdatedAt();
    lastSync.value = at ? formatDateTime(Math.floor(at / 1000)) : 'Nunca';
    unitCount.value = getUnitsForList().length;
  });

  // También actualizar contador cuando se cargue el repositorio
  useSignalEffect(() => {
    void loadRepository().then(() => {
      unitCount.value = getUnitsForList().length;
    });
  });

  return (
    <section class="settings-view">
      <header class="view-header">
        <h1>Ajustes</h1>
        <p class="view-desc">Configura el comportamiento de la aplicación.</p>
      </header>

      {/* Estado de sincronización */}
      <section class="settings-section">
        <h2>Sincronización</h2>
        <div class="settings-info">
          <div class="info-row">
            <span>Última sincronización</span>
            <span>{lastSync.value}</span>
          </div>
          <div class="info-row">
            <span>Personajes en lista</span>
            <span>{unitCount.value || '—'}</span>
          </div>
          <div class="info-row">
            <span>Estado</span>
            <span class={`status-${syncState.value.phase}`}>{syncState.value.message || syncState.value.phase}</span>
          </div>
        </div>
        <button class="btn btn-primary" onClick={handleRefresh} disabled={syncState.value.phase === 'checking'}>
          {syncState.value.phase === 'checking' ? '⏳ Comprobando…' : '🔄 Forzar actualización ahora'}
        </button>
        <p class="settings-hint">La app sincroniza automáticamente al abrir y cada 5 minutos.</p>
      </section>

      {/* Apariencia */}
      <section class="settings-section">
        <h2>Apariencia</h2>

        {/* Selector de tema como toggle switch */}
        <div class="settings-option">
          <div class="settings-option__info">
            <h3>Tema de color</h3>
            <p>Modo oscuro (predeterminado) o modo claro.</p>
          </div>
          <label class="mode-toggle" aria-label="Cambiar tema">
            <input
              type="checkbox"
              checked={theme.value === 'light'}
              onChange={(e) => handleThemeChange((e.currentTarget as HTMLInputElement).checked ? 'light' : 'dark')}
            />
            <span class="mode-toggle__slider"></span>
          </label>
          <span class="mode-toggle__label">
            {theme.value === 'dark' ? '🌙 Oscuro' : '☀️ Claro'}
          </span>
        </div>

        {/* Checkbox de animaciones */}
        <div class="settings-option">
          <div class="settings-option__info">
            <h3>Animaciones de cartas (LWF)</h3>
            <p>Activa/desactiva las animaciones de ilustración en las fichas.</p>
          </div>
          <label class="setting-checkbox">
            <input
              type="checkbox"
              checked={animationsEnabled.value}
              onChange={(e) => handleAnimationsChange((e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="setting-checkbox__slider"></span>
          </label>
          <span class="setting-checkbox__label">
            {animationsEnabled.value ? 'Activadas' : 'Desactivadas'}
          </span>
        </div>
      </section>

      {/* Datos y caché */}
      <section class="settings-section">
        <h2>Datos y caché</h2>
        <p class="settings-desc">Fuente única: <strong>dokkaninfo.com</strong> (catálogo + fichas).</p>
        <button class="btn btn-danger" onClick={() => { showCacheModal.value = true; }}>
          🗑️ Limpiar caché y recargar
        </button>
      </section>

      {/* Información */}
      <section class="settings-section">
        <h2>Información</h2>
        <div class="settings-info">
          <div class="info-row"><span>Versión</span><span>0.4.1</span></div>
          <div class="info-row"><span>Fuente</span><span>DOKKANINFO (dokkaninfo.com)</span></div>
          <div class="info-row"><span>Modo</span><span class="mode-online">🌐 Online + caché offline</span></div>
        </div>
      </section>

      {/* Legal */}
      <section class="settings-section settings-legal">
        <p>Proyecto fan no comercial. No afiliado a Bandai Namco ni Akatsuki.</p>
        <p>Datos de dokkaninfo.com — © sus respectivos autores.</p>
        <p><a href="https://github.com" target="_blank" rel="noopener">Código abierto en GitHub</a></p>
      </section>

      {/* Modal confirmación limpiar caché */}
      {showCacheModal.value && (
        <div class="modal-overlay" onClick={() => { showCacheModal.value = false; }}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Confirmar limpieza de caché</h3>
            <p>Se borrarán todos los datos locales (semilla de unidades, noticias, banners) y la app recargará desde cero descargando la última versión de <strong>dokkaninfo.com</strong>.</p>
            <p class="modal-warning">Esta acción no se puede deshacer.</p>
            <div class="modal-actions">
              <button class="btn btn-secondary" onClick={() => { showCacheModal.value = false; }}>
                Cancelar
              </button>
              <button class="btn btn-danger" onClick={() => { clearCacheAndReload(); }}>
                🗑️ Sí, limpiar y recargar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}