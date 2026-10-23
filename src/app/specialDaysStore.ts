import { create } from 'zustand';
import { isCloudMode } from '../data/createRepository';
import { pushSpecialDays, pullSpecialDays } from '../data/cloudSpecialDays';
import { downloadDayImage } from '../data/cloudDayImages';
import { putImage, hasImage } from '../data/dayImageStore';
import { sweepUnreferencedImages } from '../data/sweepDayImages';
import { record as recordHistory, registerHistoryDomain } from './history';
import type { DayMediaKind } from '../core/media';

/** JSON of the last special-days array pushed to the cloud — skips redundant pushes. */
let lastPushedSpecialDays = '';

const SPECIAL_DAYS_DOMAIN = 'specialDays';

// The last state written by commit(). Every commit is an undo boundary: the day
// panel and the background modal both edit in memory and commit once on close,
// so a whole editing session — including "Reset changes" — undoes as one step.
let lastCommitted: SpecialDay[] = [];

/** A day-background media ref. `upload` = a blob stored locally (IndexedDB) and,
 *  for subscribers, in the cloud bucket. `url` = a live remote link (synced as
 *  text only; never uploaded). Both carry a stable `id` used as the render key.
 *
 *  `media` says how to paint it: 'image' (WebP still, or a GIF — which animates
 *  by itself as a CSS background) or 'video' (a muted looping clip, rendered
 *  through a <video> element). `mime` picks the object's file extension in the
 *  bucket. Refs written before motion backgrounds carry neither, and default to
 *  an image/WebP — which is exactly what they are. */
export type DayImageRef =
  | { kind: 'upload'; id: string; w: number; h: number; media?: DayMediaKind; mime?: string }
  | { kind: 'url'; id: string; src: string; w: number; h: number; media?: DayMediaKind; mime?: string };

export type DayCustomStyle =
  | { kind: 'raw'; source: string }
  | {
      kind: 'recipe';
      gradient: 'linear' | 'radial' | 'conic';
      colors: string[];
      angle: number;
      animation: 'none' | 'shift' | 'rotate' | 'pulse';
      speedSec: number;
    };

export interface SpecialDay {
  id: string;
  date: string; // YYYY-MM-DD anchor date
  cosmetic: string; // cosmetic ID (e.g. aurora, glow, or '' for none)
  animations: string[]; // selected effects (e.g. ['sparkles', 'wiggle']); empty = none
  emoji: string; // emoji character(s)
  recurrence: 'none' | 'weekly' | 'monthly' | 'yearly';
  image?: DayImageRef;
  customStyle?: DayCustomStyle;
  updatedAt?: string; // ISO; '' when never written by the new code
}

/**
 * Normalize a raw stored record into a current-shape SpecialDay. Migrates the
 * legacy single `animation: string` field (where 'none'/missing meant no effect)
 * into the `animations: string[]` set, so days saved before effects became
 * combinable keep rendering.
 */
export function normalizeSpecialDay(raw: any): SpecialDay {
  let animations: string[];
  if (Array.isArray(raw?.animations)) {
    animations = raw.animations.filter((a: unknown): a is string => typeof a === 'string' && a !== 'none');
  } else if (typeof raw?.animation === 'string' && raw.animation !== 'none') {
    animations = [raw.animation];
  } else {
    animations = [];
  }
  const rawImage = raw?.image;
  let image: DayImageRef | undefined;
  if (rawImage && typeof rawImage.id === 'string') {
    const w = Number(rawImage.w) || 0;
    const h = Number(rawImage.h) || 0;
    // Anything but an explicit 'video' is an image — that covers every ref
    // written before motion backgrounds existed.
    const media: DayMediaKind = rawImage.media === 'video' ? 'video' : 'image';
    const mime = typeof rawImage.mime === 'string' ? rawImage.mime : undefined;
    if (rawImage.kind === 'url' && typeof rawImage.src === 'string') {
      image = { kind: 'url', id: rawImage.id, src: rawImage.src, w, h, media, mime };
    } else {
      // Legacy refs (no kind) and explicit uploads both become upload refs.
      image = { kind: 'upload', id: rawImage.id, w, h, media, mime };
    }
  }

  let customStyle: DayCustomStyle | undefined;
  if (raw?.customStyle?.kind === 'raw' && typeof raw.customStyle.source === 'string') {
    customStyle = { kind: 'raw', source: raw.customStyle.source };
  } else if (raw?.customStyle?.kind === 'recipe' && Array.isArray(raw.customStyle.colors)) {
    const r = raw.customStyle;
    customStyle = {
      kind: 'recipe',
      gradient: r.gradient ?? 'linear',
      colors: r.colors.filter((c: unknown) => typeof c === 'string'),
      angle: Number(r.angle) || 0,
      animation: r.animation ?? 'none',
      speedSec: Number(r.speedSec) || 8,
    };
  }

  return {
    id: raw?.id ?? crypto.randomUUID(),
    date: raw?.date ?? '',
    cosmetic: raw?.cosmetic ?? '',
    animations,
    emoji: raw?.emoji ?? '',
    recurrence: raw?.recurrence ?? 'none',
    image,
    customStyle,
    updatedAt: raw?.updatedAt ?? '',
  };
}

