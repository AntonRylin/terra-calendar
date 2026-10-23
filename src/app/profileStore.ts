import { create } from 'zustand';
import { readProfileFile, writeProfileFile, profileFileAvailable } from '../data/profileFile';

const STORAGE_KEY = 'open-calendar.profile';

/** The local, device-side identity a free user can set without any account.
 *  Cloud identity lives on the Supabase auth user's metadata instead, so this
 *  never syncs through the cloud settings blob — it's the offline fallback and
 *  the seed used when upgrading to a cloud account. */
export interface LocalProfile {
  /** Display name, or '' when unset. */
  name: string;
  /** Square WebP avatar as a data URL, or null when unset. */
  avatarDataUrl: string | null;
}

function defaults(): LocalProfile {
  return { name: '', avatarDataUrl: null };
}

/** Normalise a raw stored blob into a current-shape profile. */
function normalize(raw: unknown): LocalProfile {
  if (!raw || typeof raw !== 'object') return defaults();
  const r = raw as Record<string, unknown>;
  return {
    name: typeof r.name === 'string' ? r.name : '',
    avatarDataUrl:
      typeof r.avatarDataUrl === 'string' && r.avatarDataUrl.startsWith('data:')
        ? r.avatarDataUrl
        : null,
  };
}

function load(): LocalProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    return normalize(JSON.parse(raw));
  } catch {
    return defaults();
  }
}

/** Write the profile to both mirrors: localStorage (synchronous working copy)
 *  and the durable on-disk file (desktop only). */
function writeMirrors(p: LocalProfile): void {
  const json = JSON.stringify(p);
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // ignore — the profile is a convenience, not critical state
  }
  void writeProfileFile(json);
}

interface ProfileState extends LocalProfile {
  setName(name: string): void;
  setAvatar(avatarDataUrl: string): void;
  clearAvatar(): void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  ...load(),
  setName: (name) => {
    set({ name });
    writeMirrors(get());
  },
  setAvatar: (avatarDataUrl) => {
    set({ avatarDataUrl });
    writeMirrors(get());
  },
  clearAvatar: () => {
    set({ avatarDataUrl: null });
    writeMirrors(get());
  },
}));

/** A plain snapshot of the current local profile (for non-React callers). */
export function currentLocalProfile(): LocalProfile {
  const { name, avatarDataUrl } = useProfileStore.getState();
  return { name, avatarDataUrl };
}

/** Apply a profile from an imported settings file: normalised, applied live, and
 *  written to both mirrors. Returns false when the blob isn't a profile. */
export function applyImportedProfile(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const profile = normalize(raw);
  useProfileStore.setState(profile);
  writeMirrors(profile);
  return true;
}

/**
 * Hydrate the store from the durable on-disk profile file (desktop only), making
 * disk the source of truth so a fresh WebView profile (empty localStorage)
 * recovers the user's name and avatar after a reinstall. If no file exists yet,
 * seed it from whatever is currently in the store. Safe no-op on the web build.
 * Call once at app startup.
 */
export async function hydrateProfileFromDisk(): Promise<void> {
  if (!profileFileAvailable()) return;
  try {
    const text = await readProfileFile();
    if (text) {
      try {
        const merged = normalize(JSON.parse(text));
        useProfileStore.setState(merged);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch {
          // ignore — disk is now authoritative regardless
        }
      } catch {
        // Malformed disk file → keep the localStorage-derived state as-is.
      }
    } else {
      // No file yet: migrate current profile (likely from localStorage) onto disk.
      await writeProfileFile(JSON.stringify(currentLocalProfile()));
    }
  } catch {
    // ignore — localStorage remains the working copy
  }
}
