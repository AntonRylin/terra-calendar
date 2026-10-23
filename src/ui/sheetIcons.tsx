/**
 * 24px outline icons for the phone sheets (leading row icons, sheet header
 * buttons). Material-style geometry, drawn with currentColor strokes so they
 * follow the theme. Desktop never renders these.
 */
import type { ReactNode } from 'react';

function Icon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const BackIcon = () => (
  <Icon>
    <path d="M20 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const ClockIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const CalendarIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const RepeatIcon = () => (
  <Icon>
    <path d="M17 3l3 3-3 3" />
    <path d="M4 12v-2a4 4 0 0 1 4-4h12" />
    <path d="M7 21l-3-3 3-3" />
    <path d="M20 12v2a4 4 0 0 1-4 4H4" />
  </Icon>
);

export const BellIcon = () => (
  <Icon>
    <path d="M18 16.5V11a6 6 0 0 0-12 0v5.5L4.5 18h15z" />
    <path d="M10 21h4" />
  </Icon>
);

export const TagIcon = () => (
  <Icon>
    <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.3 6.3a1.5 1.5 0 0 1-2.1 0z" />
    <circle cx="8" cy="8" r="1.4" />
  </Icon>
);

export const PaletteIcon = () => (
  <Icon>
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1 0 1.6-.8 1.2-1.7-.5-1.2.3-2.3 1.5-2.3H17a3.5 3.5 0 0 0 3.5-3.5c0-5.3-3.8-9.5-8.5-9.5z" />
    <circle cx="7.8" cy="11" r="1" />
    <circle cx="10.5" cy="7.4" r="1" />
    <circle cx="15" cy="8" r="1" />
  </Icon>
);

export const NotesIcon = () => (
  <Icon>
    <path d="M4 6.5h16M4 12h16M4 17.5h10" />
  </Icon>
);

export const ListIcon = () => (
  <Icon>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.6" />
  </Icon>
);

export const CheckIcon = ({ size = 24 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const SparkleIcon = () => (
  <Icon>
    <path d="M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z" />
    <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Icon>
);

export const ImageIcon = () => (
  <Icon>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="9.5" r="1.6" />
    <path d="M20.5 15.5l-4.5-4.5-8.5 8.5" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
