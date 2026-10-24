import { render } from 'preact';
import App from './ui/App';
import './styles/app.css';

// Punto de montaje de la app (Fase 2: UI)
const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
