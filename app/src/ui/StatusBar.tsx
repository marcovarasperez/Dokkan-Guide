import { syncState, manualRefresh } from '../data/sync';
import { formatDateTime } from '../data/format';

interface StatusBarProps {
  /** Timestamp ms de la última sincronización exitosa (null si nunca). */
  updatedAt: number | null;
}

/** Chip de estado de sincronización + botón de actualización manual. */
export default function StatusBar({ updatedAt }: StatusBarProps) {
  const s = syncState.value;
  const checking = s.phase === 'checking';
  const lastOk = s.lastSuccessAt ?? updatedAt;

  let label: string;
  let tone = '';
  switch (s.phase) {
    case 'checking':
      label = 'Actualizando…';
      break;
    case 'updated':
      label = `Actualizado · ${s.message || `+${s.newUnits} nuevas, ${s.changedUnits} modificadas`}`;
      tone = 'status-chip--ok';
      break;
    case 'up-to-date':
      label = 'Al día';
      tone = 'status-chip--ok';
      break;
    case 'error':
      // Muestra la causa real (p. ej. "Error HTTP 403") si la hay.
      label = s.message && s.message !== 'Sin conexión'
        ? `${s.message} — mostrando caché`
        : 'Sin conexión — mostrando caché';
      tone = 'status-chip--error';
      break;
    default:
      label = lastOk ? `Última actualización: ${formatDateTime(lastOk)}` : 'Sin actualizar aún';
  }

  return (
    <div class="status-bar" role="status" aria-live="polite">
      <span class={`status-chip${tone ? ` ${tone}` : ''}`}>
        {checking && <span class="status-chip__spinner" aria-hidden="true" />}
        {label}
      </span>
      <button
        type="button"
        class="status-bar__refresh"
        disabled={checking}
        onClick={() => {
          manualRefresh().catch(() => {
            /* el chip refleja el error */
          });
        }}
      >
        ⟳ Actualizar
      </button>
    </div>
  );
}
