package com.open_calendar.app

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  // Latest system bar / cutout / keyboard insets in CSS pixels, read by the
  // page through window.TerraAndroid.insets() (see src/app/androidInsets.ts).
  @Volatile private var insetsJson = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0}"

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun insets(): String = insetsJson
    }, "TerraAndroid")

    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val density = view.resources.displayMetrics.density
      fun css(px: Int) = Math.round(px / density)
      insetsJson = "{\"top\":${css(bars.top)},\"right\":${css(bars.right)}," +
        "\"bottom\":${css(maxOf(bars.bottom, ime.bottom))},\"left\":${css(bars.left)}}"
      webView.post { webView.evaluateJavascript("window.dispatchEvent(new Event('terra-insets'))", null) }
      insets
    }
  }
}
