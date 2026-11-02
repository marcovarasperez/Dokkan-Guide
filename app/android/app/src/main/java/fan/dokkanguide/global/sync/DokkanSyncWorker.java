package fan.dokkanguide.global.sync;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.concurrent.futures.CallbackToFutureAdapter;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.ListenableWorker;
import androidx.work.WorkerParameters;

import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONArray;
import org.json.JSONObject;

import fan.dokkanguide.global.R;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Worker periódico simple (Java, solo SDK Android) que consulta
 * dokkaninfo.com/cards cada 30 min, compara hash FNV-1a y notifica si hay novedades.
 * No requiere OkHttp, Gson, RxJava, Kotlin coroutines.
 */
public class DokkanSyncWorker extends ListenableWorker {

    // ── Constantes ──────────────────────────────────────────────
    private static final String CATALOG_URL = "https://dokkaninfo.com/cards";
    private static final String CARD_DETAIL_URL_PREFIX = "https://dokkaninfo.com/cards/";
    private static final String PREFS_NAME = "dokkan_sync_prefs";
    private static final String KEY_CATALOG_HASH = "catalog_hash";
    private static final String KEY_LAST_SUCCESS = "last_success_ts";
    private static final String KEY_KNOWN_IDS = "known_ids";

    private static final long FNV_OFFSET_BASIS = 0xcbf29ce484222325L;
    private static final long FNV_PRIME = 0x100000001b3L;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;

    public DokkanSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @NonNull
    @Override
    public ListenableFuture<Result> startWork() {
        return CallbackToFutureAdapter.getFuture(completer -> {
            executor.execute(() -> {
                try {
                    Result result = doWorkSync();
                    completer.set(result);
                } catch (Exception e) {
                    e.printStackTrace();
                    completer.set(Result.retry());
                }
            });
            return "DokkanSyncWorker";
        });
    }

    // ── Trabajo síncrono en hilo executor ───────────────────────

    private Result doWorkSync() {
        try {
            // 1️⃣ Descargar catálogo
            String catalogJson = fetch(CATALOG_URL);
            if (catalogJson == null) return Result.retry();

            // 2️⃣ Hash FNV-1a del JSON canónico (ordenado para consistencia)
            String canonicalJson = canonicalizeJson(catalogJson);
            String newHash = fnv1a64(canonicalJson);

            // 3️⃣ Leer hash anterior
            String oldHash = prefs.getString(KEY_CATALOG_HASH, "");

            // 4️⃣ Sin cambios
            if (newHash.equals(oldHash)) return Result.success();

            // 5️⃣ Cargar known_ids
            Set<String> knownIds = new HashSet<>(prefs.getStringSet(KEY_KNOWN_IDS, new HashSet<>()));

            // 6️⃣ Parsear catálogo y detectar nuevos
            List<String> newNames = new ArrayList<>();
            JSONArray cards = new JSONArray(catalogJson);

            for (int i = 0; i < cards.length(); i++) {
                JSONObject row = cards.getJSONObject(i);
                int id = row.optInt("id", 0);
                String idStr = String.valueOf(id);

                // Mismos criterios que isNewCandidate del TS
                boolean isNew = !knownIds.contains(idStr) &&
                        row.optInt("rarity", 0) >= 3 &&           // SSR+
                        id < 4000000 &&                            // no transformaciones
                        !idStr.startsWith("9") &&                  // no espejos
                        row.optLong("open_at", 0) > 0 &&
                        row.optLong("open_at", 0) < System.currentTimeMillis() / 1000 &&
                        row.optInt("awoken_max", 0) >= 1 &&
                        (row.optInt("icon_id", id) == id);         // no variantes sin página

                if (isNew) {
                    knownIds.add(idStr);
                    // Descargar detalle para obtener nombre
                    String name = fetchCardName(id);
                    if (name != null) newNames.add(name);
                }
            }

            // 7️⃣ Notificar si hay nuevos
            if (!newNames.isEmpty()) {
                showNotification(newNames);
            }

            // 8️⃣ Guardar estado
            prefs.edit()
                    .putString(KEY_CATALOG_HASH, newHash)
                    .putLong(KEY_LAST_SUCCESS, System.currentTimeMillis() / 1000)
                    .putStringSet(KEY_KNOWN_IDS, knownIds)
                    .apply();

            return Result.success();

        } catch (Exception e) {
            e.printStackTrace();
            return Result.retry();
        }
    }

    // ── Helpers HTTP/JSON ──────────────────────────────────────

    private String fetch(String urlString) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlString);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(120000);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "DokkanFanGuide/1.0");

            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                return sb.toString();
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private String fetchCardName(int id) {
        String json = fetch(CARD_DETAIL_URL_PREFIX + id);
        if (json == null) return null;
        try {
            JSONObject obj = new JSONObject(json);
            JSONObject card = obj.optJSONObject("card");
            if (card != null) return card.optString("name", null);
        } catch (Exception ignored) {}
        return null;
    }

    /** Canoniza JSON ordenando claves para hash consistente. */
    private String canonicalizeJson(String json) {
        try {
            Object parsed = new org.json.JSONTokener(json).nextValue();
            return parsed.toString(); // JSONObject.toString() ordena claves
        } catch (Exception e) {
            return json;
        }
    }

    private String fnv1a64(String input) {
        long hash = FNV_OFFSET_BASIS;
        for (byte b : input.getBytes()) {
            hash = (hash ^ (b & 0xFFL)) * FNV_PRIME;
        }
        return Long.toHexString(hash);
    }

    // ── Notificación ───────────────────────────────────────────

    private void showNotification(List<String> names) {
        Context ctx = getApplicationContext();
        String title = "¡Nuevo personaje en Dokkan!";
        String body = names.size() == 1 ? names.get(0)
                : names.size() + " personajes: " + String.join(", ", names.subList(0, Math.min(3, names.size())))
                + (names.size() > 3 ? "…" : "");

        String channelId = "dokkan-new-units";
        int notificationId = (int) (System.currentTimeMillis() / 1000);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, channelId)
                .setSmallIcon(R.drawable.ic_stat_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setColor(0xFFFF6B35);

        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(ctx);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId,
                    "Nuevos Personajes",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notificaciones cuando sale un nuevo personaje en Dokkan Battle");
            channel.enableVibration(true);
            channel.setLightColor(0xFFFF6B35);
            channel.enableLights(true);
            NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }

        notificationManager.notify(notificationId, builder.build());
    }
}