/** Write the committed state through to disk and, for subscribers, the cloud.
 *  Used by commit() and by undo/redo, which must persist without recording. */
function persistSpecialDays(days: SpecialDay[]): void {
  lastCommitted = days;
  localStorage.setItem('open-calendar.special-days', JSON.stringify(days));
  if (isCloudMode()) {
    const json = JSON.stringify(days);
    if (json !== lastPushedSpecialDays) {
      lastPushedSpecialDays = json;
      void pushSpecialDays(days);
    }
  }
}

/** Content signature ignoring `updatedAt` and row order, for deciding whether a
 *  commit changed anything a user would recognise as an edit. */
function contentSig(days: SpecialDay[]): string {
  return JSON.stringify(
    days
      .map(({ updatedAt: _updatedAt, ...rest }) => rest)
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
}

interface SpecialDaysState {
  specialDays: SpecialDay[];
  init(): void;
  setSpecialDay(anchorDate: string, data: Omit<SpecialDay, 'id' | 'date'>): void;
  removeSpecialDay(anchorDate: string): void;
  setSpecialDayInMemory(anchorDate: string, data: Omit<SpecialDay, 'id' | 'date'>): void;
  removeSpecialDayInMemory(anchorDate: string): void;
  commit(): void;
  revert(backup: SpecialDay[]): void;
}

export const useSpecialDaysStore = create<SpecialDaysState>((set, get) => ({
  specialDays: [],
  init() {
    const saved = localStorage.getItem('open-calendar.special-days');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const days = Array.isArray(parsed) ? parsed.map(normalizeSpecialDay) : [];
        lastCommitted = days;
        set({ specialDays: days });
      } catch (e) {
        console.error('Failed to parse special days:', e);
      }
    }
    // Collect image bytes left behind by removed or replaced backgrounds, which
    // are kept during a session so Ctrl+Z can restore them. Local mode only:
    // in cloud mode the authoritative list arrives with the pull, so the sweep
    // runs at the end of hydrateDayBackgroundsFromCloud() instead — sweeping
    // against a not-yet-merged list would look like everything is unreferenced.
    if (!isCloudMode()) void sweepUnreferencedImages(get().specialDays);
  },
  setSpecialDay(anchorDate, data) {
    get().setSpecialDayInMemory(anchorDate, data);
    get().commit();
  },
  removeSpecialDay(anchorDate) {
    get().removeSpecialDayInMemory(anchorDate);
    get().commit();
  },
  setSpecialDayInMemory(anchorDate, data) {
    const existing = get().specialDays;
    const ruleOnDate = existing.find(d => d.date === anchorDate);
    
    let updated: SpecialDay[];
    if (ruleOnDate) {
      updated = existing.map(d => d.date === anchorDate ? { ...d, ...data, updatedAt: new Date().toISOString() } : d);
    } else {
      const newDay: SpecialDay = {
        id: crypto.randomUUID(),
        date: anchorDate,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      updated = [...existing, newDay];
    }
    
    set({ specialDays: updated });
  },
  removeSpecialDayInMemory(anchorDate) {
    const updated = get().specialDays.filter(d => d.date !== anchorDate);
    set({ specialDays: updated });
  },
  commit() {
    const days = get().specialDays;
    // Only a real content change is worth an undo step. Opening the day panel
    // and closing it untouched still rewrites the record (the live-preview
    // effect bumps `updatedAt` on mount), which `contentSig` ignores — otherwise
    // every look would land an empty step for Ctrl+Z to walk back through.
    if (contentSig(days) !== contentSig(lastCommitted)) {
      recordHistory(SPECIAL_DAYS_DOMAIN, lastCommitted);
    }
    persistSpecialDays(days);
  },
  revert(backup) {
    set({ specialDays: backup });
  }
}));

