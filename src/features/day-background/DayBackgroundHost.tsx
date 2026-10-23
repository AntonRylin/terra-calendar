import { useEffect, useMemo, useRef, useState } from 'react';
import { useUiStore } from '../../app/uiStore';
import { useSpecialDaysStore, type DayCustomStyle, type DayImageRef } from '../../app/specialDaysStore';
import { compileCustomStyle } from '../../core/dayCss';
import { processMedia, blobFromUrl, mediaFileFromDataTransfer, probeMediaUrl } from './imageImport';
import { CLIP_CHOICES, DEFAULT_CLIP_SEC, canTranscodeMotion } from './videoImport';
import { DayMediaFill } from './DayMediaFill';
import { formatBytes } from '../../core/media';
import { putImage, getImageUrl } from '../../data/dayImageStore';
import { isCloudMode } from '../../data/createRepository';
import { uploadDayImage } from '../../data/cloudDayImages';
import { SCENE_PRESETS, sceneDataUri, sceneImageRef, type ScenePreset } from './scenePresets';
import { useCustomStylesStore } from '../../app/customStylesStore';
import { useIsMobile } from '../../ui/useMediaQuery';
import { CodeIcon, GradientIcon, LinkIcon, PhotoIcon, SceneIcon, VideoIcon } from './backgroundIcons';
import { useAndroidBack } from '../../app/androidBack';
import { BackIcon, CloseIcon } from '../../ui/sheetIcons';
import './dayBackground.css';

/** The five ways to set a background. 'home' is the method chooser. */
type View = 'home' | 'scene' | 'photo' | 'motion' | 'gradient' | 'code';

interface Method {
  id: Exclude<View, 'home'>;
  icon: JSX.Element;
  title: string;
  sub: string;
  /** Kept out of the main list — one line under an "Advanced" rule. */
  advanced?: boolean;
}

// One line each, describing the outcome rather than the mechanism. What the
// pipeline does to a file (re-encoding, sizes, codecs) is the app's problem,
// not something to put in front of someone choosing a background.
const METHODS: Method[] = [
  { id: 'scene', icon: <SceneIcon />, title: 'Scenes', sub: 'Ready-made illustrated backgrounds' },
  { id: 'photo', icon: <PhotoIcon />, title: 'Photo', sub: 'A picture from your device' },
  { id: 'motion', icon: <VideoIcon />, title: 'Video & GIF', sub: 'A short clip that plays on the day' },
  { id: 'gradient', icon: <GradientIcon />, title: 'Gradient', sub: 'Blend your own colours' },
  { id: 'code', icon: <CodeIcon />, title: 'Custom CSS', sub: 'Write raw background styles', advanced: true },
];

/** What the preview pane is currently painting. */
interface Preview { url: string; video: boolean }

const DEFAULT_RECIPE: Extract<DayCustomStyle, { kind: 'recipe' }> = {
  kind: 'recipe', gradient: 'linear', colors: ['#ee7752', '#e73c7e', '#23a6d5'], angle: 45,
  animation: 'shift', speedSec: 10,
};

export function DayBackgroundHost() {
  const target = useUiStore((s) => s.dayBackground);
  if (!target) return null;
  return <DayBackgroundModal key={target.date} date={target.date} />;
}

