import { confirmDialog } from '../ui/confirmStore';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Check GitHub Releases for a newer build (desktop only), download and install
 * it, then offer a restart. Errors are logged, never surfaced — an update check
 * must not get in the way of using the calendar.
 */
export async function checkForAppUpdate(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return;
    await update.downloadAndInstall();
    const restart = await confirmDialog({
      title: `Updated to ${update.version}`,
      message: 'The update was installed. Restart Terra Calendar to start using it?',
      confirmLabel: 'Restart now',
      cancelLabel: 'Later',
    });
    if (restart) {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    }
  } catch (err) {
    console.warn('Update check failed', err);
  }
}
