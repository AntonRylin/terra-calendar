import type { CalDavSnapshot } from './types';

/** Minimal async key-value store (localStorage in browser dev, Tauri fs/store
 *  on desktop — injected so this module stays pure and testable). */
export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const EMPTY: CalDavSnapshot = { entries: {} };

export class CalDavCache {
  private readonly key: string;

  constructor(private readonly store: KvStore, accountKey: string) {
    this.key = `open-calendar.caldav.snapshot.${accountKey}`;
  }

  async load(): Promise<CalDavSnapshot> {
    const raw = await this.store.get(this.key);
    if (!raw) return { ...EMPTY };
    try {
      const parsed = JSON.parse(raw) as CalDavSnapshot;
      return parsed && parsed.entries ? parsed : { ...EMPTY };
    } catch {
      return { ...EMPTY };
    }
  }

  async save(snapshot: CalDavSnapshot): Promise<void> {
    await this.store.set(this.key, JSON.stringify(snapshot));
  }
}
