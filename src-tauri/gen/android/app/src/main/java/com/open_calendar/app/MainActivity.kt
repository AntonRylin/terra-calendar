package com.open_calendar.app

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  // Latest system bar / cutout / keyboard insets in CSS pixels, read by the
  // page through window.TerraAndroid.insets() (see src/app/androidInsets.ts).
  @Volatile private var insetsJson = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0}"
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Back closes what's open in the page first (src/app/androidBack.ts); the
    // page calls exitApp() when nothing is left to close.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val view = webView
        if (view == null) moveTaskToBack(true)
        else view.evaluateJavascript("window.dispatchEvent(new Event('terra-back'))", null)
      }
    })
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    val activity = this
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun insets(): String = insetsJson

      @JavascriptInterface fun exitApp() {
        activity.runOnUiThread { activity.moveTaskToBack(true) }
      }

      @JavascriptInterface fun setDarkSystemBars(dark: Boolean) {
        activity.runOnUiThread {
          val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
          controller.isAppearanceLightStatusBars = !dark
          controller.isAppearanceLightNavigationBars = !dark
        }
      }
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
