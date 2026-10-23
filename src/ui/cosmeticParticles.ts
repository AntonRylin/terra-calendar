/**
 * Interactive dust for the "stardust" cosmetic (events and day tiles).
 *
 * One viewport-sized overlay canvas draws every active system. Hovering an
 * element with `.cosmetic-stardust` lays a grid of glowing particles over it;
 * the cursor pushes them away (inverse-falloff repulsion), a spring pulls each
 * one back to its home cell, and a press emits a radial burst. Systems fade in
 * on first hover and are torn down once the cursor leaves and the dust has
 * settled, so idle cost is zero (the always-on twinkle is CSS — see
 * `.cosmetic-stardust::after` in cosmetics.css).
 *
 * Everything is delegated at the document level, so any current or future host
 * that carries the class participates without render-code changes.
 */

const HOST_SELECTOR = '.cosmetic-stardust';

/** Physics tuning (CSS px and seconds). */
const REPEL_RADIUS = 48;
const REPEL_FORCE = 2600;
const SPRING_K = 140;
const DAMPING = 5.5;
const BURST_RADIUS = 80;
const BURST_SPEED = 420;
/** Target particle count per host; spacing widens on big hosts to hold it. */
const TARGET_COUNT = 220;
const MAX_DT = 1 / 30;

interface Particle {
  /** Home cell, relative to the host's rect. */
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** Twinkle phase offset so the dust doesn't blink in unison. */
  phase: number;
  /** Which of the system's two sprites this speck uses. */
  tinted: boolean;
}

interface System {
  host: Element;
  particles: Particle[];
  /** Cursor relative to the host rect, or null once the pointer has left. */
  cursor: { x: number; y: number } | null;
  alpha: number;
  fadingOut: boolean;
  spriteWhite: HTMLCanvasElement;
  spriteTint: HTMLCanvasElement;
}

/** A soft round glow sprite; drawImage beats per-particle shadowBlur by miles. */
function makeSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const size = 24;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
  grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.55)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** The host's solid colour lightened toward white, or warm gold when the host
 *  is image/gradient-filled (day tiles) and has no usable backgroundColor. */
function hostTint(host: Element): [number, number, number] {
  const m = getComputedStyle(host).backgroundColor.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (m && m[4] !== '0') {
    const lift = (v: number) => Math.round(v + (255 - v) * 0.55);
    return [lift(Number(m[1])), lift(Number(m[2])), lift(Number(m[3]))];
  }
  return [255, 214, 140];
}

function buildSystem(host: Element, rect: DOMRect): System {
  const spacing = Math.min(14, Math.max(6, Math.sqrt((rect.width * rect.height) / TARGET_COUNT)));
  const particles: Particle[] = [];
  for (let gy = spacing / 2; gy < rect.height; gy += spacing) {
    for (let gx = spacing / 2; gx < rect.width; gx += spacing) {
      const hx = gx + (Math.random() - 0.5) * spacing * 0.5;
      const hy = gy + (Math.random() - 0.5) * spacing * 0.5;
      particles.push({
        hx,
        hy,
        x: hx,
        y: hy,
        vx: 0,
        vy: 0,
        size: 2.4 + Math.random() * 2.2,
        phase: Math.random() * Math.PI * 2,
        tinted: Math.random() < 0.4,
      });
    }
  }
  const [r, g, b] = hostTint(host);
  return {
    host,
    particles,
    cursor: null,
    alpha: 0,
    fadingOut: false,
    spriteWhite: makeSprite(255, 255, 255),
    spriteTint: makeSprite(r, g, b),
  };
}

/**
 * Install the engine once (returns a teardown). No-ops when the user prefers
 * reduced motion — the CSS twinkle is disabled there too.
 */
