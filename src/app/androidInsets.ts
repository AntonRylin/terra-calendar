/**
 * Android draws the app edge to edge, under the status bar and the gesture
 * bar, and this WebView reports env(safe-area-inset-*) as 0 for them. The
 * Android activity (MainActivity.kt) exposes the real insets in CSS pixels as
 * window.TerraAndroid.insets() and fires `terra-insets` when they change; this
 * copies them into the --safe-* variables the layout pads with (index.css).
 * Elsewhere the variables keep their env() defaults.
 */
interface TerraAndroid {
  insets(): string;
}

export function installAndroidInsets(): void {
  const bridge = (window as unknown as { TerraAndroid?: TerraAndroid }).TerraAndroid;
  if (!bridge) return;
  const apply = () => {
    try {
      const i = JSON.parse(bridge.insets()) as Record<'top' | 'right' | 'bottom' | 'left', number>;
      const root = document.documentElement.style;
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        root.setProperty(`--safe-${side}`, `${Math.max(0, i[side] || 0)}px`);
      }
    } catch {
      /* keep the env() defaults */
    }
  };
  apply();
  window.addEventListener('terra-insets', apply);
  window.addEventListener('resize', apply);
}
