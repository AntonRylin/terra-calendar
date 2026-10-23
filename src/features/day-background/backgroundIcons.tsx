/** Outline icons for the background studio — same feather-style set as the
 *  habit tabs (24px grid, stroked in currentColor), so a method row picks up
 *  the surrounding text colour instead of shouting in emoji colour. */
function icon(size: number, paths: JSX.Element): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

/** Gallery of ready-made scenes. */
export const SceneIcon = ({ size = 20 }: { size?: number }) =>
  icon(size, <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);

/** A still picture. */
export const PhotoIcon = ({ size = 20 }: { size?: number }) =>
  icon(size, <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5-6.5 7" /></>);

/** A video clip. */
export const VideoIcon = ({ size = 20 }: { size?: number }) =>
  icon(size, <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10.5l6-3.5v10l-6-3.5z" /></>);

/** Blended colours. */
export const GradientIcon = ({ size = 20 }: { size?: number }) =>
  icon(size, <><path d="M12 3.2l5.7 5.7a8 8 0 1 1-11.4 0z" /><path d="M12 12v8.5" opacity="0.45" /></>);

/** Raw CSS. */
export const CodeIcon = ({ size = 20 }: { size?: number }) =>
  icon(size, <><polyline points="15.5 7 20.5 12 15.5 17" /><polyline points="8.5 7 3.5 12 8.5 17" /></>);

/** A web address. */
export const LinkIcon = ({ size = 16 }: { size?: number }) =>
  icon(size, <><path d="M9.5 14.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14.5 9.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>);
