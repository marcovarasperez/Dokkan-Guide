package fan.dokkanguide.global;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Transporte HTTP con OkHttp (HTTP/2): debe registrarse ANTES de super,
    // que es cuando el Bridge levanta los plugins.
    registerPlugin(OkHttpPlugin.class);

    super.onCreate(savedInstanceState);

    // Disable pinch/double-tap zoom inside the WebView.
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().getSettings().setSupportZoom(false);
      getBridge().getWebView().getSettings().setBuiltInZoomControls(false);
      getBridge().getWebView().getSettings().setDisplayZoomControls(false);
    }
  }
}
