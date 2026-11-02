package fan.dokkanguide.global.sync

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Programa/cancela el WorkManager periódico de sincronización.
 * Llamar desde MainActivity.onCreate() → SyncScheduler.schedule(applicationContext)
 */
object SyncScheduler {

    private const val WORK_NAME = "DokkanPeriodicSync"
    private const val INTERVAL_MIN = 30L // mínimo Android para PeriodicWorkRequest

    /** Programa el worker periódico (idempotente: si ya existe, no duplica). */
    fun schedule(context: Context) {
        val workRequest = PeriodicWorkRequest.Builder(DokkanSyncWorker::class.java, INTERVAL_MIN, TimeUnit.MINUTES)
            .setBackoffCriteria(
                androidx.work.BackoffPolicy.EXPONENTIAL,
                10, TimeUnit.MINUTES
            )
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
    }

    /** Cancela el trabajo periódico (ej. si usuario desactiva en ajustes). */
    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }

    /** Consulta si hay trabajo programado (para UI de ajustes). */
    suspend fun isScheduled(context: Context): Boolean = WorkManager.getInstance(context)
        .getWorkInfosForUniqueWorkLiveData(WORK_NAME)
        .value?.any { it.state.isFinished.not() } ?: false
}