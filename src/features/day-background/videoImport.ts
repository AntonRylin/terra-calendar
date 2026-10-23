import { baseMime, evenSize, fitWithin } from '../../core/media';

/**
 * Motion backgrounds — re-encoding video clips and animated GIFs into something
 * a calendar tile can afford to carry.
 *
 * A day tile is a ~180px box, so nothing here needs source resolution. Every
 * clip is drawn through a downscaled canvas and recorded with MediaRecorder:
 *   * 480px longest edge, 15 fps, ~600 kbps VP9 → a few hundred KB for 6 s
 *   * audio is dropped entirely (the canvas stream has no audio track)
 *   * only the first `maxSeconds` are kept, since the tile loops anyway
 *
 * GIFs ride the same path rather than staying GIFs: GIF is by far the worst
 * animation container going (LZW, 256 colours, no interframe motion), and a
 * 4 MB GIF routinely lands under 200 KB as VP9 while looking better.
 *
 * Recording runs in real time — a 6 s clip takes ~6 s — so every entry point
 * reports progress.
 */

/** Longest edge of the encoded clip. Tiles are small; 480 leaves headroom for
 *  the year view's largest zoom without paying 1080p bitrates. */
export const MAX_MOTION_EDGE = 480;
export const MOTION_FPS = 15;
export const MOTION_BITRATE = 600_000;

/** Clip lengths offered in the studio, and the default. */
export const CLIP_CHOICES = [3, 6, 10] as const;
export const DEFAULT_CLIP_SEC = 6;

/** Ceiling for keeping source bytes untouched, used only when this webview
 *  can't re-encode. Well under the bucket's 8 MB object limit. */
export const MAX_RAW_MOTION_BYTES = 4 * 1024 * 1024;

/** Containers tried in order of how small they encode. WebKit webviews only
 *  offer MP4/H.264; Chromium and WebView2 take VP9. */
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1',
  'video/mp4',
];

/** The best recorder mime this webview supports, or null if it records none. */
export function pickMotionMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Whether video/GIF sources can be re-encoded here at all. Both halves matter:
 *  older WebKit builds ship MediaRecorder without canvas.captureStream. */
export function canTranscodeMotion(): boolean {
  return (
    pickMotionMime() !== null &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

export interface MotionResult {
  blob: Blob;
  w: number;
  h: number;
  mime: string;
}

export interface MotionOptions {
  /** Hard cap on the recorded clip, in seconds. */
  maxSeconds?: number;
  /** 0…1, roughly once per recorded frame. */
  onProgress?: (fraction: number) => void;
}

/**
 * Park a source element where it plays but can't be seen: 1px in the top-left
 * corner, all but transparent, behind everything.
 *
 * Not off-screen, and not `opacity: 0` — browsers throttle or outright pause
 * animated images they consider invisible, and a paused GIF records as a single
 * frozen frame. Being in the viewport and painted is what keeps it running.
 * (drawImage samples the intrinsic image, so the 1px box costs no quality.)
 */
function mountHidden(el: HTMLElement): () => void {
  el.style.position = 'fixed';
  el.style.left = '0';
  el.style.top = '0';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.opacity = '0.01';
  el.style.zIndex = '-1';
  el.style.pointerEvents = 'none';
  document.body.appendChild(el);
  return () => el.remove();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function onceEvent(el: HTMLElement, event: string, errorEvent = 'error'): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error(`Could not load ${event === 'loadeddata' ? 'video' : 'media'}`)); };
    const cleanup = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener(errorEvent, fail);
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener(errorEvent, fail, { once: true });
  });
}

/**
 * Record `paint` off a canvas for at most `seconds`, stopping early when
 * `isDone` reports the source ran out. Painting is driven by a fixed-rate timer
 * rather than rAF so the frame rate stays predictable in a background tab.
 */
async function recordCanvas(
  canvas: HTMLCanvasElement,
  seconds: number,
  paint: () => void,
  isDone: () => boolean,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const mimeType = pickMotionMime();
  if (!mimeType) throw new Error('This browser cannot re-encode video');

  const stream = canvas.captureStream(MOTION_FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: MOTION_BITRATE });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  paint(); // seed a first frame so the stream starts with real content
  recorder.start();
  const startedAt = Date.now();

  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      paint();
      const elapsed = (Date.now() - startedAt) / 1000;
      onProgress?.(Math.min(1, elapsed / seconds));
      if (elapsed >= seconds || isDone()) {
        clearInterval(timer);
        resolve();
      }
    }, 1000 / MOTION_FPS);
  });

  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  onProgress?.(1);

  // Store the container mime without codec parameters: it is what the bucket's
  // allowed_mime_types list and the object extension are keyed on.
  return new Blob(chunks, { type: baseMime(mimeType) });
}

function scaledCanvas(srcW: number, srcH: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number } {
  const { w, h } = evenSize(fitWithin(srcW || 2, srcH || 2, MAX_MOTION_EDGE));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return { canvas, ctx, w, h };
}

/** Decode → downscale → re-encode a video file as a short muted clip. */
export async function processVideo(input: Blob, opts: MotionOptions = {}): Promise<MotionResult> {
  const maxSeconds = opts.maxSeconds ?? DEFAULT_CLIP_SEC;
  const url = URL.createObjectURL(input);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const unmount = mountHidden(video);

  try {
    await onceEvent(video, 'loadeddata');
    const { canvas, ctx, w, h } = scaledCanvas(video.videoWidth, video.videoHeight);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : maxSeconds;
    const seconds = Math.min(maxSeconds, duration);

    let ended = false;
    video.addEventListener('ended', () => { ended = true; }, { once: true });
    video.currentTime = 0;
    await video.play();

    const blob = await recordCanvas(
      canvas,
      seconds,
      () => ctx.drawImage(video, 0, 0, w, h),
      () => ended,
      opts.onProgress,
    );
    video.pause();
    return { blob, w, h, mime: blob.type };
  } finally {
    unmount();
    URL.revokeObjectURL(url);
  }
}