// Undo/redo of a day-styling step restores the snapshot and writes it through,
// without recording a step of its own. Registered after the store exists.
registerHistoryDomain<SpecialDay[]>(SPECIAL_DAYS_DOMAIN, {
  read: () => lastCommitted,
  apply: async (snapshot) => {
    useSpecialDaysStore.getState().revert(snapshot);
    persistSpecialDays(snapshot);
    return true;
  },
});

export function getSpecialDayForDate(specialDays: SpecialDay[], dateStr: string): SpecialDay | null {
  const candidates = specialDays.filter((sd) => {
    if (dateStr < sd.date) return false;
    if (sd.recurrence === 'none') {
      return sd.date === dateStr;
    }
    
    // Parse parts manually to avoid timezone shifting issues
    const [sdY, sdM, sdD] = sd.date.split('-').map(Number);
    const [cY, cM, cD] = dateStr.split('-').map(Number);
    
    if (sd.recurrence === 'weekly') {
      // Compare day of week of both dates
      const sdDate = new Date(sdY, sdM - 1, sdD);
      const cDate = new Date(cY, cM - 1, cD);
      return sdDate.getDay() === cDate.getDay();
    }
    
    if (sd.recurrence === 'monthly') {
      return sdD === cD;
    }
    
    if (sd.recurrence === 'yearly') {
      return sdM === cM && sdD === cD;
    }
    
    return false;
  });

  if (candidates.length === 0) return null;

  const priority = { none: 0, weekly: 1, monthly: 2, yearly: 3 };
  candidates.sort((a, b) => {
    const pa = priority[a.recurrence] ?? 9;
    const pb = priority[b.recurrence] ?? 9;
    if (pa !== pb) return pa - pb;
    return b.date.localeCompare(a.date);
  });

  return candidates[0];
}

/** Merge two special-days arrays by anchor date, keeping the record with the
 *  newer `updatedAt` for each date (last-writer-wins). Union of all dates. */
export function mergeSpecialDaysByDate(local: SpecialDay[], cloud: SpecialDay[]): SpecialDay[] {
  const byDate = new Map<string, SpecialDay>();
  for (const d of local) byDate.set(d.date, d);
  for (const d of cloud) {
    const existing = byDate.get(d.date);
    if (!existing || (d.updatedAt ?? '') >= (existing.updatedAt ?? '')) {
      byDate.set(d.date, d);
    }
  }
  return Array.from(byDate.values());
}

/**
 * Pull the subscriber's cloud day backgrounds, merge per-day (last-writer-wins by
 * `updatedAt`) with the local set, and download any `upload` images missing from
 * the local IndexedDB cache. An empty cloud is seeded from local. No-op outside
 * cloud mode. Call on cloud activation.
 */
export async function hydrateDayBackgroundsFromCloud(): Promise<void> {
  if (!isCloudMode()) return;
  const raw = await pullSpecialDays();
  if (raw) {
    const cloudDays = raw.map(normalizeSpecialDay);
    const merged = mergeSpecialDaysByDate(useSpecialDaysStore.getState().specialDays, cloudDays);
    lastPushedSpecialDays = JSON.stringify(merged);
    useSpecialDaysStore.setState({ specialDays: merged });
    // Persist directly rather than via commit(): another device's changes
    // arriving is not a local edit, so it must not land an undo step.
    persistSpecialDays(merged);
    // Backfill any upload images we don't have locally yet.
    for (const d of merged) {
      const img = d.image;
      if (img && img.kind === 'upload' && !(await hasImage(img.id))) {
        const blob = await downloadDayImage(img.id, img.mime);
        if (blob) await putImage(blob, img.w, img.h, img.id);
      }
    }
    // The merged list is authoritative, so anything it doesn't reference is a
    // genuine orphan — safe to collect here, and only here, in cloud mode.
    await sweepUnreferencedImages(merged);
  } else {
    const days = useSpecialDaysStore.getState().specialDays;
    lastPushedSpecialDays = JSON.stringify(days);
    await pushSpecialDays(days);
  }
}
