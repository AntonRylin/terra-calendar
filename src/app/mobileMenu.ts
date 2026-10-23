import { create } from 'zustand';

/** Phone layout: the slide-in drawer that holds the Upcoming panel. Opened
 *  from the burger in the calendar header (see MobileHeader). */
interface MobileMenuState {
  open: boolean;
  setOpen(open: boolean): void;
}

export const useMobileMenuStore = create<MobileMenuState>((set) => ({
  open: false,
  setOpen: (open) => set((s) => (s.open === open ? s : { open })),
}));

export const openMobileMenu = () => useMobileMenuStore.getState().setOpen(true);
export const closeMobileMenu = () => useMobileMenuStore.getState().setOpen(false);