/** How long to record a GIF for: one full loop, capped, and short loops are
 *  repeated so a 200 ms animation doesn't become a two-frame clip. */
function gifClipSeconds(durationSec: number | undefined, maxSeconds: number): number {
  const loop = durationSec && durationSec > 0 ? durationSec : maxSeconds;
  const passes = loop < 1 ? Math.ceil(1 / loop) : 1;
  return Math.min(maxSeconds, loop * passes);
}

/** WebCodecs' ImageDecoder, where this webview has it. Typed locally: the DOM
 *  lib doesn't declare it yet. */
interface GifDecoder {
  completed: Promise<void>;
  tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } | null };
  decode(init: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
}
function imageDecoderCtor(): (new (init: { data: ArrayBuffer; type: string }) => GifDecoder) | null {
  return (globalThis as any).ImageDecoder ?? null;
}

/** Whether an <img> is actually animating into `ctx` — sampled, not assumed.
 *  Browsers stop advancing animated images they consider invisible, and some
 *  webviews never consider a 1px hidden one visible, which would otherwise
 *  record a frozen frame. `frameDelay` keeps the wait proportionate. */
async function samplesDiffer(
  draw: () => void,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frameDelay: number,
): Promise<boolean> {
  const shot = () => { draw(); return ctx.getImageData(0, 0, w, h).data; };
  const first = shot();
  const step = Math.min(300, Math.max(60, frameDelay * 1000 * 1.5));
  for (let i = 0; i < 3; i++) {
    await sleep(step);
    const next = shot();
    for (let p = 0; p < first.length; p += 97) {
      if (Math.abs(first[p] - next[p]) > 6) return true;
    }
  }
  return false;
}

/**
 * Re-encode an animated GIF as a video clip, one full loop long. Returns null
 * when this webview can't capture the animation at all, so the caller can fall
 * back to keeping the GIF as-is (which animates fine as a CSS background).
 *
 * Preferred path: decode the GIF frame by frame with WebCodecs and hold each
 * one for its own delay. Frames then come out exactly as authored, whatever
 * the page is doing.
 *
 * Fallback (webviews without ImageDecoder): let an <img> animate itself and
 * sample it — which only works while the browser considers that <img> visible,
 * hence mountHidden's very deliberate 1px-in-the-corner placement, and the
 * samplesDiffer() check before anything is recorded.
 */
export async function processGif(
  input: Blob,
  opts: MotionOptions & { durationSec?: number; frameDelaySec?: number } = {},
): Promise<MotionResult | null> {
  const maxSeconds = opts.maxSeconds ?? DEFAULT_CLIP_SEC;
  const seconds = gifClipSeconds(opts.durationSec, maxSeconds);
  const Decoder = imageDecoderCtor();

  if (Decoder) {
    const decoder = new Decoder({ data: await input.arrayBuffer(), type: 'image/gif' });
    let frame: VideoFrame | null = null;
    try {
      // `tracks.ready` is what settles selectedTrack — without it the track is
      // still null and every GIF looks like a one-frame still.
      await decoder.tracks.ready;
      await decoder.completed;
      const frameCount = Math.max(1, decoder.tracks.selectedTrack?.frameCount ?? 1);
      frame = (await decoder.decode({ frameIndex: 0 })).image;
      const { canvas, ctx, w, h } = scaledCanvas(frame.displayWidth, frame.displayHeight);

      // The frame cursor advances on its own clock, one decoded frame alive at
      // a time; the recorder paints whatever is current at its own 15 fps.
      let stop = false;
      const advance = (async () => {
        const startedAt = Date.now();
        for (let i = 1; !stop && (Date.now() - startedAt) / 1000 < seconds; i++) {
          // VideoFrame.duration is microseconds, and may be absent.
          await sleep(Math.max(20, (frame?.duration ?? 100_000) / 1000));
          if (stop) break;
          const next = (await decoder.decode({ frameIndex: i % frameCount })).image;
          frame?.close();
          frame = next;
        }
      })();

      const blob = await recordCanvas(
        canvas,
        seconds,
        () => { if (frame) ctx.drawImage(frame, 0, 0, w, h); },
        () => false,
        opts.onProgress,
      );
      stop = true;
      await advance.catch(() => {});
      return { blob, w, h, mime: blob.type };
    } finally {
      frame?.close();
      decoder.close();
    }
  }

  const url = URL.createObjectURL(input);
  const img = new Image();
  img.src = url;
  const unmount = mountHidden(img);
  try {
    await onceEvent(img, 'load');
    const { canvas, ctx, w, h } = scaledCanvas(img.naturalWidth, img.naturalHeight);
    const paint = () => ctx.drawImage(img, 0, 0, w, h);
    if (!(await samplesDiffer(paint, ctx, w, h, opts.frameDelaySec ?? 0.12))) return null;

    const blob = await recordCanvas(canvas, seconds, paint, () => false, opts.onProgress);
    return { blob, w, h, mime: blob.type };
  } finally {
    unmount();
    URL.revokeObjectURL(url);
  }
}

/** Intrinsic pixel size of a video blob, read from its metadata. */
export async function videoDimensions(input: Blob): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(input);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.preload = 'metadata';
  try {
    await onceEvent(video, 'loadedmetadata');
    return { w: video.videoWidth, h: video.videoHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Intrinsic pixel size of an image blob, without re-encoding it. */
export async function imageDimensions(input: Blob): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(input);
  const img = new Image();
  img.src = url;
  try {
    await onceEvent(img, 'load');
    return { w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}
