/**
 * Animación de la CARTA (el <canvas> que reemplaza al arte estático).
 *
 * dokkaninfo anima la ficha con el motor LWF (Lightweight SWF) de los propios
 * assets del juego: descarga `character/card_bg/{assetId}/card_{assetId}.lwf`
 * y sus 42 texturas, y las pinta en un <canvas> de 426×568.
 *
 * Aquí se replica ese flujo con dos piezas que la app ya tiene:
 *
 *  1. el MOTOR (`public/vendor/lwf.js`) es el IIFE del bundle de dokkaninfo,
 *     extraído con `tools/lwf_extract.mjs` y cargado una sola vez;
 *  2. el .lwf se baja con NUESTRO transporte (`fetchInfoBytes` → proxy /dinfo
 *     en dev, Tauri/Capacitor en prod) y se entrega al motor ya montado en su
 *     caché, porque su XHR directo a dokkaninfo se pierde en CORS (la fuente
 *     no envía Access-Control-Allow-Origin).
 *
 * Las texturas sí las pide el navegador en caliente: con `referrer` anulado
 * (meta que instala este módulo) el CDN las sirve sin bloquear el hotlink.
 * Si algo falla (motor, .lwf o texturas) la promesa se rechaza y la vista
 * se queda con el arte estático de detrás, que nunca se desmonta.
 */
import { fetchInfoBytes } from './http';

/** Tamaño del lienzo (el mismo que usa dokkaninfo). */
const CARD_W = 426;
const CARD_H = 568;

/** URL absoluta de los assets de animación (de aquí salen las texturas). */
const ANIM_ASSET = 'https://dokkaninfo.com/assets/global/en/character/card_bg';
/** Ruta relativa para el transporte (proxy en dev, nativo en producción). */
const ANIM_PATH = '/assets/global/en/character/card_bg';

/** Tope de espera de la carga (motor + .lwf + 42 texturas). */
const LOAD_TIMEOUT_MS = 45000;

/** API mínima del motor que usa este módulo (el resto queda sin tipar). */
interface LwfInstance {
  active?: boolean;
  exec(dt: number): void;
  render(): void;
  destroy(): void;
  rootMovie?: {
    attachMovie(name: string, linkage: string): unknown;
    moveTo(x: number, y: number): unknown;
  };
}

interface LwfCacheEntry {
  data?: unknown;
  instances?: Record<string, LwfInstance>;
}

interface LwfOptions {
  lwf: string;
  prefix: string;
  stage: HTMLCanvasElement;
  fitForHeight: number;
  fitForWidth: number;
  useAlwaysAdditionalColorShader: boolean;
  error?: { url: string; reason: string }[];
  onload: (instance: LwfInstance | null) => void;
}

/** Datos parseados de un .lwf (solo se usa `check()` para validarlos). */
interface LwfData {
  check?: () => boolean;
}

interface LwfEngine {
  useCanvasRenderer(): unknown;
  Loader: { loadArrayBuffer(buffer: ArrayBuffer): LwfData | null };
  ResourceCache: {
    get(): {
      cache: Record<string, LwfCacheEntry>;
      loadLWF(options: LwfOptions): unknown;
    };
  };
}

declare global {
  interface Window {
    LWF?: LwfEngine;
  }
}

let enginePromise: Promise<LwfEngine> | null = null;

/**
 * Carga perezosa del motor (una sola vez por sesión).
 *
 * Es un script clásico porque el IIFE de dokkaninfo espera ejecutarse con
 * `window`/`document` a mano y expone `window.LWF`.
 */
function loadLWFEngine(): Promise<LwfEngine> {
  if (window.LWF) return Promise.resolve(window.LWF);
  if (enginePromise) return enginePromise;
  enginePromise = new Promise<LwfEngine>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/lwf.js';
    script.async = true;
    const fail = (msg: string): void => {
      script.remove();
      enginePromise = null;
      reject(new Error(msg));
    };
    script.onload = () => {
      if (window.LWF) resolve(window.LWF);
      else fail('El motor LWF no expuso window.LWF');
    };
    script.onerror = () => fail('No se pudo cargar /vendor/lwf.js');
    document.head.appendChild(script);
  });
  return enginePromise;
}

/**
 * Pide al documento que NO envíe `Referer`: el CDN de dokkaninfo sirve las
 * texturas cuando la petición viene sin referencia ajena y devuelve el HTML
 * de bloqueo cuando viene de otro origen (comprobado en oct-2026).
 */
function ensureNoReferrer(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
  } else if (meta.content !== 'no-referrer') {
    meta.content = 'no-referrer';
  }
}

