import type { DayImageRef } from '../../app/specialDaysStore';

/**
 * Built-in illustrated day backgrounds — the same hand-drawn scenes shown on the
 * landing page. Each is a self-contained SVG (no external refs), applied to a day
 * as a `url` image ref whose `src` is a data URI. That rides the existing image
 * pipeline exactly like a photo: it renders on `.day-fill` under the `.day-scrim`
 * and syncs as text (never uploaded). We deliberately do NOT go through the raw
 * CSS path — that sanitizer strips every `url(...)` for anti-beacon safety, which
 * would also strip a `url("data:image/svg+xml,…")`.
 */
export interface ScenePreset {
  /** Stable key — also used to derive the shared image-ref id. */
  id: string;
  name: string;
  /** Full SVG markup; whitespace is collapsed and the string encoded on demand. */
  svg: string;
}

/** Encode SVG markup into a compact `data:image/svg+xml,…` URI. */
export function sceneDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

/**
 * A day-image ref for a scene. Uses a stable id per preset so identical scenes
 * on different days dedupe in the resolver; `url` refs carry no stored bytes, so
 * sharing an id across days is safe. The nominal size matches the SVG viewBox
 * (only used as an aspect hint — the tile paints it `cover`).
 */
export function sceneImageRef(preset: ScenePreset): DayImageRef {
  return { kind: 'url', id: `scene-${preset.id}`, src: sceneDataUri(preset.svg), w: 160, h: 120 };
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'alpine-sunset',
    name: 'Alpine Sunset',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd9a0"/><stop offset="0.45" stop-color="#ff9a62"/>
        <stop offset="0.75" stop-color="#b34a67"/><stop offset="1" stop-color="#3a2450"/>
      </linearGradient></defs>
      <rect width="160" height="120" fill="url(#s)"/>
      <circle cx="112" cy="42" r="16" fill="#fff3c4" opacity="0.95"/>
      <path d="M0 120 L34 58 L60 92 L86 54 L120 108 L160 74 L160 120 Z" fill="#5a3a63"/>
      <path d="M0 120 L44 84 L78 108 L110 78 L142 110 L160 96 L160 120 Z" fill="#3a2450"/>
    </svg>`,
  },
  {
    id: 'still-lake',
    name: 'Still Lake',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
      <defs>
        <linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9dced"/><stop offset="1" stop-color="#7fb5d8"/></linearGradient>
        <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a97c4"/><stop offset="1" stop-color="#2b4a6f"/></linearGradient>
      </defs>
      <rect width="160" height="70" fill="url(#k)"/>
      <circle cx="40" cy="30" r="12" fill="#fff9e0"/>
      <path d="M0 70 L34 40 L70 70 Z" fill="#6f9a72"/>
      <path d="M46 70 L86 32 L130 70 Z" fill="#537a5b"/>
      <rect y="70" width="160" height="50" fill="url(#w)"/>
      <g stroke="#bfe0f0" stroke-width="2" stroke-linecap="round" opacity="0.5">
        <line x1="14" y1="84" x2="40" y2="84"/><line x1="58" y1="94" x2="94" y2="94"/>
        <line x1="104" y1="82" x2="134" y2="82"/><line x1="30" y1="106" x2="70" y2="106"/>
      </g>
      <ellipse cx="40" cy="80" rx="10" ry="4" fill="#fff9e0" opacity="0.35"/>
    </svg>`,
  },
  {
    id: 'starry-night',
    name: 'Starry Night',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
      <defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0b1a3a"/><stop offset="0.6" stop-color="#20306a"/><stop offset="1" stop-color="#3a3a72"/>
      </linearGradient></defs>
      <rect width="160" height="120" fill="url(#n)"/>
      <circle cx="120" cy="34" r="14" fill="#eef3ff"/>
      <circle cx="114" cy="30" r="14" fill="#16264f"/>
      <g fill="#ffffff">
        <circle cx="20" cy="20" r="1.2"/><circle cx="46" cy="40" r="1"/><circle cx="70" cy="18" r="1.4"/>
        <circle cx="92" cy="52" r="1"/><circle cx="30" cy="60" r="1"/><circle cx="140" cy="66" r="1.2"/>
        <circle cx="58" cy="70" r="1"/><circle cx="150" cy="22" r="1"/><circle cx="8" cy="44" r="1"/>
      </g>
      <path d="M0 120 L40 92 L84 104 L124 88 L160 100 L160 120 Z" fill="#0a1226"/>
    </svg>`,
  },
  {
    id: 'ocean-dusk',
    name: 'Ocean Dusk',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
      <defs><linearGradient id="o" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffcf8b"/><stop offset="0.4" stop-color="#ff8f6b"/>
        <stop offset="0.6" stop-color="#e05780"/><stop offset="1" stop-color="#7c3f77"/>
      </linearGradient></defs>
      <rect width="160" height="120" fill="url(#o)"/>
      <circle cx="80" cy="60" r="22" fill="#ffe6a8" opacity="0.95"/>
      <rect y="72" width="160" height="48" fill="#7c3f77" opacity="0.55"/>
      <g fill="#ffe6a8" opacity="0.6">
        <rect x="72" y="74" width="16" height="4" rx="2"/><rect x="70" y="82" width="20" height="4" rx="2"/>
        <rect x="66" y="92" width="28" height="4" rx="2"/><rect x="60" y="104" width="40" height="4" rx="2"/>
      </g>
    </svg>`,
  },
  {
    id: 'pine-forest',
    name: 'Pine Forest',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
      <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7ece4"/><stop offset="1" stop-color="#8fb9a8"/></linearGradient></defs>
      <rect width="160" height="120" fill="url(#f)"/>
      <g fill="#6f998a" opacity="0.7">
        <path d="M20 78 l10 -22 l10 22 z"/><path d="M44 78 l10 -22 l10 22 z"/><path d="M68 78 l10 -22 l10 22 z"/>
        <path d="M92 78 l10 -22 l10 22 z"/><path d="M116 78 l10 -22 l10 22 z"/><path d="M140 78 l10 -22 l10 22 z"/>
      </g>
      <g fill="#3f6b5c">
        <path d="M6 108 l14 -34 l14 34 z"/><path d="M34 108 l14 -34 l14 34 z"/><path d="M62 108 l14 -34 l14 34 z"/>
        <path d="M90 108 l14 -34 l14 34 z"/><path d="M118 108 l14 -34 l14 34 z"/><path d="M146 108 l14 -34 l14 34 z"/>
      </g>
      <rect y="106" width="160" height="14" fill="#2f5346"/>
    </svg>`,
  },
  {
    id: 'desert-dunes',
    name: 'Desert Dunes',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
      <defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9c2"/><stop offset="1" stop-color="#f7b56b"/></linearGradient></defs>
      <rect width="160" height="120" fill="url(#d)"/>
      <circle cx="118" cy="34" r="14" fill="#fff2d0"/>
      <path d="M0 78 q40 -18 80 0 t80 0 V120 H0 Z" fill="#e79a52"/>
      <path d="M0 96 q50 -16 100 2 t60 4 V120 H0 Z" fill="#c9793a"/>
      <path d="M0 110 q60 -10 120 4 t40 2 V120 H0 Z" fill="#a35f2e"/>
    </svg>`,
  },
  {
    id: 'aurora',
    name: 'Aurora',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
      <defs>
        <linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04122b"/><stop offset="1" stop-color="#0a2540"/></linearGradient>
        <linearGradient id="a2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38ef9d" stop-opacity="0"/><stop offset="0.5" stop-color="#38ef9d" stop-opacity="0.7"/><stop offset="1" stop-color="#2fb0d8" stop-opacity="0"/></linearGradient>
        <linearGradient id="a3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c6cff" stop-opacity="0"/><stop offset="0.5" stop-color="#7c6cff" stop-opacity="0.6"/><stop offset="1" stop-color="#38ef9d" stop-opacity="0"/></linearGradient>
      </defs>
      <rect width="160" height="120" fill="url(#a)"/>
      <g fill="#ffffff"><circle cx="24" cy="18" r="1"/><circle cx="60" cy="28" r="1"/><circle cx="100" cy="16" r="1.2"/><circle cx="138" cy="30" r="1"/><circle cx="12" cy="40" r="1"/></g>
      <path d="M0 20 C40 60 60 10 90 46 C120 80 140 30 160 60 L160 90 C140 60 120 100 90 74 C60 46 40 96 0 56 Z" fill="url(#a2)"/>
      <path d="M0 44 C36 78 66 34 100 66 C130 92 150 54 160 78 L160 100 C150 80 130 110 100 88 C66 62 36 100 0 74 Z" fill="url(#a3)" opacity="0.8"/>
      <path d="M0 120 L44 100 L92 110 L160 96 L160 120 Z" fill="#020a16"/>
    </svg>`,
  },
  {
    id: 'rolling-hills',
    name: 'Rolling Hills',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
      <defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd0f7"/><stop offset="1" stop-color="#cdeeff"/></linearGradient></defs>
      <rect width="160" height="120" fill="url(#h)"/>
      <circle cx="130" cy="28" r="13" fill="#fff4c2"/>
      <g fill="#ffffff" opacity="0.85"><ellipse cx="40" cy="30" rx="16" ry="7"/><ellipse cx="52" cy="26" rx="12" ry="6"/></g>
      <path d="M0 84 q40 -26 80 -6 t80 -8 V120 H0 Z" fill="#8fce6f"/>
      <path d="M0 100 q50 -20 100 -2 t60 -6 V120 H0 Z" fill="#5fa84e"/>
      <path d="M0 112 q60 -12 120 2 t40 0 V120 H0 Z" fill="#3f7c38"/>
    </svg>`,
  },
];
