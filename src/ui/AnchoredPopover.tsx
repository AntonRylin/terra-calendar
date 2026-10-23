import { useEffect, useLayoutEffect, type CSSProperties, type ReactNode } from 'react';
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

  // Mobile: a full-width bottom sheet with a backdrop instead of a tiny popover
  // anchored to a small tap target.
  if (isMobile) {
    return (
      <FloatingPortal>
        <div className="popover-backdrop" onClick={onClose}>
          <div className={'popover popover-sheet' + (className ? ` ${className}` : '')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grabber" aria-hidden="true" />
            {children}
          </div>
        </div>
      </FloatingPortal>
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
