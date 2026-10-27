import { manualRefresh } from '../model/sync';

export function SettingsView() {
  const handleRefresh = async () => {
    await manualRefresh();
  };

  return (
    <section class="settings-view">
      <header class="view-header">
        <h1>Ajustes</h1>
        <p class="view-desc">Configura el comportamiento de la aplicación.</p>
      </header>

      {/* Actualización de datos */}
      <section class="settings-section">
        <h2>Datos</h2>
        <p class="settings-desc">
          Los datos se obtienen directamente de <strong>dokkaninfo.com</strong> y se actualizan
          automáticamente al abrir la app y cada 5 minutos.
        </p>
        <button class="btn btn-primary" onClick={handleRefresh}>
          🔄 Forzar actualización ahora
        </button>
      </section>

      {/* Info de la app */}
      <section class="settings-section">
        <h2>Información</h2>
        <div class="settings-info">
          <div class="info-row">
            <span>Versión</span>
            <span>0.4.1</span>
          </div>
          <div class="info-row">
            <span>Fuente de datos</span>
            <span>DOKKANINFO (dokkaninfo.com)</span>
          </div>
          <div class="info-row">
            <span>Modo</span>
            <span class="mode-online">🌐 Online</span>
          </div>
        </div>
      </section>

      {/* Aviso legal */}
      <section class="settings-section settings-legal">
        <p>
          Proyecto fan no comercial. No afiliado a Bandai Namco ni Akatsuki.
          Datos obtenidos de fuentes públicas de la comunidad.
        </p>
      </section>
    </section>
  );
}

// Funciones stub para compatibilidad (no usadas en modo online-only)
export const onlineMode = { value: 'online' as const };
export const loadOnlineMode = async () => 'online';
export const setOnlineMode = async () => {};
export const isOnlineMode = () => true;