import { memo, useLayoutEffect, useRef } from 'react';
import { minutesToTime } from '../../core/timeOfDay';

interface Props {
  title: string;
  startMin: number;
  endMin: number;
}

/** Shared by events and their move/create previews, so the text uses the same
 * layout while dragging. Only the title font changes; event geometry never does. */
export const WeekEventContent = memo(function WeekEventContent({ title, startMin, endMin }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    let active = true;

    const fit = () => {
      if (!active || box.clientWidth === 0 || box.clientHeight === 0) return;
      const width = box.clientWidth;
      const height = box.clientHeight;
      // Half-pixel steps keep the search bounded (at most seven measurements).
      // The height ceiling matches the 1.1 line-height in weekView.css.
      const ceiling = Math.min(48, Math.floor(height / 1.1 * 2) / 2);
      let low = Math.min(11, ceiling) * 2;
      let high = ceiling * 2;
      let best = low;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        text.style.fontSize = `${mid / 2}px`;
        if (text.scrollWidth <= width && text.scrollHeight <= height) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      text.style.fontSize = `${best / 2}px`;
      // Extremely crowded tiles retain a readable minimum and a full title on hover.
      box.title = text.scrollWidth > width || text.scrollHeight > height ? title : '';
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    // A late font load can change wrapping without changing the box dimensions.
    void document.fonts?.ready.then(fit);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [title]);

  const start = minutesToTime(startMin);
  const end = minutesToTime(endMin);
  return (
    <div className="wv-block-content">
      <div className="wv-block-times">
        <time className="wv-block-start" dateTime={start}>{start}</time>
        <time className="wv-block-end" dateTime={end}>{end}</time>
      </div>
      <div className="wv-block-title" ref={boxRef}>
        <span className="wv-title-text" ref={textRef}>{title}</span>
      </div>
    </div>
  );
});
