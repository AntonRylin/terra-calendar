# MainActivity exposes window.TerraAndroid to the page through
# @JavascriptInterface methods; keep them through R8 minification.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
