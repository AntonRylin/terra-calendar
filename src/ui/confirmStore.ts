import { create } from 'zustand';

/** A single action button shown in a confirm dialog. */
export interface ConfirmAction {
  label: string;
  /** Value returned by the dialog promise when this action is chosen. */
  value: string;
  danger?: boolean;
  /** The default/primary action — visually emphasised and triggered by Enter. */
  primary?: boolean;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  actions: ConfirmAction[];
  /** Text of the dismiss button. Pass null to hide it. Defaults to "Cancel". */
  cancelLabel?: string | null;
}

interface ConfirmState {
  request: (ConfirmRequest & { resolve: (value: string | null) => void }) | null;
  open(req: ConfirmRequest): Promise<string | null>;
  /** Resolve the active request and close the dialog. */
  resolve(value: string | null): void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  open(req) {
    // Resolve any dialog already on screen as dismissed before opening the next.
    get().request?.resolve(null);
    return new Promise<string | null>((resolve) => {
      set({ request: { ...req, resolve } });
    });
  },
  resolve(value) {
    const active = get().request;
    set({ request: null });
    active?.resolve(value);
  },
}));

/**
 * Standardised replacement for `window.confirm`. Resolves to true when the
 * primary action is taken, false on cancel/dismiss. Works outside React.
 */
export function confirmDialog(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return useConfirmStore
    .getState()
    .open({
      title: opts.title,
      message: opts.message,
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      actions: [
        {
          label: opts.confirmLabel ?? 'Confirm',
          value: 'confirm',
          danger: opts.danger,
          primary: true,
        },
      ],
    })
    .then((value) => value === 'confirm');
}

/**
 * A multi-choice confirm (e.g. "Only this event" / "All events"). Resolves to
 * the chosen action's `value`, or null if dismissed.
 */
export function confirmChoice(req: ConfirmRequest): Promise<string | null> {
  return useConfirmStore.getState().open(req);
}
