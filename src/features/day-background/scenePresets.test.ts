import { describe, it, expect } from 'vitest';
import { SCENE_PRESETS, sceneDataUri, sceneImageRef } from './scenePresets';

describe('scenePresets', () => {
  it('has presets with unique ids and non-empty names/svg', () => {
    expect(SCENE_PRESETS.length).toBeGreaterThan(0);
    const ids = SCENE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of SCENE_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.svg).toContain('<svg');
    }
  });

  it('encodes SVG into a decodable data URI', () => {
    const uri = sceneDataUri('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    const decoded = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('<rect/>');
  });

  it('collapses whitespace so the encoded payload stays compact', () => {
    const uri = sceneDataUri('<svg>\n   <rect\n     x="1" />\n</svg>');
    const decoded = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
    expect(decoded).toBe('<svg> <rect x="1" /> </svg>');
  });

  it('builds a url image ref with a stable per-preset id and a data-URI src', () => {
    const preset = SCENE_PRESETS[0];
    const ref = sceneImageRef(preset);
    expect(ref.kind).toBe('url');
    expect(ref.id).toBe(`scene-${preset.id}`);
    if (ref.kind === 'url') expect(ref.src.startsWith('data:image/svg+xml,')).toBe(true);
    expect(ref.w).toBeGreaterThan(0);
    expect(ref.h).toBeGreaterThan(0);
    // Stable across calls, so identical scenes on different days dedupe.
    expect(sceneImageRef(preset).id).toBe(ref.id);
  });

  it('every preset SVG survives an encode/decode round-trip', () => {
    for (const p of SCENE_PRESETS) {
      const ref = sceneImageRef(p);
      if (ref.kind !== 'url') throw new Error('expected url ref');
      const decoded = decodeURIComponent(ref.src.slice('data:image/svg+xml,'.length));
      expect(decoded).toContain('<svg');
      expect(decoded).toContain('</svg>');
    }
  });
});
