import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyDate, todayISO } from '../../core/dates';
import { dayOnMinimap, dayTime, dayTitle, spanEndDate } from '../../core/spans';
import type { CalendarEvent, DayOverride } from '../../core/types';
import { useCalendarStore } from '../../app/store';
import { useUiStore, type SpanDayTarget } from '../../app/uiStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { TimeField } from '../../ui/TimeField';
import { useIsMobile } from '../../ui/useMediaQuery';
import { SheetHeader, SheetRow } from '../../ui/SheetParts';
import { ClockIcon } from '../../ui/sheetIcons';
import '../event-editor/eventEditor.css';
import './spanEditor.css';

/**
 * Per-day flow for a span: a chooser ("This day" / "Whole holiday") and, when
 * editing a single day, a small form writing into the span's `dayOverrides`.
 * The editor previews changes live and rolls them back on cancel.
 */
export function SpanDayHost() {
  const target = useUiStore((s) => s.spanDay);
  const event = useCalendarStore((s) => s.events.find((e) => e.id === target?.eventId));
  if (!target || !event) return null;
  if (target.mode === 'choose') return <SpanDayChooser target={target} event={event} />;
  return <SpanDayEditor key={target.date} target={target} event={event} />;
}

function SpanDayChooser({ target, event }: { target: SpanDayTarget; event: CalendarEvent }) {
  const close = useUiStore((s) => s.closeOverlays);
  const openSpanEdit = useUiStore((s) => s.openSpanEdit);
  const openSpanDayEdit = useUiStore((s) => s.openSpanDayEdit);
  return (
    <AnchoredPopover anchorEl={target.anchorEl} onClose={close}>
      <div className="span-chooser">
        <div className="span-chooser-label">{friendlyDate(target.date, undefined, todayISO())}</div>
        <button
          className="span-chooser-btn"
          onClick={() => openSpanDayEdit(event.id, target.date, target.anchorEl)}
        >
          Edit this day
        </button>
        <button
          className="span-chooser-btn"
          onClick={() => openSpanEdit(event.id, event.date, spanEndDate(event), target.anchorEl)}
        >
          Edit whole holiday
        </button>
      </div>
    </AnchoredPopover>
  );
}

function SpanDayEditor({ target, event }: { target: SpanDayTarget; event: CalendarEvent }) {
  const close = useUiStore((s) => s.closeOverlays);
  const date = target.date;

  const backupEvents = useRef<CalendarEvent[]>([]);
  const isSaved = useRef(false);

  useEffect(() => {
    backupEvents.current = useCalendarStore.getState().events;
    isSaved.current = false;
    return () => {
      if (!isSaved.current) {
        useCalendarStore.setState({ events: backupEvents.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Merge this day's override into the span and apply it in memory. */
  const applyInMemory = useCallback(
    (override: DayOverride | null) => {
      const ev = useCalendarStore.getState().events.find((e) => e.id === event.id);
      if (!ev) return;
      const next = { ...(ev.dayOverrides ?? {}) };
      if (override) next[date] = override;
      else delete next[date];
      useCalendarStore.getState().updateEventInMemory(event.id, {
        dayOverrides: Object.keys(next).length ? next : undefined,
      });
    },
    [event.id, date],
  );

  const handleSave = useCallback(
    (override: DayOverride | null) => {
      applyInMemory(override);
      isSaved.current = true;
      void useCalendarStore.getState().commitCurrentState();
      close();
    },
    [applyInMemory, close],
  );

  return (
    <AnchoredPopover anchorEl={target.anchorEl} onClose={close}>
      <SpanDayForm
        date={date}
        initialTitle={dayTitle(event, date)}
        initialTime={dayTime(event, date) ?? ''}
        initialOnMap={dayOnMinimap(event, date)}
        spanTitle={event.title}
        spanOnMap={event.showOnMinimap !== false}
        hasOverride={!!event.dayOverrides?.[date]}
        onChange={applyInMemory}
        onSave={handleSave}
      />
    </AnchoredPopover>
  );
}

interface SpanDayFormProps {
  date: string;
  initialTitle: string;
  initialTime: string;
  initialOnMap: boolean;
  spanTitle: string;
  spanOnMap: boolean;
  hasOverride: boolean;
  /** Live preview on every edit. `null` = this day has no overrides. */
  onChange(override: DayOverride | null): void;
  /** `null` = clear this day's override (revert to span defaults). */
  onSave(override: DayOverride | null): void;
}

function SpanDayForm({
  date,
  initialTitle,
  initialTime,
  initialOnMap,
  spanTitle,
  spanOnMap,
  hasOverride,
  onChange,
  onSave,
}: SpanDayFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [time, setTime] = useState(initialTime);
  const [onMap, setOnMap] = useState(initialOnMap);
  const isMobile = useIsMobile();

  // Only persist fields that differ from the span's own values.
  const override: DayOverride = {};
  if (title.trim() && title.trim() !== spanTitle) override.title = title.trim();
  if (time) override.time = time;
  if (onMap !== spanOnMap) override.showOnMinimap = onMap;
  const computed = Object.keys(override).length ? override : null;

  useEffect(() => {
    onChange(computed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, time, onMap]);

  // Phones: sheet header with Save; no minimap, so no "On map" switch.
  if (isMobile) {
    return (
      <div className="event-editor event-editor--phone">
        <SheetHeader
          title={friendlyDate(date, undefined, todayISO())}
          action={{ label: 'Save', onClick: () => onSave(computed) }}
        />
        <input
          className="editor-title ee-title"
          aria-label="Title"
          placeholder={spanTitle}
          value={title}
          enterKeyHint="done"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave(computed)}
        />
        <div className="sheet-divider" />
        <SheetRow icon={<ClockIcon />}>
          <div className="ee-when">
            <TimeField value={time} onChange={setTime} ariaLabel="Time" clearable />
          </div>
        </SheetRow>
        {hasOverride && (
          <div className="ee-delete-row">
            <button type="button" className="sheet-text-btn is-danger" onClick={() => onSave(null)}>
              Reset day
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="event-editor">
      <div className="span-day-heading">{friendlyDate(date, undefined, todayISO())}</div>
      <input
        className="editor-title"
        aria-label="Title"
        placeholder={spanTitle}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSave(computed)}
        autoFocus
      />
      <div className="editor-row">
        <label className="editor-label">
          Time
          <TimeField value={time} onChange={setTime} ariaLabel="Time" clearable />
        </label>
      </div>
      <div className="minimap-toggle-row">
        <label className="ios-switch-label">
          On map
          <div className="ios-switch">
            <input type="checkbox" checked={onMap} onChange={(e) => setOnMap(e.target.checked)} />
            <span className="ios-switch-slider" />
          </div>
        </label>
      </div>
      <div className="editor-actions">
        {hasOverride ? (
          <button className="editor-delete tb tb-text" onClick={() => onSave(null)}>
            Reset day
          </button>
        ) : (
          <span />
        )}
        <button className="editor-save tb tb-text tb-primary" onClick={() => onSave(computed)}>
          Save
        </button>
      </div>
    </div>
  );
}
