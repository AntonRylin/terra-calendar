import { useEffect, useRef, useCallback } from 'react';
import { todayISO } from '../../core/dates';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { useSettingsStore } from '../../app/settingsStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { EventForm, type EventFormValues } from './EventForm';
import type { CalendarEvent } from '../../core/types';

/**
 * Manual "add event" popover (opened from the Upcoming + button). Reuses the
 * editor's EventForm so a full event — date, time, title, description,
 * recurrence — can be created without scrolling the calendar to that date.
 */
export function EventCreateHost() {
  const target = useUiStore((s) => s.create);
  const close = useUiStore((s) => s.closeOverlays);
  const tempId = useRef<string>('');
  const backupEvents = useRef<CalendarEvent[]>([]);
  const isSaved = useRef(false);

  useEffect(() => {
    if (!target) return;
    tempId.current = target.eventId;
    backupEvents.current = useCalendarStore.getState().events;
    isSaved.current = false;

    return () => {
      if (!isSaved.current) {
        useCalendarStore.setState({ events: backupEvents.current });
      }
    };
  }, [target]);

  const handleSubmit = useCallback((values: EventFormValues) => {
    isSaved.current = true;
    const displayTimeZone = useSettingsStore.getState().displayTimeZone;
    useCalendarStore.getState().updateEventInMemory(tempId.current, {
      ...values,
      tz: values.time ? displayTimeZone : undefined,
    });
    void useCalendarStore.getState().commitCurrentState();
    close();
  }, [close]);

  const handleChange = useCallback((values: EventFormValues) => {
    const displayTimeZone = useSettingsStore.getState().displayTimeZone;
    const exists = useCalendarStore.getState().events.some((e) => e.id === tempId.current);
    if (values.title.trim().length > 0) {
      if (!exists) {
        const now = new Date().toISOString();
        useCalendarStore.getState().addEventInMemory({
          id: tempId.current,
          title: values.title.trim(),
          date: values.date,
          time: values.time,
          endTime: values.endTime,
          recurrence: values.recurrence,
          color: values.color,
          cosmetic: values.cosmetic,
          showOnMinimap: values.showOnMinimap,
          showInUpcoming: values.showInUpcoming,
          tz: values.time ? displayTimeZone : undefined,
          calendarUrls: values.calendarUrls,
          type: values.type,
          reminders: values.reminders,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        useCalendarStore.getState().updateEventInMemory(tempId.current, {
          ...values,
          tz: values.time ? displayTimeZone : undefined,
        });
      }
    } else {
      if (exists) {
        useCalendarStore.setState({
          events: useCalendarStore.getState().events.filter((e) => e.id !== tempId.current),
        });
      }
    }
  }, []);

  if (!target) return null;

  return (
    <AnchoredPopover anchorEl={target.anchorEl} onClose={close}>
      <EventForm
        initial={{ title: '', date: todayISO(), recurrence: null, color: '', showOnMinimap: true, showInUpcoming: true, reminders: [] }}
        submitLabel="Add"
        onSubmit={handleSubmit}
        onChange={handleChange}
      />
    </AnchoredPopover>
  );
}
