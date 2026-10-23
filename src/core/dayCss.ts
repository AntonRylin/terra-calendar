import type { DayCustomStyle } from '../app/specialDaysStore';

const MAX_CSS = 8000;

interface KeyframesBlock { name: string; inner: string }

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pull every @keyframes / @-webkit-keyframes block out of `source` (brace-
 *  counted), returning the remaining declaration text + the blocks found. */
export function extractKeyframes(source: string): { body: string; blocks: KeyframesBlock[] } {
  const blocks: KeyframesBlock[] = [];
  const lower = source.toLowerCase();
  let body = '';
  let i = 0;
  while (i < source.length) {
    const at = lower.indexOf('@keyframes', i);
    const atWk = lower.indexOf('@-webkit-keyframes', i);
    let next = -1;
    let kwLen = 0;
    if (at !== -1 && (atWk === -1 || at <= atWk)) { next = at; kwLen = '@keyframes'.length; }
    else if (atWk !== -1) { next = atWk; kwLen = '@-webkit-keyframes'.length; }
    if (next === -1) { body += source.slice(i); break; }
    body += source.slice(i, next);
    let j = next + kwLen;
    while (j < source.length && /\s/.test(source[j])) j++;
    let name = '';
    while (j < source.length && /[\w-]/.test(source[j])) { name += source[j]; j++; }
    while (j < source.length && source[j] !== '{') j++;
    if (source[j] !== '{') { i = j; continue; }
    let depth = 0;
    let inner = '';
    let k = j;
    for (; k < source.length; k++) {
      const ch = source[k];
      if (ch === '{') { depth++; if (depth === 1) continue; }
      if (ch === '}') { depth--; if (depth === 0) { k++; break; } }
      inner += ch;
    }
    if (name) blocks.push({ name, inner: inner.trim() });
    i = k;
  }
  return { body, blocks };
}

/** Decode CSS escape sequences so the denylist below can't be evaded by writing
 *  `\75rl(` for `url(` or `url\28 …\29`. Handles `\<1-6 hex>` (with an optional
 *  trailing space) and `\<char>` literal escapes. Used only to *inspect* a
 *  declaration for banned tokens — the original text is what gets emitted. */
export function decodeCssEscapes(s: string): string {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([^0-9a-fA-F])/g, (_m, hex, ch) => {
    if (hex) {
      const code = parseInt(hex, 16);
      if (code === 0 || code > 0x10ffff) return '�';
      try {
        return String.fromCodePoint(code);
      } catch {
        return '�';
      }
    }
    return ch ?? '';
  });
}

/** True if a single declaration (or keyframe step declaration) tries to do
 *  something unsafe. Checked against the escape-decoded form. */
