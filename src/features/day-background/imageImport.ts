import { useSpecialDaysStore } from '../../app/specialDaysStore';
import { putImage, deleteImage } from '../../data/dayImageStore';
import { isCloudMode } from '../../data/createRepository';
import { uploadDayImage, deleteDayImage } from '../../data/cloudDayImages';
import {
  baseMime,
  classifyMedia,
  fitWithin,
  formatBytes,
  mimeFromName,
  STORABLE_MIMES,
  type DayMediaKind,
} from '../../core/media';
import { readGifMeta } from '../../core/gifMeta';
import {
  canTranscodeMotion,
  imageDimensions,
  MAX_MOTION_EDGE,
  MAX_RAW_MOTION_BYTES,
  processGif,
  processVideo,
  videoDimensions,
  type MotionOptions,
} from './videoImport';

export const MAX_EDGE = 512;
export const WEBP_QUALITY = 0.82;

export { fitWithin };

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Decode → downscale → re-encode WebP. Returns the WebP blob + its px size. */
export async function processImage(input: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(input);
  const { w, h } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('WebP encode failed'))), 'image/webp', WEBP_QUALITY),
  );
  return { blob, w, h };
}

/** Fetch image bytes from a URL. Uses the Tauri HTTP plugin to avoid CORS
 *  canvas-tainting; falls back to fetch() on web. The blob keeps the response's
 *  content type (falling back to the URL's extension) so the media pipeline can
 *  tell a downloaded clip from a downloaded still. */
export async function blobFromUrl(url: string): Promise<Blob> {
  const fallbackType = mimeFromName(url);
  if (isTauri()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const res = await tauriFetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const type = baseMime(res.headers.get('content-type')) || fallbackType;
    return new Blob([await res.arrayBuffer()], { type });
  }
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const blob = await res.blob();
  return blob.type ? blob : new Blob([blob], { type: fallbackType });
}

/** Pull the first image or video File out of a clipboard/drag event's items.
 *  `items`/`files` are optional-accessed: in-app drags (event chips) and test
 *  doubles carry a bare object with only get/setData. */
export function mediaFileFromDataTransfer(dt: DataTransfer | null): File | null {
  const wanted = (type?: string, name?: string) => classifyMedia(type, name) !== 'other';
  if (!dt) return null;
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== 'file') continue;
    const f = item.getAsFile();
    if (f && wanted(f.type || item.type, f.name)) return f;
  }
  return Array.from(dt.files ?? []).find((f) => wanted(f.type, f.name)) ?? null;
}

/** True for sources that go through the motion (video clip) pipeline. */
export function isMotionFile(file: Blob): boolean {
  const kind = classifyMedia(file.type, (file as File).name);
  return kind === 'video' || kind === 'gif';
}

export interface ProcessedMedia {
  blob: Blob;
  w: number;
  h: number;
  mime: string;
  media: DayMediaKind;
  /** True when the bytes are the source's, because this webview can't re-encode. */
  raw?: boolean;
}

/** Keep the source bytes untouched. Only reachable when the webview has no
 *  MediaRecorder/captureStream — the file then has to be both a format the
 *  bucket accepts and small enough to be worth syncing. */
async function keepRaw(input: Blob, kind: 'video' | 'gif'): Promise<ProcessedMedia> {
  const mime = baseMime(input.type) || mimeFromName((input as File).name ?? '');
  if (!(STORABLE_MIMES as readonly string[]).includes(mime)) {
    throw new Error('This browser can’t re-encode video — try an MP4, WebM or GIF file.');
  }
  if (input.size > MAX_RAW_MOTION_BYTES) {
    throw new Error(
      `This browser can’t shrink video, and ${formatBytes(input.size)} is too big to store as-is (limit ${formatBytes(MAX_RAW_MOTION_BYTES)}).`,
    );
  }
  const size = kind === 'video' ? await videoDimensions(input) : await imageDimensions(input);
  // A raw GIF stays an image: it animates perfectly well as a CSS background.
  return { blob: input, ...size, mime, media: kind === 'video' ? 'video' : 'image', raw: true };
}

