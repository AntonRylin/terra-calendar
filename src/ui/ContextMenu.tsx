import type { VirtualElement } from '@floating-ui/react';
import { AnchoredPopover } from './AnchoredPopover';
import './contextMenu.css';

export interface ContextMenuItem {
  label: string;
  onClick(): void;
  danger?: boolean;
}

interface ContextMenuProps {
  /** A DOM element or cursor-point virtual element to anchor the menu to. */
  anchor: Element | VirtualElement;
  items: ContextMenuItem[];
  onClose(): void;
}

/** A lightweight right-click action menu rendered inside an AnchoredPopover. */
export function ContextMenu({ anchor, items, onClose }: ContextMenuProps) {
  return (
    <AnchoredPopover
      anchorEl={anchor}
      onClose={onClose}
      placement="bottom-start"
      className="popover--menu"
    >
      <div className="context-menu" role="menu">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={'context-menu-item' + (item.danger ? ' is-danger' : '')}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </AnchoredPopover>
  );
}

/** Build a zero-size virtual anchor at a cursor position. */
export function pointAnchor(x: number, y: number): VirtualElement {
  return {
    getBoundingClientRect: () =>
      ({ x, y, top: y, left: x, right: x, bottom: y, width: 0, height: 0 }) as DOMRect,
  };
}