function DayBackgroundModal({ date }: { date: string }) {
  const close = useUiStore((s) => s.closeOverlays);
  const isPhone = useIsMobile();
  const { specialDays, setSpecialDayInMemory, removeSpecialDayInMemory, commit } = useSpecialDaysStore();
  const existing = specialDays.find((d) => d.date === date);

  // Always open on the method chooser: one clear step at a time.
  const [view, setView] = useState<View>('home');
  // Android back steps out of a method page first, then closes.
  useAndroidBack(true, () => (view === 'home' ? close() : setView('home')));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [recipe, setRecipe] = useState(
    existing?.customStyle?.kind === 'recipe' ? existing.customStyle : DEFAULT_RECIPE,
  );
  const [code, setCode] = useState(existing?.customStyle?.kind === 'raw' ? existing.customStyle.source : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Re-encoding runs in real time, so the clip's own length is the progress bar.
  const [progress, setProgress] = useState(0);
  const [clipSec, setClipSec] = useState<number>(DEFAULT_CLIP_SEC);
  const [resultBytes, setResultBytes] = useState<number | null>(null);
  // The bytes the current clip was cut from, so its length can be changed
  // after the fact. Only set by this session's imports.
  const sourceRef = useRef<Blob | null>(null);

  useEffect(() => {
    const img = existing?.image;
    if (!img) { setPreview(null); return; }
    const video = img.media === 'video';
    if (img.kind === 'url') setPreview({ url: img.src, video });
    else getImageUrl(img.id).then((url) => setPreview(url ? { url, video } : null));
  }, [existing?.image?.id]);

  useEffect(() => () => commit(), [commit]);

  const apply = (patch: { image?: DayImageRef; customStyle?: DayCustomStyle | undefined; cosmetic?: string }) => {
    setSpecialDayInMemory(date, {
      cosmetic: patch.cosmetic ?? existing?.cosmetic ?? '',
      animations: existing?.animations ?? [],
      emoji: existing?.emoji ?? '',
      recurrence: existing?.recurrence ?? 'none',
      image: patch.image,
      customStyle: patch.customStyle,
    });
  };

  // Replaced and removed images keep their bytes in IndexedDB: closing this
  // modal commits one undo step, and Ctrl+Z has to be able to put the old photo
  // back. sweepUnreferencedImages() collects whatever no day references on the
  // next launch, once no history can reach it.

  // One ingest path for every source: stills become WebP, video and animated
  // GIFs become a short muted clip (see processMedia). `load` is a thunk so a
  // link download shares the same busy/error/progress handling as a dropped
  // file — a failed fetch surfaces in the panel like anything else.
  const runIngest = async (load: () => Promise<Blob>, seconds = clipSec) => {
    setBusy(true); setError(''); setProgress(0); setResultBytes(null);
    try {
      const source = await load();
      const out = await processMedia(source, { maxSeconds: seconds, onProgress: setProgress });
      const ref = await putImage(out.blob, out.w, out.h);
      const url = await getImageUrl(ref.id);
      if (url) setPreview({ url, video: out.media === 'video' });
      if (isCloudMode()) void uploadDayImage(ref.id, out.blob, out.mime);
      // Kept so the clip length can be changed afterwards without asking for
      // the file again — the decision lands after there's something to judge.
      sourceRef.current = source;
      setResultBytes(out.blob.size);
      apply({
        image: { kind: 'upload', id: ref.id, w: ref.w, h: ref.h, media: out.media, mime: out.mime },
        customStyle: undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that file');
    } finally {
      setBusy(false);
    }
  };

  const ingest = (blob: Blob) => runIngest(async () => blob);
  const saveFromLink = (src: string) => runIngest(() => blobFromUrl(src));

  /** Re-cut the clip already applied, from the source kept above. */
  const changeClipLength = (seconds: number) => {
    setClipSec(seconds);
    const source = sourceRef.current;
    if (source) void runIngest(async () => source, seconds);
  };

  // "Keep as link": store the URL as a live ref (no upload). Probe once to record
  // intrinsic size and whether it needs a <video>, then discard the bytes.
  const keepAsLink = async (src: string) => {
    setBusy(true); setError('');
    try {
      const { w, h, media, mime } = await probeMediaUrl(src);
      const id = crypto.randomUUID();
      setPreview({ url: src, video: media === 'video' });
      apply({ image: { kind: 'url', id, src, w, h, media, mime }, customStyle: undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that link');
    } finally {
      setBusy(false);
    }
  };

  // Apply a built-in illustrated scene as this day's background. Rides the same
  // `url` image ref path as a pasted link, so it renders and syncs identically.
  const applyScene = async (preset: ScenePreset) => {
    setError('');
    setPreview({ url: sceneDataUri(preset.svg), video: false });
    apply({ image: sceneImageRef(preset), customStyle: undefined });
  };

  // Clear the day's background entirely and return to the chooser. If the day
  // carried nothing but a background, drop the whole record so it doesn't
  // linger as an empty entry.
  const resetBackground = async () => {
    setError('');
    setPreview(null);
    setResultBytes(null);
    sourceRef.current = null;
    setRecipe(DEFAULT_RECIPE);
    setCode('');
    const keepsRecord = !!(
      existing && (existing.cosmetic || existing.animations?.length || existing.emoji || existing.recurrence !== 'none')
    );
    if (keepsRecord) apply({ image: undefined, customStyle: undefined });
    else removeSpecialDayInMemory(date);
    setView('home');
  };

  // What the preview should paint for the current view.
  const previewStyle: DayCustomStyle | null = useMemo(() => {
    if (view === 'gradient') return recipe;
    if (view === 'code') return code ? { kind: 'raw', source: code } : null;
    if (view === 'home') return existing?.customStyle ?? null;
    return null; // scene / photo / motion → media, handled below
  }, [view, recipe, code, existing?.customStyle]);

  const previewCss = useMemo(
    () => (previewStyle ? compileCustomStyle(previewStyle, 'cd-preview') : ''),
    [previewStyle],
  );

  const showsMedia =
    view === 'photo' || view === 'scene' || view === 'motion' || (view === 'home' && !!existing?.image);

  // Only render the preview when there is actually something to show — loaded
  // media or a live style. An empty placeholder box would just be noise.
  const hasPreview = showsMedia ? !!preview : !!previewStyle;

  // Which method is currently applied to the day (for the "Current" badge).
  const currentKind: Exclude<View, 'home'> | null = existing?.image
    ? existing.image.media === 'video' || existing.image.mime === 'image/gif' ? 'motion'
      : existing.image.kind === 'url' && existing.image.id.startsWith('scene-') ? 'scene'
      : 'photo'
    : existing?.customStyle?.kind === 'recipe' ? 'gradient'
    : existing?.customStyle?.kind === 'raw' ? 'code'
    : null;
  const hasBackground = currentKind !== null;

  const activeMethod = METHODS.find((m) => m.id === view);

  return (
    <div className="dbg-backdrop" onClick={close}>
      <div className="dbg-modal" onClick={(e) => e.stopPropagation()}>
        {isPhone && <div className="sheet-grabber" aria-hidden="true" />}
        {isPhone ? (
          // Phone: the same sheet header as every other sheet — ✕ (or ← on a
          // method page) · title · Done.
          <div className="dbg-header dbg-header--phone">
            <button
              type="button"
              className="dbg-phone-icon"
              aria-label={view === 'home' ? 'Close' : 'Back'}
              onClick={view === 'home' ? close : () => setView('home')}
            >
              {view === 'home' ? <CloseIcon /> : <BackIcon />}
            </button>
            <span className="dbg-header-title">{activeMethod ? activeMethod.title : 'Day background'}</span>
            <button type="button" className="dbg-phone-done" onClick={close}>
              Done
            </button>
          </div>
        ) : (
        <div className="dbg-header">
          {view === 'home' ? (
            <span className="dbg-back-spacer" />
          ) : (
            <button className="dbg-back" onClick={() => setView('home')}>‹ Back</button>
          )}
          <span className="dbg-header-title">{activeMethod ? activeMethod.title : 'Day background'}</span>
          <button className="dbg-close" onClick={close} aria-label="Done">✕</button>
        </div>
        )}

        {previewStyle && <style>{previewCss}</style>}
        {hasPreview && (
          <div className="dbg-preview">
            {showsMedia && preview && <DayMediaFill url={preview.url} video={preview.video} />}
            {!showsMedia && previewStyle && <div className="day-fill cd-preview" />}
            <div className="day-scrim" />
            <span className="dbg-prev-num">{Number(date.slice(8, 10))}</span>
          </div>
        )}

        {error && <p className="dbg-error">{error}</p>}

        {view === 'home' && (
          <HomeView
            currentKind={currentKind}
            hasBackground={hasBackground}
            onPick={setView}
            onReset={resetBackground}
          />
        )}
        {view === 'scene' && <SceneView current={preview?.url ?? null} onPick={applyScene} />}
        {(view === 'photo' || view === 'motion') && (
          <MediaView
            kind={view}
            busy={busy}
            progress={progress}
            applied={currentKind === view}
            mediaKey={existing?.image?.id}
            resultBytes={resultBytes}
            clipSec={clipSec}
            canRecut={sourceRef.current !== null}
            onClipSec={changeClipLength}
            onIngest={ingest}
            onKeepLink={keepAsLink}
            onSaveLink={saveFromLink}
          />
        )}
        {view === 'gradient' && (
          <BuilderView recipe={recipe} onChange={(r) => { setRecipe(r); apply({ customStyle: r, image: undefined }); }} />
        )}
        {view === 'code' && (
          <CodeView code={code} onChange={(c) => { setCode(c); apply({ customStyle: c ? { kind: 'raw', source: c } : undefined, image: undefined }); }} />
        )}
      </div>
    </div>
  );
}

function HomeView({ currentKind, hasBackground, onPick, onReset }: {
  currentKind: Exclude<View, 'home'> | null;
  hasBackground: boolean;
  onPick: (v: View) => void;
  onReset: () => void;
}) {
  const row = (m: Method) => (
    <button
      key={m.id}
      type="button"
      className={`dbg-method ${currentKind === m.id ? 'on' : ''}`}
      onClick={() => onPick(m.id)}
    >
      <span className="dbg-method-icon">{m.icon}</span>
      <span className="dbg-method-text">
        <span className="dbg-method-title">
          {m.title}
          {currentKind === m.id && <span className="dbg-method-badge">Current</span>}
        </span>
        <span className="dbg-method-sub">{m.sub}</span>
      </span>
      <span className="dbg-method-chev" aria-hidden="true">›</span>
    </button>
  );

  return (
    <div className="dbg-body">
      <div className="dbg-methods">{METHODS.filter((m) => !m.advanced).map(row)}</div>

      {/* Custom CSS sits below a rule rather than in the list: it is the one
          method that assumes you write stylesheets, and four choices read as a
          menu where five read as a form. */}
      <div className="dbg-advanced">
        <span className="dbg-advanced-label">Advanced</span>
        {METHODS.filter((m) => m.advanced).map(row)}
      </div>

      {/* Scoped on purpose: this screen only owns the background. Clearing the
          whole day (style, effects, repeat and background) is "Reset changes"
          in the day panel behind this modal. */}
      {hasBackground && (
        <button type="button" className="dbg-reset" onClick={onReset}>
          Remove background
        </button>
      )}
    </div>
  );
}

/** The primary action of both media views: one big target that takes a drop, a
 *  click or a paste, and turns into the progress read-out while it works. */
function Dropzone({ icon, title, hint, busy, progress, showProgress, onPick }: {
  icon: JSX.Element;
  title: string;
  hint: string;
  busy: boolean;
  progress?: number;
  showProgress?: boolean;
  onPick: () => void;
}) {
  const pct = Math.round((progress ?? 0) * 100);
  return (
    <button type="button" className="dbg-dropzone" onClick={onPick} disabled={busy}>
      {busy ? (
        <>
          <span className="dbg-dropzone-title">{showProgress ? `Getting it ready… ${pct}%` : 'Getting it ready…'}</span>
          {showProgress && (
            <span className="dbg-progress" aria-hidden="true">
              <span className="dbg-progress-bar" style={{ width: `${pct}%` }} />
            </span>
          )}
        </>
      ) : (
        <>
          <span className="dbg-dropzone-icon" aria-hidden="true">{icon}</span>
          <span className="dbg-dropzone-title">{title}</span>
          <span className="dbg-dropzone-sub">{hint}</span>
        </>
      )}
    </button>
  );
}

/**
 * Once something is applied, the screen's job changes: it is no longer "find me
 * a file", it is "here's what you set". So the drop zone gives way to a single
 * summary row — what it is, what it cost, and the way back to picking — rather
 * than staying on screen with the result stacked underneath it.
 */
function AppliedRow({ summary, busy, progress, onReplace }: {
  summary: string;
  busy: boolean;
  progress?: number;
  onReplace: () => void;
}) {
  const pct = Math.round((progress ?? 0) * 100);
  if (busy) {
    return (
      <div className="dbg-applied">
        <span className="dbg-applied-text">Getting it ready… {pct}%</span>
        <span className="dbg-progress" aria-hidden="true">
          <span className="dbg-progress-bar" style={{ width: `${pct}%` }} />
        </span>
      </div>
    );
  }
  return (
    <div className="dbg-applied">
      <span className="dbg-applied-text">{summary}</span>
      <button type="button" className="dbg-replace" onClick={onReplace}>Replace</button>
    </div>
  );
}

/**
 * The web-address step. It stands in for the drop zone rather than sitting
 * under it: once you've said "from the web", a file target is answering a
 * question you already answered.
 *
 * The one choice inside it — download a copy or point at the live URL — is a
 * checkbox under the field, not a second button competing with Add. Saving a
 * copy is the default because it survives the link rotting.
 */
function LinkStep({ placeholder, hint, busy, onCancel, onSave, onKeepLive }: {
  placeholder: string;
  hint: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (src: string) => void;
  onKeepLive: (src: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [live, setLive] = useState(false);
  const src = url.trim();

  const submit = () => {
    if (!src || busy) return;
    (live ? onKeepLive : onSave)(src);
  };

  return (
    <div className="dbg-linkstep">
      <div className="dbg-linkhead">
        <span className="dbg-lab">From the web</span>
        <button type="button" className="dbg-linkcancel" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
      <div className="dbg-linkfield">
        <input
          autoFocus
          className="dbg-input"
          placeholder={placeholder}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          disabled={busy}
        />
        <button type="button" className="dbg-add" disabled={!src || busy} onClick={submit}>
          {busy ? '…' : 'Add'}
        </button>
      </div>
      <label className="dbg-check">
        <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} disabled={busy} />
        <span>Don’t save a copy — load it from the web each time</span>
      </label>
      <p className="dbg-tip">{hint}</p>
    </div>
  );
}

function SceneView({ current, onPick }: { current: string | null; onPick: (p: ScenePreset) => void }) {
  return (
    <div className="dbg-body">
      <div className="dbg-scenes">
        {SCENE_PRESETS.map((p) => {
          const uri = sceneDataUri(p.svg);
          return (
            <button
              key={p.id}
              type="button"
              className={`dbg-scene ${current === uri ? 'on' : ''}`}
              style={{ backgroundImage: `url("${uri}")` }}
              title={p.name}
              aria-pressed={current === uri}
              onClick={() => onPick(p)}
            >
              <span className="dbg-scene-name">{p.name}</span>
            </button>
          );
        })}
      </div>
      <p className="dbg-note">Tap a scene to set it as this day’s background.</p>
    </div>
  );
}

/**
 * Photo and Video & GIF are the same view with different nouns, and each has
 * exactly two states:
 *
 *   picking  — one drop zone, one line of guidance, one folded-away link path
 *   applied  — one summary row, plus (for a clip) the single adjustment worth
 *              offering, since the file it was cut from is still in hand
 *
 * Nothing from the picking state survives into the applied one. That is the
 * whole idea: a screen that has done its job should shrink, not accumulate.
 */
function MediaView({
  kind, busy, progress, applied, mediaKey, resultBytes, clipSec, canRecut,
  onClipSec, onIngest, onKeepLink, onSaveLink,
}: {
  kind: 'photo' | 'motion';
  busy: boolean;
  progress: number;
  applied: boolean;
  /** Changes whenever different media lands, which ends a "replace". */
  mediaKey?: string;
  resultBytes: number | null;
  clipSec: number;
  canRecut: boolean;
  onClipSec: (s: number) => void;
  onIngest: (b: Blob) => void;
  onKeepLink: (src: string) => void;
  onSaveLink: (src: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mobile = useIsMobile();
  const [replacing, setReplacing] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const motion = kind === 'motion';

  // New media landing is what ends a replace — however it arrived, file or link.
  useEffect(() => {
    setReplacing(false);
    setLinkOpen(false);
  }, [mediaKey]);

  const copy = motion
    ? {
        title: mobile ? 'Choose a video or GIF' : 'Drop a video or GIF here',
        tip: canTranscodeMotion()
          ? 'Trimmed, muted and shrunk to fit the day — usually a few hundred KB. It takes about as long as the clip.'
          : 'This browser can’t shrink video, so MP4, WebM and GIF files up to 4 MB are kept as they are.',
        link: 'Use a clip from the web',
        placeholder: 'https://….mp4',
        linkHint: 'A direct link to a video or GIF file — one ending in .mp4, .webm or .gif.',
        accept: 'video/*,image/gif',
        icon: <VideoIcon size={26} />,
        applied: resultBytes !== null
          ? `${clipSec}s clip · ${formatBytes(resultBytes)} · loops silently`
          : 'Clip set for this day',
      }
    : {
        title: mobile ? 'Choose a photo' : 'Drop a photo here',
        tip: 'Saved at day-tile size, so it stays small. Your original file isn’t touched.',
        link: 'Use a picture from the web',
        placeholder: 'https://…',
        linkHint: 'A direct link to an image file — one ending in .jpg, .png, .webp or .gif.',
        accept: 'image/*',
        icon: <PhotoIcon size={26} />,
        applied: resultBytes !== null ? `Photo · ${formatBytes(resultBytes)}` : 'Photo set for this day',
      };

  // Applied: the short state. One row, and for a clip the one knob that still
  // makes sense — offered only while the source it would re-cut is in hand.
  if (applied && !replacing) {
    return (
      <div className="dbg-body">
        <AppliedRow
          summary={copy.applied}
          busy={busy}
          progress={motion ? progress : undefined}
          onReplace={() => setReplacing(true)}
        />
        {motion && canRecut && (
          <>
            <span className="dbg-lab">Clip length</span>
            <div className="dbg-seg">
              {CLIP_CHOICES.map((s) => (
                <button key={s} className={clipSec === s ? 'on' : ''} disabled={busy} onClick={() => onClipSec(s)}>
                  {s}s
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Picking: exactly one way in at a time. Asking for the link swaps the drop
  // zone out for the field — leaving a "drop a file here" target above a URL
  // box you just asked for is two answers to a question you already answered.
  // (The drop and paste handlers stay live either way: a file arriving is
  // always a valid answer, whichever step is on screen.)
  return (
    <div className="dbg-body"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = mediaFileFromDataTransfer(e.dataTransfer); if (f) onIngest(f); }}
      onPaste={(e) => { const f = mediaFileFromDataTransfer(e.clipboardData); if (f) onIngest(f); }}
    >
      {linkOpen ? (
        <LinkStep
          placeholder={copy.placeholder}
          hint={copy.linkHint}
          busy={busy}
          onCancel={() => setLinkOpen(false)}
          onSave={onSaveLink}
          onKeepLive={onKeepLink}
        />
      ) : (
        <>
          <Dropzone
            icon={copy.icon}
            title={copy.title}
            hint={mobile ? 'from your camera roll or files' : 'or click to choose one · paste with Ctrl + V'}
            busy={busy}
            progress={progress}
            showProgress={motion}
            onPick={() => fileRef.current?.click()}
          />
          <p className="dbg-tip">{copy.tip}</p>
          <button type="button" className="dbg-more" onClick={() => setLinkOpen(true)}>
            <LinkIcon size={15} />
            {copy.link}
          </button>
        </>
      )}

      <input ref={fileRef} type="file" accept={copy.accept} hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onIngest(f); }} />
    </div>
  );
}

function BuilderView({ recipe, onChange }: {
  recipe: Extract<DayCustomStyle, { kind: 'recipe' }>;
  onChange: (r: Extract<DayCustomStyle, { kind: 'recipe' }>) => void;
}) {
  const set = (patch: Partial<typeof recipe>) => onChange({ ...recipe, ...patch });

  return (
    <div className="dbg-body">
      <label className="dbg-lab">Type</label>
      <div className="dbg-seg">
        {(['linear', 'radial', 'conic'] as const).map((g) => (
          <button key={g} className={recipe.gradient === g ? 'on' : ''} onClick={() => set({ gradient: g })}>{g}</button>
        ))}
      </div>
      <label className="dbg-lab">Colors</label>
      <div className="dbg-colors">
        {recipe.colors.map((c, i) => (
          <input key={i} type="color" value={c}
            onChange={(e) => set({ colors: recipe.colors.map((x, j) => (j === i ? e.target.value : x)) })} />
        ))}
        {recipe.colors.length < 5 && <button onClick={() => set({ colors: [...recipe.colors, '#ffffff'] })}>+</button>}
        {recipe.colors.length > 2 && <button onClick={() => set({ colors: recipe.colors.slice(0, -1) })}>−</button>}
      </div>
      <label className="dbg-lab">Angle {recipe.angle}°</label>
      <input type="range" min={0} max={360} value={recipe.angle} onChange={(e) => set({ angle: Number(e.target.value) })} />
      <label className="dbg-lab">Animation</label>
      <div className="dbg-seg">
        {(['none', 'shift', 'rotate', 'pulse'] as const).map((a) => (
          <button key={a} className={recipe.animation === a ? 'on' : ''} onClick={() => set({ animation: a })}>{a}</button>
        ))}
      </div>
      <label className="dbg-lab">Speed {recipe.speedSec}s</label>
      <input type="range" min={1} max={30} value={recipe.speedSec} onChange={(e) => set({ speedSec: Number(e.target.value) })} />

      <SaveStyleFlow style={recipe} />
    </div>
  );
}

function CodeView({ code, onChange }: { code: string; onChange: (c: string) => void }) {
  // No label — the placeholder shows the expected shape; the note states the guarantees.
  return (
    <div className="dbg-body">
      <textarea className="dbg-code" value={code} spellCheck={false}
        placeholder={'background: linear-gradient(-45deg,#ee7752,#23d5ab);\nbackground-size: 400% 400%;\nanimation: g 12s ease infinite;\n\n@keyframes g { 50% { background-position: 100% 50% } }'}
        onChange={(e) => onChange(e.target.value)} />
      <p className="dbg-note">Scoped to this day · @keyframes auto-renamed · remote url() &amp; layout-escape stripped</p>
      <SaveStyleFlow style={{ kind: 'raw', source: code }} disabled={!code.trim()} />
    </div>
  );
}

/** "Save as style" — an opener button, a naming popup, and a success popup.
 *  Saved styles appear in the day right-click Style grid and event style pickers. */
function SaveStyleFlow({ style, disabled }: { style: DayCustomStyle; disabled?: boolean }) {
  const addTemplate = useCustomStylesStore((s) => s.add);
  const [stage, setStage] = useState<'idle' | 'name' | 'done'>('idle');
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');

  const dismiss = () => { setStage('idle'); setName(''); };
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addTemplate(trimmed, style);
    setSavedName(trimmed);
    setName('');
    setStage('done');
  };

  return (
    <>
      <button type="button" className="dbg-save-open" disabled={disabled} onClick={() => setStage('name')}>
        Save as style
      </button>

      {stage === 'name' && (
        <div className="dbg-pop-backdrop" onClick={dismiss}>
          <div className="dbg-pop" role="dialog" aria-label="Save as style" onClick={(e) => e.stopPropagation()}>
            <span className="dbg-pop-title">Save as style</span>
            <input
              autoFocus
              className="dbg-input"
              placeholder="Style name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') dismiss();
              }}
            />
            <p className="dbg-note">Saved styles show up under “Style” when you right-click a day, and can be applied to events too.</p>
            <div className="dbg-pop-actions">
              <button type="button" className="dbg-pop-cancel" onClick={dismiss}>Cancel</button>
              <button type="button" className="dbg-save-btn" disabled={!name.trim()} onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="dbg-pop-backdrop" onClick={dismiss}>
          <div className="dbg-pop dbg-pop-done" role="dialog" aria-label="Style saved" onClick={(e) => e.stopPropagation()}>
            <span className="dbg-done-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
                strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="dbg-pop-title">Successfully saved style</span>
            <p className="dbg-note">“{savedName}” is now in the Style grid and event style pickers.</p>
            <button type="button" className="dbg-save-btn dbg-pop-ok" autoFocus onClick={dismiss}>OK</button>
          </div>
        </div>
      )}
    </>
  );
}
