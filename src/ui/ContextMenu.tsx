import type { VirtualElement } from '@floating-ui/react';
import type { ReactNode } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { SheetMenuItem } from './SheetParts';
import { useIsMobile } from './useMediaQuery';
import './contextMenu.css';

export interface ContextMenuItem {
  label: string;
  onClick(): void;
  danger?: boolean;
  /** Leading 24px icon, shown on the phone menu sheet. */
  icon?: ReactNode;
}

interface ContextMenuProps {
  /** A DOM element or cursor-point virtual element to anchor the menu to. */
  anchor: Element | VirtualElement;
  items: ContextMenuItem[];
  onClose(): void;
  /** Heading for the phone menu sheet (e.g. the day it acts on). */
  title?: string;
}

/** A lightweight right-click action menu rendered inside an AnchoredPopover. */
export function ContextMenu({ anchor, items, onClose, title }: ContextMenuProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <AnchoredPopover anchorEl={anchor} onClose={onClose} className="popover--menu">
        <div className="context-menu" role="menu" aria-label={title}>
          {title && <div className="sheet-title">{title}</div>}
          {items.map((item, i) => (
            <SheetMenuItem
              key={i}
              icon={item.icon}
              label={item.label}
              danger={item.danger}
              onClick={() => {
                item.onClick();
                onClose();
              }}
            />
          ))}
        </div>
      </AnchoredPopover>
    );
  }
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
