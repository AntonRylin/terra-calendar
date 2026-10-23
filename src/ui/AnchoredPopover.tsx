import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  type Placement,
  type VirtualElement,
} from '@floating-ui/react';
import { useIsMobile } from './useMediaQuery';
import { useSettingsStore } from '../app/settingsStore';
import { useConfirmStore } from './confirmStore';
import { useAndroidBack } from '../app/androidBack';
import './popover.css';

interface AnchoredPopoverProps {
  /** A real DOM element or a floating-ui virtual element (e.g. a cursor point). */
  anchorEl: Element | VirtualElement;
  onClose(): void;
  children: ReactNode;
  placement?: Placement;
  /** Extra class appended to the popover / sheet container. */
  className?: string;
  /** If true, the popover width will match the anchor element's width (desktop only). */
  matchAnchorWidth?: boolean;
  /** When false, outside-press and Escape no longer close the popover. Set this
   *  while a child renders its own modal on top (e.g. the effects gallery) so a
   *  click on that modal — which lives outside this popover's DOM — doesn't also
   *  dismiss the panel underneath it. */
  dismissable?: boolean;
}

export function AnchoredPopover({
  anchorEl,
  onClose,
  children,
  placement = 'right',
  className,
  matchAnchorWidth,
  dismissable = true,
}: AnchoredPopoverProps) {
  const isMobile = useIsMobile();
  // The interface-scale zoom (html { zoom: var(--font-scale) }) creates two
  // coordinate spaces: getBoundingClientRect (which floating-ui reads) returns
  // VISUAL px, but the portaled popover renders in LAYOUT px that the same zoom
  // then multiplies again — so floating-ui's position lands ×scale too far out.
  // We undo that by dividing floating-ui's coordinates by the scale before
  // applying them. At scale 1 this is a no-op.
  const fontScale = useSettingsStore((s) => s.fontScale) || 1;
  // A real DOM anchor goes through elements.reference so useDismiss treats
  // clicks on it as "inside" (clicking the trigger again just toggles). A
  // virtual anchor (cursor point) must NOT be passed there — floating-ui
  // requires setPositionReference for virtual elements, and erroring otherwise.
  const isVirtualAnchor = !(anchorEl instanceof Element);
  const { refs, x, y, strategy, floatingStyles, context, placement: resolvedPlacement } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
    placement,
    middleware: [
      offset(8),
      flip(),
      shift({ padding: 8 }),
      ...(matchAnchorWidth
        ? [
            size({
              apply({ rects, elements }) {
                Object.assign(elements.floating.style, {
                  width: `${rects.reference.width}px`,
                });
              },
            }),
          ]
        : []),
    ],
    whileElementsMounted: autoUpdate,
    elements: isVirtualAnchor ? undefined : { reference: anchorEl },
  });
  const scaledFloatingStyles: CSSProperties =
    fontScale === 1
      ? floatingStyles
      : {
          position: strategy,
          top: 0,
          left: 0,
          transform: `translate(${Math.round(x / fontScale)}px, ${Math.round(y / fontScale)}px)`,
          willChange: 'transform',
        };
  useLayoutEffect(() => {
    if (isVirtualAnchor) refs.setPositionReference(anchorEl);
  }, [isVirtualAnchor, anchorEl, refs]);
  const confirmActive = useConfirmStore((s) => s.request !== null);
  const dismissOff = confirmActive || !dismissable;
  // Disabled on mobile. The sheet below never goes through refs.setFloating, so
  // floating-ui has no floating element to measure a press against and counts
  // every press — including taps on the sheet's own controls — as an outside
  // press, closing the panel on the first tap. The sheet does its own
  // dismissing: the backdrop's onClick, plus the Escape handler underneath.
  const dismiss = useDismiss(context, {
    enabled: !isMobile,
    outsidePress: dismissable,
    escapeKey: !dismissOff,
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  // On mobile the floating-ui dismiss isn't wired up (we render a sheet, not an
  // anchored element), so handle Escape ourselves.
  useEffect(() => {
    if (!isMobile || dismissOff) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMobile, onClose, dismissOff]);

  // Mobile: a full-width bottom sheet with a scrim instead of a tiny popover
  // anchored to a small tap target.
  if (isMobile) {
    return (
      <PhoneSheet className={className} onClose={onClose} dismissable={!dismissOff} backEnabled={dismissable}>
        {children}
      </PhoneSheet>
    );
  }

  const placementClass = resolvedPlacement.startsWith('left') ? 'popover-placement-left' : 'popover-placement-right';

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={scaledFloatingStyles}
        className={'popover' + (className ? ` ${className}` : '') + ` ${placementClass}`}
        {...getFloatingProps()}
      >
        {children}
      </div>
    </FloatingPortal>
  );
}

/* ---- Phone bottom sheet ------------------------------------------------- */

interface SheetApi {
  /** Close the sheet the way the scrim or the back gesture does (animated). */
  close(): void;
}

const SheetContext = createContext<SheetApi | null>(null);

/** Inside a phone sheet: its animated close. Null on desktop popovers. */
export function useSheet(): SheetApi | null {
  return useContext(SheetContext);
}

const CLOSE_MS = 200;

/** Where a press may start a swipe-down: the handle and the sheet header, but
 *  not the buttons inside the header. */
const DRAG_ZONE = '.sheet-grabber, .sheet-header, .sheet-drag-zone';
const NOT_DRAGGABLE = 'button, input, select, textarea, a, label, [role="button"]';

function PhoneSheet({
  className,
  onClose,
  dismissable,
  backEnabled,
  children,
}: {
  className?: string;
  onClose(): void;
  /** Scrim tap and swipe-down close the sheet. */
  dismissable: boolean;
  /** The back gesture closes the sheet. Stays on while a confirm dialog is up
   *  (that dialog registers above it and takes the back press first). */
  backEnabled: boolean;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
    timer.current = window.setTimeout(() => onCloseRef.current(), CLOSE_MS);
  }, []);

  // Android back gesture closes the topmost sheet. Off while a child modal
  // (which registers its own back handler) sits on top and owns dismissal.
  useAndroidBack(backEnabled, close);

  // Swipe down on the handle or header to dismiss.
  const drag = useRef<{ id: number; y0: number; t0: number; dy: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dismissable || e.button !== 0) return;
    const t = e.target as Element;
    if (!t.closest(DRAG_ZONE) || t.closest(NOT_DRAGGABLE)) return;
    drag.current = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || d.id !== e.pointerId || !el) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    el.style.transition = 'none';
    el.style.transform = `translateY(${d.dy}px)`;
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || d.id !== e.pointerId || !el) return;
    drag.current = null;
    const velocity = d.dy / Math.max(1, performance.now() - d.t0);
    const far = d.dy > Math.min(160, el.offsetHeight * 0.3);
    el.style.transition = '';
    el.style.transform = '';
    if (e.type === 'pointerup' && (far || (velocity > 0.5 && d.dy > 56))) {
      // Continue from where the finger left it rather than jumping back first.
      el.style.setProperty('--sheet-drag', `${d.dy}px`);
      close();
    }
  };

  return (
    <FloatingPortal>
      <div
        className={'popover-backdrop' + (closing ? ' is-closing' : '')}
        onClick={dismissable ? close : undefined}
      >
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          className={'popover popover-sheet' + (closing ? ' is-closing' : '') + (className ? ` ${className}` : '')}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div className="sheet-grabber" aria-hidden="true" />
          <SheetContext.Provider value={{ close }}>{children}</SheetContext.Provider>
        </div>
      </div>
    </FloatingPortal>
  );
}
