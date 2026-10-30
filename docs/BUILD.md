# Compilación: APK (Android) y .exe (Windows)

Proyecto fan no comercial · Datos: DOKKANINFO.COM

La app es una SPA (**Vite + TypeScript + Preact**) y se empaqueta en dos shells:

| Salida | Shell | Proyecto |
|---|---|---|
| **APK** (Android) | Capacitor 8 | `app/android` (Gradle) |
| **.exe** (Windows) | Tauri 2 | `app/src-tauri` (Rust) |

En ambos casos, `app/src/model/http.ts` detecta el shell en runtime y usa el transporte
**nativo sin CORS** (CapacitorHttp / tauri-plugin-http) mediante import dinámico — en web
solo corre el proxy de desarrollo. El build web (`dist/`) es la base de los dos shells.

> Nota: el `dist/` servido como web pura **no puede sincronizar** (la fuente no envía
> cabeceras CORS) y funciona con los seeds empaquetados; los shells nativos (APK/.exe)
> sí sincronizan en vivo con sus transportes nativos.

## Requisitos comunes

- **Node.js ≥ 18** (probado con 24). En PowerShell con política de ejecución restrictiva, usar `npm.cmd` / `npx.cmd`.
- Datos al día antes de compilar: `node tools\sync.mjs` (regenera seeds, incluido `news.seed.json`).

---

## 1) APK (Android) — Capacitor 8

### Instalación única

1. **JDK 21** (lo exige Capacitor 8; Android Studio ya lo incluye) — p. ej. `winget install Microsoft.OpenJDK.21`.
2. **Android Studio** (incluye SDK + platform-tools) o Android SDK solo con `cmdline-tools`.
3. Variables: `ANDROID_HOME` apuntando al SDK (Android Studio las configura). **Alternativa** (usada en esta máquina, donde `ANDROID_HOME` está vacío): crear `app/android/local.properties` con `sdk.dir=C:/Users/<usuario>/AppData/Local/Android/Sdk` — Gradle lo lee directamente. `versionName`/`versionCode` del APK se fijan en `app/android/app/build.gradle` (mantenerlos en sincronía con la versión de `package.json`).
4. Aceptar licencias: `sdkmanager --licenses`.
5. (Opcional) Dispositivo o emulador con depuración USB activada.

### Compilar

```powershell
cd app
npm.cmd install            # primera vez
npm.cmd run build          # vite build → dist/
npx.cmd cap sync android   # copia dist/ + plugins al proyecto Gradle (o: npm run cap:sync)

cd android
.\gradlew.bat assembleDebug
# → android\app\build\outputs\apk\debug\app-debug.apk
```

Instalar en un dispositivo conectado:

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

**Alternativa gráfica**: `npx.cmd cap open android` → Android Studio → *Build ▸ Build APK(s)*.

### Release (opcional)

```powershell
# 1) Crear keystore una vez:
keytool -genkey -v -keystore dokkan-fan.keystore -alias dokkan -keyalg RSA -keysize 2048 -validity 10000
# 2) Configurar signingConfig en android\app\build.gradle (storeFile/storePassword/keyPassword)
.\gradlew.bat assembleRelease
```

### Notas APK

- Icono por defecto de Capacitor; para personalizar, sustituye los `mipmap-*` de
  `android\app\src\main\res\` (hay variantes generadas en `app\src-tauri\icons\android\mipmap-*`, reutilizables).
- **Obligatorio** ejecutar `npx cap sync android` tras cada `npm run build` (sino, el APK lleva la app antigua).
- El transporte nativo (`CapacitorHttp` de `@capacitor/core`) se activa solo al correr dentro del shell.

---

## 2) .exe (Windows) — Tauri 2

### Instalación única

1. **Rust** (toolchain estable): `winget install Rustlang.Rustup` — o <https://rustup.rs>. Reiniciar la terminal.
2. **Microsoft C++ Build Tools** con el componente *“Desktop development with C++”*
   (si hay Visual Studio Community: *Individual components ▸ MSVC v143 + Windows SDK*).
   Atajo para el SDK (no incluye el compilador): `winget install Microsoft.WindowsSDK.10.0.26100`.
   Verificación: `cargo --version` y que exista `link.exe` del MSVC en el *Developer Command Prompt*.
3. **WebView2 Runtime** (incluido de serie en Windows 11; en 10: <https://developer.microsoft.com/microsoft-edge/webview2/>).

### Compilar

```powershell
cd app
npx.cmd tauri build --no-bundle
```

Salida:

- **Ejecutable portable**: `src-tauri\target\release\dokkan-fan-guide.exe`

> `--no-bundle` salta el paso de empaquetado: **no se generan instaladores
> NSIS/MSI** (decisión del usuario — nada de setup; solo el `.exe` portable
> y el APK).

Desarrollo con recarga en caliente (levanta Vite automáticamente):

```powershell
npm.cmd run tauri dev
```

### Notas .exe

- **Primera compilación**: descarga ~300 crates ≈ 3-10 min; compilaciones posteriores ≈ 1-3 min.
- Config: `src-tauri/tauri.conf.json` (ventana, targets `["nsis","msi"]`, CSP abierta para el CDN de imágenes).
- Permisos: `src-tauri/capabilities/default.json` incluye `http:default` (transporte a dokkaninfo.com).
- Iconos regenerables: `npx tauri icon ruta\icon-1024.png`.
- Sin firma de código → SmartScreen puede avisar al ejecutar (esperable en builds locales).

---

## 3) Datos al recompilar

- **Seeds empaquetados** (units/news/etc.): `node tools\sync.mjs` → `npm run build` → recompilar shell.
- **Guías de Hidden Potential**: editar `app/public/data/hidden_potential.json` a mano (`docs/hidden_potential_schema.md`).
- En runtime la app se autoactualiza (1 comprobación por apertura, ≥15 min) aplicando deltas sobre el seed.

## Limitaciones de compilación

- APK probado vía `assembleDebug`; el release requiere keystore propio (instrucciones arriba).
- Targets: Windows x64 (Tauri) y Android (Capacitor); no se han probado otras arquitecturas.
- iOS no está configurado (fuera del alcance: se pedía APK + .exe).
