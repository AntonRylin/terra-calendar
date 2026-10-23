import type { KvStore } from './caldavCache';

/** KvStore backed by localStorage — used in browser dev. The Tauri desktop
 *  build supplies an fs-backed KvStore instead (Task 16). */
export const localStorageKv: KvStore = {
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => { localStorage.setItem(key, value); },
};
