import { useEffect, useRef } from 'react';
import { useMediaQuery } from '../../ui/useMediaQuery';
import './dayBackground.css';

/**
 * The one place a day background's media is painted — month tiles and the
 * background studio's preview both render through it, so a clip looks the same
 * wherever it appears.
 *
 * Stills (WebP, and GIFs, which animate by themselves) are a CSS background.
 * Video clips get a muted, looping <video> that:
 *   * only plays while its tile is on screen — a year of scrolling tiles would
 *     otherwise keep dozens of decoders alive at once
 *   * stays paused on its first frame under `prefers-reduced-motion`
 */
export function DayMediaFill({ url, video = false, className = '' }: {
  url: string;
  video?: boolean;
  className?: string;
}) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // play() predates promises; webviews that still return undefined would
    // throw on a .catch(), taking the tile's render down with them.
    const play = () => { const started = el.play(); if (started) void started.catch(() => {}); };
    if (reduceMotion) {
      el.pause();
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      play();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? play() : el.pause()),
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduceMotion, url, video]);

  if (!video) {
    return <div className={`day-fill ${className}`} aria-hidden="true" style={{ backgroundImage: `url("${url}")` }} />;
  }

  return (
    <div className={`day-fill ${className}`} aria-hidden="true">
      <video
        ref={ref}
        className="day-fill-video"
        src={url}
        autoPlay={!reduceMotion}
        loop
        muted
        playsInline
        preload="auto"
        tabIndex={-1}
        disablePictureInPicture
      />
    </div>
  );
}
