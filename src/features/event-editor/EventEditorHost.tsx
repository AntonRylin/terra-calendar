import { useEffect, useRef, useCallback } from 'react';
import { displayOccurrence } from '../../core/timezone';
import { addMinutesToTime, durationMinutes } from '../../core/timeOfDay';
import { useCalendarStore } from '../../app/store';
import { useSharedEventsStore } from '../../app/sharedEventsStore';
import { useVisibleEvent } from '../../app/visibleEvents';
import { eventOwnership } from '../../app/eventOwnership';
import { useUiStore } from '../../app/uiStore';
import { useSettingsStore } from '../../app/settingsStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { EventForm, type EventFormValues } from './EventForm';
import type { CalendarEvent } from '../../core/types';
import { confirmDialog, confirmChoice } from '../../ui/confirmStore';
import { useIsMobile } from '../../ui/useMediaQuery';
import { SheetHeader } from '../../ui/SheetParts';

export function EventEditorHost() {
  const target = useUiStore((s) => s.editor);
  if (!target) return null;
  return (
    <EditorPopover
      key={target.eventId}
      eventId={target.eventId}
      anchorEl={target.anchorEl}
      occurrenceDate={target.occurrenceDate}
    />
  );
}

function EditorPopover({
  eventId,
  anchorEl,
  occurrenceDate,
}: {
  eventId: string;
  anchorEl: Element;
  occurrenceDate?: string;
}) {
  const close = useUiStore((s) => s.closeOverlays);
  const isMobile = useIsMobile();
  const displayTimeZone = useSettingsStore((s) => s.displayTimeZone);
  // Own events and received shared ones both open here; which store an edit
  // goes back to is decided in handleSubmit.
  const event = useVisibleEvent(eventId);
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
  }, []);

  const handleSubmit = useCallback((values: EventFormValues) => {
    isSaved.current = true;
    // An event received through a share belongs to someone else: it is not in
    // the calendar store, and it goes back through the server-side editor RPC
    // (which re-checks permission) rather than the sync engine.
    if (useSharedEventsStore.getState().events.some((e) => e.id === eventId)) {
      void useSharedEventsStore.getState().edit(eventId, {
        title: values.title,
        description: values.description,
        date: values.date,
        time: values.time,
        endTime: values.endTime,
        tz: values.time ? displayTimeZone : undefined,
      });
      close();
      return;
    }
    void useCalendarStore.getState().updateEvent(eventId, {
      ...values,
      tz: values.time ? displayTimeZone : undefined,
    });
    close();
  }, [eventId, displayTimeZone, close]);

  const handleChange = useCallback((values: EventFormValues) => {
    // Live preview only applies to the user's own events; a shared one isn't in
    // this store, and its preview would be an edit to someone else's calendar.
    if (useSharedEventsStore.getState().events.some((e) => e.id === eventId)) return;
    useCalendarStore.getState().updateEventInMemory(eventId, {
      ...values,
      tz: values.time ? displayTimeZone : undefined,
    });
  }, [eventId, displayTimeZone]);

  if (!event) return null;

  // Show the event in the current display timezone; saving re-anchors it there
  // (the absolute instant is preserved since the form value is the converted one).
  const shown = displayOccurrence(event, event.date, displayTimeZone);
  // The end converts as start + duration, so it stays on the shown start's day.
  const shownEndTime =
    shown.time && event.time
      ? addMinutesToTime(shown.time, durationMinutes(event.time, event.endTime))
      : undefined;

  // Whose calendar this event lives on — drives whether it can be edited here.
  const owner = eventOwnership(event);

  const handleDeleteAll = useCallback(() => {
    isSaved.current = true;
    void useCalendarStore.getState().deleteEvent(eventId);
    close();
  }, [eventId, close]);

  const handleDeleteOccurrence = useCallback(() => {
    if (occurrenceDate && event) {
      const exdates = event.exdates || [];
      if (!exdates.includes(occurrenceDate)) {
        isSaved.current = true;
        void useCalendarStore.getState().updateEvent(eventId, {
          exdates: [...exdates, occurrenceDate],
        });
      }
    }
    close();
  }, [eventId, occurrenceDate, event, close]);

  const handleDeleteClick = useCallback(async () => {
    const isRecurring = Boolean(event.recurrence && occurrenceDate);
    if (isRecurring) {
      const choice = await confirmChoice({
        title: 'Delete recurring event',
        message: 'Would you like to delete only this occurrence, or all events in the series?',
        actions: [
          { label: 'Only this event', value: 'occurrence' },
          { label: 'All events', value: 'all', danger: true },
        ],
      });
      if (choice === 'occurrence') {
        handleDeleteOccurrence();
      } else if (choice === 'all') {
        handleDeleteAll();
      }
    } else {
      const confirmed = await confirmDialog({
        title: 'Delete event',
        message: `Are you sure you want to delete "${event.title}"?`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (confirmed) {
        handleDeleteAll();
      }
    }
  }, [event, occurrenceDate, handleDeleteOccurrence, handleDeleteAll]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
          return;
        }
        e.preventDefault();
        void handleDeleteClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteClick]);

  // A view-only shared calendar: show the event rather than a form whose every
  // save the owner's server would refuse.
  if (owner.readOnly) {
    return (
      <AnchoredPopover anchorEl={anchorEl} onClose={close}>
        {isMobile && <SheetHeader title="Event" />}
        <div className="event-readonly">
          <h3 className="event-readonly-title">{event.title}</h3>
          <p className="event-readonly-when">
            {shown.date}
            {shown.time ? ` · ${shown.time}${shownEndTime ? `–${shownEndTime}` : ''}` : ' · All day'}
          </p>
          {event.description && (
            <p className="event-readonly-description">{event.description}</p>
          )}
          <p className="event-readonly-note">
            On {owner.calendarName ?? 'a shared calendar'}, shared with you for viewing only.
          </p>
        </div>
      </AnchoredPopover>
    );
  }

  const sharedNote = (
    <p className="event-shared-note">
      On {owner.calendarName ?? 'a shared calendar'} — your changes are sent to everyone
      it’s shared with.
    </p>
  );

  return (
    <AnchoredPopover anchorEl={anchorEl} onClose={close}>
      {owner.foreign && !isMobile && sharedNote}
      <EventForm
        heading="Edit event"
        notice={owner.foreign && isMobile ? sharedNote : undefined}
        initial={{
          title: event.title,
          date: shown.date,
          time: shown.time,
          endTime: shownEndTime,
          description: event.description,
          recurrence: event.recurrence,
          color: event.color,
          cosmetic: event.cosmetic,
          showOnMinimap: event.showOnMinimap,
          showInUpcoming: event.showInUpcoming,
          calendarUrls: event.calendarUrls,
          type: event.type,
          reminders: event.reminders,
          shareInclude: event.shareInclude,
          shareExclude: event.shareExclude,
        }}
        submitLabel="Save"
        onSubmit={handleSubmit}
        onChange={handleChange}
        // Deleting someone else's event stays with its owner (see eventActions).
        onDelete={owner.foreign ? undefined : handleDeleteClick}
      />
    </AnchoredPopover>
  );
}