/**
 * Turn any dropped/pasted/downloaded file into something a day tile can paint:
 *   * video → a short muted WebM/MP4 clip, downscaled and trimmed
 *   * animated GIF → the same clip pipeline, recorded for exactly one loop
 *   * still image (incl. single-frame GIF) → a downscaled WebP
 */
export async function processMedia(input: Blob, opts: MotionOptions = {}): Promise<ProcessedMedia> {
  const kind = classifyMedia(input.type, (input as File).name);

  if (kind === 'video') {
    if (canTranscodeMotion()) {
      const out = await processVideo(input, opts);
      return { ...out, media: 'video' };
    }
    return keepRaw(input, 'video');
  }

  if (kind === 'gif') {
    const meta = readGifMeta(new Uint8Array(await input.arrayBuffer()));
    if (meta && meta.frames > 1) {
      if (canTranscodeMotion()) {
        const out = await processGif(input, {
          ...opts,
          durationSec: meta.durationSec,
          frameDelaySec: meta.durationSec / meta.frames,
        });
        // null = this webview couldn't capture the animation. The GIF itself
        // animates as a CSS background, so keeping it beats a frozen clip.
        if (out) {
          // Small, flat GIFs (few colours, few frames) can already be smaller
          // than any re-encode of them — and shrinking the file is the whole
          // point, so keep whichever actually is. Oversized sources still get
          // re-encoded: a huge GIF is a tile-rendering cost, not just bytes.
          if (out.blob.size >= input.size && input.size <= MAX_RAW_MOTION_BYTES) {
            const size = await imageDimensions(input);
            if (Math.max(size.w, size.h) <= MAX_MOTION_EDGE * 2) {
              return { blob: input, ...size, mime: 'image/gif', media: 'image', raw: true };
            }
          }
          return { ...out, media: 'video' };
        }
      }
      return keepRaw(input, 'gif');
    }
    // Single-frame GIF — nothing to animate, so treat it as a still.
  }

  const { blob, w, h } = await processImage(input);
  return { blob, w, h, mime: 'image/webp', media: 'image' };
}

/** Intrinsic size and media kind behind a link, without downloading the bytes
 *  twice. Video links are probed with a metadata-only load (no CORS needed);
 *  image links are decoded through the usual fetch path. */
export async function probeMediaUrl(src: string): Promise<{ w: number; h: number; media: DayMediaKind; mime: string }> {
  const mime = mimeFromName(src);
  if (mime.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.preload = 'metadata';
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Could not load video')), { once: true });
    });
    return { w: video.videoWidth, h: video.videoHeight, media: 'video', mime };
  }
  const blob = await blobFromUrl(src);
  const bitmap = await createImageBitmap(blob);
  const size = { w: bitmap.width, h: bitmap.height };
  bitmap.close?.();
  return { ...size, media: 'image', mime: baseMime(blob.type) || mime };
}

/** Ingest a file (image, GIF or video), optimise it, delete any existing
 *  background media, and update the special day record in memory and store. */
export async function ingestMediaForDay(date: string, file: Blob, opts: MotionOptions = {}): Promise<void> {
  const store = useSpecialDaysStore.getState();
  const existing = store.specialDays.find((d) => d.date === date);

  const out = await processMedia(file, opts);

  // Clean up existing bytes if they were uploaded
  const existingImg = existing?.image;
  if (existingImg && existingImg.kind === 'upload') {
    await deleteImage(existingImg.id);
    if (isCloudMode()) {
      void deleteDayImage(existingImg.id);
    }
  }

  // Put new media into the local database and upload to cloud if in cloud mode
  const ref = await putImage(out.blob, out.w, out.h);
  if (isCloudMode()) {
    void uploadDayImage(ref.id, out.blob, out.mime);
  }

  // Apply to the special day
  store.setSpecialDay(date, {
    cosmetic: existing?.cosmetic ?? '',
    animations: existing?.animations ?? [],
    emoji: existing?.emoji ?? '',
    recurrence: existing?.recurrence ?? 'none',
    image: { kind: 'upload', id: ref.id, w: ref.w, h: ref.h, media: out.media, mime: out.mime },
    customStyle: undefined,
  });
}
