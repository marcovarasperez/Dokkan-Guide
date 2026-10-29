import { useSignal, useSignalEffect } from '@preact/signals';
import { manualRefresh, syncState } from '../model/sync';
import { getUpdatedAt, getUnitsForList, loadRepository } from '../model/repository';
import { formatDate } from '../model/date';

export function SettingsView() {
  const [lastSync, setLastSync] = useSignal<string>('—');
  const [unitCount, setUnitCount] = useSignal<number>(0);

  const handleRefresh = async () => {
    await manualRefresh();
  };

  // Cargar info al montar y cuando cambia el estado de sincronización
  useSignalEffect(() => {
    syncState.value; // suscripción reactiva a cambios de sync
    const at = getUpdatedAt();
    setLastSync(at ? formatDate(at) : 'Nunca');
    // Actualizar contador de unidades
    setUnitCount(getUnitsForList().length);
  });

  // También actualizar contador cuando se cargue el repositorio
  useSignalEffect(() => {
    loadRepository(); // solo para suscribirse a la carga
    setUnitCount(getUnitsForList().length);
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
            <span>{lastSync}</span>
          </div>
          <div class="info-row">
            <span>Personajes en lista</span>
            <span>{unitCount || '—'}</span>
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
        <label class="setting-toggle">
          <input type="checkbox" checked={true} disabled />
          <span>Modo oscuro (sigue al sistema)</span>
        </label>
        <label class="setting-toggle">
          <input type="checkbox" checked={true} disabled />
          <span>Animaciones de cartas (LWF)</span>
        </label>
      </section>

      {/* Datos y caché */}
      <section class="settings-section">
        <h2>Datos y caché</h2>
        <p class="settings-desc">Fuente única: <strong>dokkaninfo.com</strong> (catálogo + fichas).</p>
        <button class="btn btn-secondary" onClick={() => { if (confirm('Borrar caché local y recargar semilla?')) location.reload(); }}>
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
    </section>
  );
}

// Stubs compatibilidad
export const onlineMode = { value: 'online' as const };
export const loadOnlineMode = async () => 'online';
export const setOnlineMode = async () => {};
export const isOnlineMode = () => true;