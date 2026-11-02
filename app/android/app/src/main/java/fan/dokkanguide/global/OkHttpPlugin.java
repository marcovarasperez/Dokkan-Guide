package fan.dokkanguide.global;

import android.text.TextUtils;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.Arrays;
import java.util.Iterator;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * PLUGIN · Transporte HTTP hacia dokkaninfo.com para el APK (Android).
 *
 * MOTIVO: Cloudflare bloquea (403 "you have been blocked") cualquier petición
 * HTTP/1.1 con TLS no aprobado. `CapacitorHttp` usa `HttpURLConnection`, que
 * SOLO habla HTTP/1.1 → la ficha de personaje devolvía 403 y la app mostraba
 * «Sin conexión». Verificado el 02/11/2026:
 *
 *   - reqwest + rustls + h2 (el .exe)      → 200
 *   - Chrome / WebView (h2)                → 200
 *   - Conscrypt + HttpURLConnection (h1)   → 403   ← APK hasta ahora
 *   - OkHttp + Conscrypt + h2              → 200   ← este plugin
 *   - OkHttp forzado a h1                  → 403
 *
 * OkHttp negocia HTTP/2 por ALPN sobre Conscrypt/BoringSSL (el TLS por defecto
 * de Android 7+, minSdk 24), así que la firma que ve el servidor es la misma
 * que ya ha aprobado.
 *
 * La API replica la de `CapacitorHttp.request` (mismas claves de opciones y
 * mismo formato de respuesta) para que `src/model/http.ts` solo tenga que
 * cambiar de plugin.
 */
@CapacitorPlugin(name = "OkHttp")
public class OkHttpPlugin extends Plugin {

    private final ExecutorService executor = Executors.newCachedThreadPool();

    /** Cliente base: se reutiliza (pool de conexiones) y se clona por petición. */
    private OkHttpClient client;

    /** UA de la WebView: se captura en load() (hilo principal) para no tocarla desde el executor. */
    private String webviewUserAgent;

    @Override
    public void load() {
        client = new OkHttpClient.Builder()
            // h2 primero: si el servidor lo acepta (lo hace) se usa HTTP/2.
            .protocols(Arrays.asList(Protocol.HTTP_2, Protocol.HTTP_1_1))
            .retryOnConnectionFailure(true)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .build();

        if (getBridge() != null && getBridge().getWebView() != null) {
            webviewUserAgent = getBridge().getWebView().getSettings().getUserAgentString();
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        executor.shutdownNow();
    }

    @PluginMethod
    public void request(final PluginCall call) {
        executor.submit(
            () -> {
                try {
                    call.resolve(execute(call));
                } catch (Exception e) {
                    String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                    call.reject(msg, "ERR", e);
                }
            }
        );
    }

    private JSObject execute(PluginCall call) throws Exception {
        String urlString = call.getString("url", "");
        String method = call.getString("method", "GET").toUpperCase(Locale.ROOT);
        JSObject headers = call.getObject("headers", new JSObject());
        JSObject params = call.getObject("params", new JSObject());
        Integer connectTimeout = call.getInt("connectTimeout");
        Integer readTimeout = call.getInt("readTimeout");
        String responseType = call.getString("responseType", "text");

        HttpUrl parsed = HttpUrl.parse(urlString);
        if (parsed == null) throw new IOException("URL no válida: " + urlString);

        // Parámetros de consulta (CapacitorHttp los añadía igualmente).
        HttpUrl.Builder urlBuilder = parsed.newBuilder();
        Iterator<String> paramKeys = params.keys();
        while (paramKeys.hasNext()) {
            String key = paramKeys.next();
            Object value = params.opt(key);
            if (value != null) urlBuilder.addQueryParameter(key, String.valueOf(value));
        }

        Request.Builder request = new Request.Builder().url(urlBuilder.build());
        boolean hasUserAgent = false;
        Iterator<String> headerKeys = headers.keys();
        while (headerKeys.hasNext()) {
            String key = headerKeys.next();
            Object value = headers.opt(key);
            if (value == null) continue;
            if ("user-agent".equalsIgnoreCase(key)) hasUserAgent = true;
            request.header(key, String.valueOf(value));
        }

        // Sin UA explícita se usa la de la WebView (firma de navegador real).
        if (!hasUserAgent && webviewUserAgent != null && !webviewUserAgent.isEmpty()) {
            request.header("User-Agent", webviewUserAgent);
        }

        boolean isGetLike = "GET".equals(method) || "HEAD".equals(method);
        if (isGetLike) {
            request.method(method, null);
        } else {
            Object data = call.getData().opt("data");
            String payload = data == null ? "" : String.valueOf(data);
            request.method(method, RequestBody.create(payload, MediaType.parse(contentTypeOf(headers))));
        }

        OkHttpClient.Builder builder = client.newBuilder();
        if (connectTimeout != null) builder.connectTimeout(connectTimeout, TimeUnit.MILLISECONDS);
        if (readTimeout != null) builder.readTimeout(readTimeout, TimeUnit.MILLISECONDS);

        try (Response response = builder.build().newCall(request.build()).execute()) {
            JSObject out = new JSObject();
            out.put("status", response.code());
            out.put("url", response.request().url().toString());
            // Diagnóstico: confirma que la petición salió por HTTP/2.
            out.put("protocol", response.protocol().toString());
            out.put("error", response.code() >= 400);

            JSObject responseHeaders = new JSObject();
            for (String name : response.headers().names()) {
                responseHeaders.put(name, TextUtils.join(", ", response.headers(name)));
            }
            out.put("headers", responseHeaders);

            ResponseBody body = response.body();
            if ("blob".equals(responseType) || "arraybuffer".equals(responseType)) {
                byte[] bytes = body != null ? body.bytes() : new byte[0];
                // Base64 sin saltos: capacitorDataToBlob() lo decodifica con atob().
                out.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            } else {
                out.put("data", body != null ? body.string() : "");
            }
            return out;
        }
    }

    /** Content-Type de la petición (o JSON por defecto, igual que CapacitorHttp). */
    private String contentTypeOf(JSObject headers) {
        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if ("content-type".equalsIgnoreCase(key)) {
                Object value = headers.opt(key);
                if (value != null) return String.valueOf(value);
            }
        }
        return "application/json; charset=utf-8";
    }
}
