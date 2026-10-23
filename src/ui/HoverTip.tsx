import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  type Placement,
} from '@floating-ui/react';
import { useSettingsStore } from '../app/settingsStore';
import './hoverTip.css';

interface HoverTipProps {
  /** Accessible name for the trigger, e.g. "Why On map is locked". */
  label: string;
  /** The trigger's visible content — usually a small icon. */
  children: ReactNode;
  /** Card body. A function form gets a `close` callback, so an action inside
   *  the card can dismiss it as it fires. */
  content: ReactNode | ((close: () => void) => ReactNode);
  placement?: Placement;
  /** Extra class on the trigger button. */
  className?: string;
}

/**
 * A hover card with interactive content: unlike a native `title` tooltip the
 * pointer can travel into it and click a link inside. Portaled, so it is never
 * clipped by the scrolling popover it lives in.
 */
export function HoverTip({ label, children, content, placement = 'top', className }: HoverTipProps) {
  const [open, setOpen] = useState(false);
  // Same interface-scale correction as AnchoredPopover: floating-ui measures in
  // visual px, the portaled card renders in layout px that the zoom multiplies
  // again. No-op at scale 1.
  const fontScale = useSettingsStore((s) => s.fontScale) || 1;

  const { refs, x, y, strategy, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  // safePolygon keeps the card open while the pointer crosses the gap towards
  // it, so a link inside is actually reachable.
  const hover = useHover(context, { handleClose: safePolygon() });
  const focus = useFocus(context);
  // Escape is left to whatever popover hosts the trigger — a hover card is not
  // worth stealing the key from the panel the user is actually editing.
  const dismiss = useDismiss(context, { escapeKey: false });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss]);

  const style: CSSProperties =
    fontScale === 1
      ? floatingStyles
      : {
          position: strategy,
          top: 0,
          left: 0,
          transform: `translate(${Math.round(x / fontScale)}px, ${Math.round(y / fontScale)}px)`,
        };

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        className={`hovertip-trigger${className ? ` ${className}` : ''}`}
        aria-label={label}
        {...getReferenceProps()}
      >
        {children}
      </button>
      {open && (
        <FloatingPortal>
          <div ref={refs.setFloating} style={style} className="hovertip-card" {...getFloatingProps()}>
            {typeof content === 'function' ? content(() => setOpen(false)) : content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