function isUnsafeDeclaration(decl: string): boolean {
  const lower = decodeCssEscapes(decl).toLowerCase().replace(/\s+/g, ' ');
  if (lower.startsWith('@import')) return true;
  // Any resource-loading function: url(), image-set(), cross-fade(), element(),
  // -webkit-*(). These can beacon to an external host.
  if (/url\s*\(/.test(lower)) return true;
  if (/(?:^|[^-\w])(?:image-set|image|cross-fade|element|paint)\s*\(/.test(lower)) return true;
  if (lower.includes('expression(')) return true;
  if (/^position\s*:\s*(fixed|sticky)/.test(lower)) return true;
  if (/^behavior\s*:/.test(lower)) return true;
  if (/^-moz-binding\s*:/.test(lower)) return true;
  return false;
}

/** Drop unsafe declarations (split on ';'). Values containing ';' (rare) are a
 *  known limitation; resource-loading and escaping-out decls are removed. */
export function sanitizeDeclarations(decls: string): string {
  const noComments = decls.replace(/\/\*[\s\S]*?\*\//g, '');
  const parts = noComments.split(';').map((s) => s.trim()).filter(Boolean);
  return parts.filter((decl) => !isUnsafeDeclaration(decl)).join('; ');
}

/** Sanitize the declarations inside each `<selector>{…}` step of a keyframes
 *  body — these were previously emitted verbatim, so `@keyframes x {0%{background:
 *  url(…)}}` slipped past the declaration sanitizer entirely. */
export function sanitizeKeyframeInner(inner: string): string {
  return inner.replace(/\{([^{}]*)\}/g, (_m, decls) => `{${sanitizeDeclarations(decls)}}`);
}

/** Within animation/animation-name declarations only, rename keyframes refs. */
function namespaceAnimations(decls: string, blocks: KeyframesBlock[], scope: string): string {
  if (blocks.length === 0) return decls;
  return decls
    .split(';')
    .map((part) => {
      const t = part.trim();
      const lower = t.toLowerCase();
      if (!lower.startsWith('animation:') && !lower.startsWith('animation-name:')) return t;
      let out = t;
      for (const b of blocks) {
        out = out.replace(new RegExp('\\b' + escapeRe(b.name) + '\\b', 'g'), `${scope}-${b.name}`);
      }
      return out;
    })
    .filter(Boolean)
    .join('; ');
}

function finishParts(decls: string, blocks: KeyframesBlock[], scope: string): { decls: string; keyframes: string } {
  const safe = sanitizeDeclarations(decls).slice(0, MAX_CSS);
  return {
    decls: namespaceAnimations(safe, blocks, scope),
    keyframes: blocks.map((b) => `@keyframes ${scope}-${b.name}{${sanitizeKeyframeInner(b.inner)}}`).join('\n'),
  };
}

function emit(decls: string, blocks: KeyframesBlock[], scope: string): string {
  const { decls: namespaced, keyframes } = finishParts(decls, blocks, scope);
  return `.${scope}{${namespaced}}\n${keyframes}`.trim();
}

/** Sanitize + namespace a raw source without binding it to a selector — callers
 *  place the parts on their own selector list (saved raw-CSS templates land on
 *  every cosmetic host, not one day scope). */
export function compileRawParts(source: string, scope: string): { decls: string; keyframes: string } {
  const { body, blocks } = extractKeyframes(source);
  return finishParts(body, blocks, scope);
}

function recipeToParts(r: Extract<DayCustomStyle, { kind: 'recipe' }>): { decls: string; blocks: KeyframesBlock[] } {
  const stops = r.colors.join(', ');
  let bg: string;
  if (r.gradient === 'linear') bg = `linear-gradient(${r.angle}deg, ${stops})`;
  else if (r.gradient === 'radial') bg = `radial-gradient(circle at center, ${stops})`;
  else bg = `conic-gradient(from ${r.angle}deg, ${stops})`;

  let decls = `background: ${bg};`;
  const blocks: KeyframesBlock[] = [];
  const s = Math.max(1, Number(r.speedSec) || 8);

  if (r.animation === 'shift') {
    decls += ` background-size: 200% 200%; animation: move ${s}s ease infinite;`;
    blocks.push({ name: 'move', inner: '0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}' });
  } else if (r.animation === 'rotate') {
    decls += ` animation: spin ${s}s linear infinite;`;
    blocks.push({ name: 'spin', inner: 'from{transform:rotate(0deg) scale(1.8)}to{transform:rotate(360deg) scale(1.8)}' });
  } else if (r.animation === 'pulse') {
    decls += ` animation: pulse ${s}s ease-in-out infinite;`;
    blocks.push({ name: 'pulse', inner: '0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.12);opacity:1}' });
  }
  return { decls, blocks };
}

/** Compile a DayCustomStyle into a safe, day-scoped <style> body. */
export function compileCustomStyle(style: DayCustomStyle, scopeClass: string): string {
  if (style.kind === 'raw') {
    const { body, blocks } = extractKeyframes(style.source);
    return emit(body, blocks, scopeClass);
  }
  const { decls, blocks } = recipeToParts(style);
  return emit(decls, blocks, scopeClass);
}
