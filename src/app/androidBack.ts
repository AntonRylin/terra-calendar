import { useEffect, useRef } from 'react';

/**
 * Android's back button / back gesture closes whatever is open on top (a sheet,
 * the drawer, a settings page) before it leaves the app, like any Android app.
 *
 * Anything that can be closed registers itself while it is open with
 * `useAndroidBack(open, close)`. The most recently opened one closes first.
 * MainActivity.kt sends every back press to the page as a `terra-back` event;
 * when nothing is open the page asks Android to leave the app
 * (window.TerraAndroid.exitApp()). Outside the Android app this is inert.
 */
type Handler = () => void;
const stack: Handler[] = [];

function push(handler: Handler): () => void {
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Closes the topmost registered layer. Returns false when nothing was open. */
export function handleBack(): boolean {
  const handler = stack.pop();
  if (!handler) return false;
  handler();
  return true;
}

/** While `active`, a back press calls `onBack` (and nothing below it). */
export function useAndroidBack(active: boolean, onBack: () => void): void {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    return push(() => latest.current());
  }, [active]);
}

interface Bridge {
  exitApp?: () => void;
  setDarkSystemBars?: (dark: boolean) => void;
}

function bridge(): Bridge | undefined {
  return (window as unknown as { TerraAndroid?: Bridge }).TerraAndroid;
}

export function installAndroidBack(): void {
  if (!bridge()) return;
  window.addEventListener('terra-back', () => {
    if (!handleBack()) bridge()?.exitApp?.();
  });
}

/** Light or dark status/navigation bar icons to match the app theme. */
export function setAndroidSystemBarsDark(dark: boolean): void {
  bridge()?.setDarkSystemBars?.(dark);
}
