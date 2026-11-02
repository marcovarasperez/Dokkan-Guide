package fan.dokkanguide.global

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import fan.dokkanguide.global.OkHttpPlugin
import fan.dokkanguide.global.sync.SyncScheduler

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(OkHttpPlugin::class.java)
        super.onCreate(savedInstanceState)
        SyncScheduler.schedule(applicationContext)

        // Disable pinch/double-tap zoom inside the WebView.
        bridge?.webView?.settings?.let { settings ->
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
        }
    }
}