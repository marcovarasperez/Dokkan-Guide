import { render } from 'preact';
import App from './view/App';
import { initNotificationChannel } from './model/notifications';
import './styles/app.css';

// Punto de montaje de la app (Fase 2: UI)
const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}

// Inicializar canal de notificaciones (Android) SIN pedir permiso aún
// El permiso se pedirá tras la primera sincronización desde la pantalla de onboarding
void (async () => {
  await initNotificationChannel();
})();
