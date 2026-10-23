import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import './toolbarButton.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 'text' = labeled pill, 'icon' = 30x30 square. Default 'text'. */
  variant?: 'text' | 'icon';
  /** Selected/active visual state (accent-soft fill). */
  active?: boolean;
}

/** The shared toolbar button: subtle-gray Notion-style fill, tight padding.
 *  Used for every toolbar/header action across the app. */
export const ToolbarButton = forwardRef<HTMLButtonElement, Props>(function ToolbarButton(
  { variant = 'text', active = false, className = '', ...rest },
  ref,
) {
  const cls = ['tb', variant === 'icon' ? 'tb-icon' : 'tb-text', active ? 'is-active' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button ref={ref} className={cls} {...rest} />;
});
