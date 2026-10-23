import { useEffect, useState } from 'react';

/** Reactively track a CSS media query. SSR-safe (defaults to false). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    // Some environments (programmatic/emulated viewport changes) don't always
    // dispatch the matchMedia `change` event, so re-evaluate on resize too.
    window.addEventListener('resize', onChange);
    return () => {
      mql.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, [query]);

  return matches;
}

/** Phone-sized viewport. Must stay in sync with the `max-width: 768px`
 * breakpoint used across the mobile CSS overrides. */
export const MOBILE_QUERY = '(max-width: 768px)';

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
