/**
 * Vista "Info": información sobre la app, créditos, legal, etc.
 */
export default function InfoView() {
  return (
    <div class="feed-scroll">
      <div class="feed feed--banners">
        <div class="feed__head">
          <h2>Info</h2>
        </div>

        <div class="info-section">
          <h3>Dokkan Fan Guide</h3>
          <p>Guía no oficial para Dragon Ball Z Dokkan Battle (versión Global).</p>
          <p>Datos proporcionados por <a href="https://dokkaninfo.com" target="_blank" rel="noopener">DokkanInfo.com</a>.</p>
        </div>

        <div class="info-section">
          <h3>Versión</h3>
          <p id="app-version">Cargando…</p>
        </div>

        <div class="info-section">
          <h3>Enlaces</h3>
          <ul>
            <li><a href="https://dokkaninfo.com" target="_blank" rel="noopener">DokkanInfo.com</a></li>
            <li><a href="https://dbz-dokkan.bn-ent.net" target="_blank" rel="noopener">Sitio oficial de Dokkan Battle</a></li>
            <li><a href="https://github.com" target="_blank" rel="noopener">Código fuente (GitHub)</a></li>
          </ul>
        </div>

        <div class="info-section">
          <h3>Legal</h3>
          <p>Proyecto fan no comercial. No afiliado a Bandai Namco, Akatsuki o DokkanInfo.</p>
          <p>Todos los nombres, imágenes y datos de personajes son propiedad de sus respectivos dueños.</p>
          <p>Dragon Ball Z Dokkan Battle © BANDAI NAMCO Entertainment Inc. / Akatsuki Inc.</p>
        </div>

        <div class="info-section">
          <h3>Créditos</h3>
          <ul>
            <li>Datos: <a href="https://dokkaninfo.com" target="_blank" rel="noopener">DokkanInfo</a></li>
            <li>Desarrollo: Proyecto comunitario</li>
            <li>Tecnologías: Preact, Tauri, TypeScript, Vite, Rust</li>
          </ul>
        </div>
      </div>
    </div>
  );
}