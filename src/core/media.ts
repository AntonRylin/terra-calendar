/**
 * Pure helpers for day-background media — stills, animated GIFs and video
 * clips. DOM-free on purpose: the storage layer (bucket paths, sweeps) and the
 * import pipeline both need them, and they stay unit-testable without a canvas.
 */

/** What a day background paints with. `image` covers WebP stills and raw GIFs
 *  (a GIF animates fine as a CSS background); `video` needs a <video> element. */
export type DayMediaKind = 'image' | 'video';

/** Strip codec parameters: 'video/webm;codecs=vp9' → 'video/webm'. */
export function baseMime(mime: string | undefined | null): string {
  return (mime ?? '').split(';')[0].trim().toLowerCase();
}

const EXT_BY_MIME: Record<string, string> = {
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

/**
 * Object-storage file extension for a stored media mime. Defaults to `webp`:
 * refs written before motion backgrounds existed carry no mime at all and are
 * always WebP, so their bucket paths have to keep resolving unchanged.
 */
export function extForMime(mime?: string): string {
  return EXT_BY_MIME[baseMime(mime)] ?? 'webp';
}

/** Every extension a stored day background can use. Deletes have to sweep all
 *  of them: the orphan sweep works from ids alone and has no mime to go on. */
export const MEDIA_EXTENSIONS = ['webp', 'gif', 'webm', 'mp4'] as const;

/** Mimes the app is willing to store as-is (no re-encode). Kept in step with
 *  the bucket's `allowed_mime_types` (migration 0013). */
export const STORABLE_MIMES = ['image/webp', 'image/gif', 'video/webm', 'video/mp4'] as const;

const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  gif: 'image/gif',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
  apng: 'image/apng',
  webm: 'video/webm',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
};

/** Guess a mime from a file name or URL; '' when the extension says nothing.
 *  Drops query strings and fragments first, so `clip.mp4?token=…` still reads. */
export function mimeFromName(nameOrUrl: string): string {
  const path = nameOrUrl.split(/[?#]/)[0];
  const dot = path.lastIndexOf('.');
  if (dot < 0) return '';
  return MIME_BY_EXT[path.slice(dot + 1).toLowerCase()] ?? '';
}

export type MediaClass = 'video' | 'gif' | 'image' | 'other';

/** Sort a dropped/pasted file into a pipeline. Falls back to the file name when
 *  the OS hands over a blob with no type (common for drags out of some apps). */
export function classifyMedia(type?: string | null, name?: string): MediaClass {
  const mime = baseMime(type) || mimeFromName(name ?? '');
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'image/gif') return 'gif';
  if (mime.startsWith('image/')) return 'image';
  return 'other';
}

/** Scale (w,h) so the longer edge is at most `max`, preserving aspect; never
 *  upscales. Returns whole pixels. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const k = max / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Round both edges down to even numbers (min 2). VP8/VP9/H.264 refuse odd
 *  frame dimensions, and an odd canvas silently kills the recording. */
export function evenSize(size: { w: number; h: number }): { w: number; h: number } {
  return { w: Math.max(2, size.w - (size.w % 2)), h: Math.max(2, size.h - (size.h % 2)) };
}

/** '184 KB' — for telling the user how small their clip ended up. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