export function installCosmeticParticles(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 120;';
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  document.body.appendChild(canvas);

  const systems = new Map<Element, System>();
  let raf = 0;
  let lastTime = 0;

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }
  sizeCanvas();

  function ensureLoop() {
    if (!raf && systems.size > 0) {
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min((now - lastTime) / 1000, MAX_DT);
    lastTime = now;

    const dpr = window.devicePixelRatio || 1;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx!.globalCompositeOperation = 'lighter';
    const t = now / 1000;

    for (const [el, sys] of systems) {
      if (!el.isConnected) {
        systems.delete(el);
        continue;
      }
      // Re-read every frame so the dust rides along with scrolling.
      const rect = el.getBoundingClientRect();

      sys.alpha += (sys.fadingOut ? -3 : 4) * dt;
      sys.alpha = Math.min(1, Math.max(0, sys.alpha));
      if (sys.fadingOut && sys.alpha === 0) {
        systems.delete(el);
        continue;
      }

      let unrest = 0;
      for (const p of sys.particles) {
        if (sys.cursor) {
          const dx = p.x - sys.cursor.x;
          const dy = p.y - sys.cursor.y;
          const d = Math.hypot(dx, dy);
          if (d < REPEL_RADIUS && d > 0.001) {
            const f = (REPEL_FORCE * (1 - d / REPEL_RADIUS) ** 2) / d;
            p.vx += dx * f * dt;
            p.vy += dy * f * dt;
          }
        }
        p.vx += (p.hx - p.x) * SPRING_K * dt;
        p.vy += (p.hy - p.y) * SPRING_K * dt;
        const damp = Math.exp(-DAMPING * dt);
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const disp = Math.hypot(p.x - p.hx, p.y - p.hy);
        unrest = Math.max(unrest, disp, Math.hypot(p.vx, p.vy) / 20);

        // Resting dust twinkles faintly; disturbed dust flares up.
        const twinkle = 0.22 + 0.14 * Math.sin(p.phase + t * 2.4);
        const excitement = Math.min(1, disp / 14);
        ctx!.globalAlpha = sys.alpha * Math.min(1, twinkle + excitement * 0.9);
        const sprite = p.tinted ? sys.spriteTint : sys.spriteWhite;
        const s = p.size * (1 + excitement * 0.8);
        ctx!.drawImage(sprite, rect.left + p.x - s / 2, rect.top + p.y - s / 2, s, s);
      }

      // Cursor gone and everything home again → fade out and free the system.
      if (!sys.cursor && !sys.fadingOut && unrest < 0.6) sys.fadingOut = true;
    }

    ctx!.globalAlpha = 1;
    ctx!.globalCompositeOperation = 'source-over';
    if (systems.size > 0) raf = requestAnimationFrame(frame);
  }

  function systemFor(host: Element): System {
    let sys = systems.get(host);
    if (!sys) {
      sys = buildSystem(host, host.getBoundingClientRect());
      systems.set(host, sys);
    }
    return sys;
  }

  function onPointerMove(e: PointerEvent) {
    const target = e.target as Element | null;
    const host = target?.closest?.(HOST_SELECTOR) ?? null;
    for (const [el, sys] of systems) {
      if (el !== host) sys.cursor = null;
    }
    if (host) {
      const rect = host.getBoundingClientRect();
      const sys = systemFor(host);
      sys.cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      sys.fadingOut = false;
      ensureLoop();
    }
  }

  function onPointerDown(e: PointerEvent) {
    const host = (e.target as Element | null)?.closest?.(HOST_SELECTOR);
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const sys = systemFor(host);
    sys.fadingOut = false;
    for (const p of sys.particles) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy);
      if (d < BURST_RADIUS && d > 0.001) {
        const speed = BURST_SPEED * (1 - d / BURST_RADIUS);
        p.vx += (dx / d) * speed;
        p.vy += (dy / d) * speed;
      }
    }
    ensureLoop();
  }

  function onPointerLeave() {
    for (const sys of systems.values()) sys.cursor = null;
  }

  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('resize', sizeCanvas);

  return () => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerdown', onPointerDown);
    document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('resize', sizeCanvas);
    if (raf) cancelAnimationFrame(raf);
    systems.clear();
    canvas.remove();
  };
}
