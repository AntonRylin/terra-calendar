import { useEffect, useState } from 'react';
import type { SpecialDay } from '../../app/specialDaysStore';
import { getImageUrl } from '../../data/dayImageStore';

/** Resolve every day-background ref in `specialDays` to a usable URL, keyed by
 *  media id — stills and video clips alike, since an object URL serves a
 *  <video> as happily as a background-image. `url` refs resolve to their live
 *  `src`; `upload` refs resolve to a cached IndexedDB object URL. Keyed on the
 *  set of (id|src) pairs so editing unrelated days doesn't re-fire, and only
 *  ids currently in use are kept. */
export function useDayImageUrls(specialDays: SpecialDay[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  const refs = specialDays
    .map((d) => d.image)
    .filter((img): img is NonNullable<SpecialDay['image']> => !!img);
  const idKey = Array.from(
    new Set(refs.map((img) => (img.kind === 'url' ? `url:${img.id}:${img.src}` : `up:${img.id}`))),
  )
    .sort()
    .join(',');

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      refs.map(async (img) => {
        if (img.kind === 'url') return [img.id, img.src] as const;
        return [img.id, await getImageUrl(img.id)] as const;
      }),
    )
      .then((pairs) => {
        if (cancelled) return;
        setUrls(Object.fromEntries(pairs.filter(([, url]) => url) as [string, string][]));
      })
      .catch((e) => console.error('Failed to resolve day images:', e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  return urls;
}