/** Rutas del .lwf de una carta (assetId = icon_id del datajson). */
const animPaths = (assetId: number): { file: string; prefix: string; path: string } => ({
  file: `card_${assetId}.lwf`,
  prefix: `${ANIM_ASSET}/${assetId}/`,
  path: `${ANIM_PATH}/${assetId}/card_${assetId}.lwf`,
});

/**
 * Arranca la animación de la carta en `canvas` y devuelve su liberador.
 *
 * La promesa se resuelve cuando el motor ya tiene el primer fotograma listo
 * (texturas incluidas) y se rechaza si algo falla: en ese caso la vista no
 * debe pintar el lienzo y se queda con el arte estático.
 */
export async function startCardAnim(
  canvas: HTMLCanvasElement,
  assetId: number,
  isCancelled: () => boolean = () => false,
): Promise<() => void> {
  ensureNoReferrer();
  const engine = await loadLWFEngine();
  if (isCancelled()) throw new Error('Animación cancelada');
  const { file, prefix, path } = animPaths(assetId);
  const url = `${prefix}${file}`; // clave de caché = URL que arma el motor

  engine.useCanvasRenderer();
  const cache = engine.ResourceCache.get();

  // El .lwf ya parseado se reutiliza entre visitas: solo se descarga la
  // primera vez (el XHR del motor nunca llega a hacerlo por CORS).
  let entry = cache.cache[url];
  let data: LwfData | null | undefined = entry?.data as LwfData | undefined;
  if (!data) {
    const bytes = await fetchInfoBytes(path);
    if (isCancelled()) throw new Error('Animación cancelada');
    data = engine.Loader.loadArrayBuffer(bytes);
    if (!data || (data.check && !data.check())) throw new Error('El .lwf no es válido');
    entry = cache.cache[url] ?? (cache.cache[url] = {});
    entry.data = data;
  }

  canvas.width = CARD_W;
  canvas.height = CARD_H;

  return await new Promise<() => void>((resolve, reject) => {
    let instance: LwfInstance | null = null;
    let rafId = 0;
    let disposed = false;
    let settled = false;
    let last: number | null = null;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };

    /** Para el bucle y libera la instancia del motor (sin tocar la promesa). */
    const stop = (): void => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      clearTimeout(timer);
      try {
        instance?.destroy();
      } catch {
        /* el motor ya había liberado el lienzo */
      }
      instance = null;
    };

    const cleanup = (): void => {
      stop();
      // Si la vista se desmontó antes de que la carga terminara, la promesa
      // se cierra igualmente para no dejar colgada la espera.
      settle(() => reject(new Error('Animación cancelada')));
    };

    const fail = (reason: string): void => {
      stop();
      settle(() => reject(new Error(reason)));
    };

    const loop = (ts: number): void => {
      if (disposed) return;
      rafId = requestAnimationFrame(loop);
      if (instance && instance.active !== false) {
        // Primer fotograma a Δt=0 (empezar la animación, no saltarla) y luego
        // tiempo real con tope para que una pestaña en segundo plano no la
        // acelere de golpe.
        const dt = last === null ? 0 : Math.min((ts - last) / 1000, 0.1);
        last = ts;
        instance.exec(dt);
        instance.render();
      }
    };

    const timer = setTimeout(() => fail('Tiempo de espera agotado'), LOAD_TIMEOUT_MS);

    const options: LwfOptions = {
      lwf: file,
      prefix,
      stage: canvas,
      fitForHeight: CARD_H,
      fitForWidth: CARD_W,
      useAlwaysAdditionalColorShader: true,
      onload: (loaded) => {
        clearTimeout(timer);
        if (disposed || settled) {
          loaded?.destroy();
          return;
        }
        if (isCancelled()) {
          // La vista ya no quiere esta carta: se destruye sin pintar y la
          // promesa se cierra para no dejar la espera colgada.
          loaded?.destroy();
          cleanup();
          return;
        }
        if (!loaded) {
          fail('El motor no pudo montar la animación');
          return;
        }
        // Una textura ausente deja la carta a medias: mejor el arte estático.
        const errors = options.error ?? [];
        if (errors.length > 0) {
          loaded.destroy();
          fail(`No se pudieron cargar ${errors.length} textura(s)`);
          return;
        }
        loaded.rootMovie?.attachMovie('ef_001', 'ef_001');
        loaded.rootMovie?.moveTo(CARD_W, CARD_H);
        instance = loaded;
        rafId = requestAnimationFrame(loop);
        settle(() => resolve(cleanup));
      },
    };

    try {
      cache.loadLWF(options);
    } catch (e) {
      clearTimeout(timer);
      fail(e instanceof Error ? e.message : 'Error cargando la animación');
    }
  });
}
