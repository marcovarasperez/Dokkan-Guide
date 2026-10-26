import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { spawn } from 'node:child_process';

// Fan project. Los datos viven en dokkaninfo.com (fetch en caliente con
// transporte nativo en el empaquetado); el arte de las unidades (thumbnails,
// marcos, iconos) se sirve en caliente desde el CDN de assets para que el
// WebView lo cachee. Nada de eso se redistribuye en el bundle.

const INFO_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/**
 * Proxy local delegado a curl.exe (solo desarrollo).
 *
 * Motivo: Cloudflare de dokkaninfo devuelve HTTP 403 al TLS de Node aunque las
 * cabeceras sean de navegador; curl (propio stack TLS + HTTP2) pasa siempre.
 * Set de cabeceras VERIFICADO en oct-2026: solo UA + Accept-Language → 200.
 * Añadir client-hints (sec-ch-ua / sec-fetch-*) con el TLS de curl empeora el
 * score de Cloudflare y vuelve a dar 403, así que no se envían.
 *
 * En el empaquetado no hace falta: el transporte nativo (Tauri/Capacitor) no
 * sufre ese bloqueo. La respuesta se reenvía con su status y content-type
 * originales (recuperados con `-w` al final del cuerpo).
 */
/** Respuesta local mínima que usa el proxy (evita depender de @types/node). */
interface ProxyRes {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: Uint8Array): void;
}

function curlProxy(prefix: string, target: string): Plugin {
  const middleware = (req: { url?: string }, res: ProxyRes) => {
    const url = `${target}${req.url ?? '/'}`;
    const args = [
      '-sS', '--compressed',
      '-A', INFO_UA,
      '-H', 'accept-language: en-US,en;q=0.9',
      '--max-time', '120',
      '-w', '\n__DKMETA__%{http_code}|%{content_type}',
      url,
    ];
    const chunks: Buffer[] = [];
    const child = spawn('curl.exe', args, { windowsHide: true });
    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.stderr.on('data', () => { /* diagnóstico de curl: se ignora */ });
    child.on('error', () => {
      res.statusCode = 502;
      res.end('curl.exe no disponible en el PATH');
    });
    child.on('close', () => {
      // Los cuerpos pueden ser binarios (PNG/JPEG): NO se recodifican.
      // Convertir a texto UTF-8 destruía las imágenes (bytes ≥ 0x80 → U+FFFD)
      // y el <img> no podía decodificarlas; todo se manipula como Buffer.
      const buf = Buffer.concat(chunks);
      const marker = Buffer.from('\n__DKMETA__');
      const idx = buf.lastIndexOf(marker);
      const meta = (idx >= 0 ? buf.subarray(idx) : Buffer.from('\n__DKMETA__502|text/plain'))
        .toString('utf8')
        .split('|');
      const code = Number(meta[0].replace('\n__DKMETA__', '')) || 502;
      res.statusCode = code;
      res.setHeader('content-type', meta[1] || 'text/plain; charset=utf-8');
      res.end(idx >= 0 ? buf.subarray(0, idx) : buf);
    });
  };

  const attach = (server: { middlewares: { use: (path: string, fn: typeof middleware) => void } }) => {
    server.middlewares.use(prefix, middleware);
  };

  return {
    name: `${prefix.slice(1)}-curl-proxy`,
    configureServer(server) {
      attach(server);
    },
    // `vite preview` (4173) monta el MISMO proxy: sin él, la app construida
    // pediría dokkaninfo.com en directo y CORS dejaría la ficha sin datos.
    configurePreviewServer(server) {
      attach(server);
    },
  };
}

export default defineConfig({
  plugins: [
    preact(),
    curlProxy('/dinfo', 'https://dokkaninfo.com'),
    // Respaldo dokkan.fyi (páginas Inertia HTML+JSON, sin CORS) — solo dev.
    curlProxy('/dfyi', 'https://dokkan.fyi'),
  ],
  server: {
    host: true,
    port: 5173,
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
