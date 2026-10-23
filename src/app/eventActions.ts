import { addDays, parseISODate } from '../core/dates';
import { durationMinutes, minutesToTime, timeToMinutes } from '../core/timeOfDay';
import type { CalendarEvent } from '../core/types';
import type { ContextMenuItem } from '../ui/ContextMenu';
import { confirmChoice, confirmDialog } from '../ui/confirmStore';
import { useCalendarStore, type NewEventInput } from './store';
import { useEventClipboard } from './eventClipboard';
import { eventOwnership } from './eventOwnership';
import { useUiStore } from './uiStore';

/**
 * The things you can do to an event wherever it appears — the week grid, the
 * month grids, the upcoming list. Every view builds its right-click menu from
 * here, so an event answers to the same actions whichever one you found it in.
 */

/** Delete, asking first — and asking which, when the event is a series. */
export async function deleteEventWithConfirm(
  event: CalendarEvent,
  occurrenceDate?: string,
): Promise<void> {
  const { updateEvent, deleteEvent } = useCalendarStore.getState();
  const owner = eventOwnership(event);

  if (owner.readOnly) {
    // Informational, not a choice: the server would refuse the delete anyway.
    await confirmChoice({
      title: 'This event isn’t yours to delete',
      message: `“${event.title}” lives on ${owner.calendarName ?? 'a calendar'}, which is shared with you for viewing only.`,
      actions: [{ label: 'OK', value: 'ok', primary: true }],
      cancelLabel: null,
    });
    return;
  }

  // Received through a cloud share. Editors may reschedule, but deleting
  // someone else's event outright stays with its owner.
  if (event.sharedBy) {
    await confirmChoice({
      title: 'Only the owner can delete this',
      message: `“${event.title}” is on ${owner.calendarName ?? 'a shared calendar'}. You can change it, but deleting it is up to whoever owns the calendar.`,
      actions: [{ label: 'OK', value: 'ok', primary: true }],
      cancelLabel: null,
    });
    return;
  }

  // Deleting an event on a shared calendar deletes it for its owner too — a
  // consequence worth spelling out before it happens.
  if (owner.foreign) {
    const confirmed = await confirmDialog({
      title: 'Delete from a shared calendar?',
      message: `“${event.title}” lives on ${owner.calendarName ?? 'a shared calendar'}. Deleting it removes it for everyone it’s shared with, including its owner.`,
      confirmLabel: 'Delete for everyone',
      danger: true,
    });
    if (confirmed) await deleteEvent(event.id);
    return;
  }

  if (event.recurrence && occurrenceDate) {
    const choice = await confirmChoice({
      title: 'Delete recurring event',
      message: 'Would you like to delete only this occurrence, or all events in the series?',
      actions: [
        { label: 'Only this event', value: 'occurrence' },
        { label: 'All events', value: 'all', danger: true },
      ],
    });
    if (choice === 'occurrence') {
      const exdates = event.exdates || [];
      if (!exdates.includes(occurrenceDate)) {
        await updateEvent(event.id, { exdates: [...exdates, occurrenceDate] });
      }
    } else if (choice === 'all') {
      await deleteEvent(event.id);
    }
    return;
  }
  const confirmed = await confirmDialog({
    title: 'Delete event',
    message: `Are you sure you want to delete "${event.title}"?`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (confirmed) await deleteEvent(event.id);
}

/** How many days a multi-day event covers, beyond its first. */
function spanDays(event: CalendarEvent): number {
  if (!event.endDate) return 0;
  return Math.round(
    (parseISODate(event.endDate).getTime() - parseISODate(event.date).getTime()) / 86_400_000,
  );
}

/**
 * What a copy of an event carries. A copy is always a one-off: duplicating a
 * series would leave two of them running over each other, so only the
 * occurrence in hand is copied, with whatever that day overrode.
 */
function copyOf(
  event: CalendarEvent,
  occurrenceDate: string,
  target: { date: string; time?: string },
): NewEventInput {
  const override = event.recurrence ? event.dayOverrides?.[occurrenceDate] : undefined;
  const time = override?.time !== undefined ? override.time : event.time;
  // A copy of someone else's event is the user's own: it must not be written
  // back to the shared calendar it came from (which may refuse writes anyway).
  const calendarUrls = eventOwnership(event).foreign ? undefined : event.calendarUrls;
  const days = spanDays(event);
  const at = target.time ?? time;
  // Landing at a new time takes the event's length with it.
  const endTime =
    at && time && event.endTime
      ? minutesToTime(Math.min(timeToMinutes(at) + durationMinutes(time, event.endTime), 24 * 60 - 1))
      : event.endTime;
  return {
    title: override?.title ?? event.title,
    date: target.date,
    endDate: days ? addDays(target.date, days) : undefined,
    time: at,
    endTime,
    description: event.description,
    type: event.type,
    color: event.color,
    cosmetic: event.cosmetic,
    tz: event.tz,
    showOnMinimap: event.showOnMinimap,
    showInUpcoming: event.showInUpcoming,
    calendarUrls,
    recurrence: null,
  };
}

/** A second copy where the event already is. */
export async function duplicateEvent(
  event: CalendarEvent,
  occurrenceDate: string,
): Promise<void> {
  const date = event.recurrence ? occurrenceDate : event.date;
  await useCalendarStore.getState().addEvent(copyOf(event, occurrenceDate, { date }));
}

/** Drop whatever is on the clipboard at a date, and an hour if one was aimed
 *  at. Leaves it on the clipboard, so it can be pasted again. */
export async function pasteEvent(target: { date: string; time?: string }): Promise<void> {
  const copied = useEventClipboard.getState().copied;
  if (!copied) return;
  await useCalendarStore
    .getState()
    .addEvent(copyOf(copied.event, copied.occurrenceDate, target));
}

/** True when the event carries a look of its own, rather than its category's. */
export function hasCustomStyle(event: CalendarEvent): boolean {
  return Boolean(event.color || event.cosmetic);
}

/** Hand the event back to its category's colour and cosmetic. */
export async function resetEventStyle(event: CalendarEvent): Promise<void> {
  await useCalendarStore
    .getState()
    .updateEvent(event.id, { color: undefined, cosmetic: undefined });
}

export interface EventMenuOptions {
  event: CalendarEvent;
  /** The day of the event that was clicked — which occurrence, for a series. */
  occurrenceDate: string;
  /** What the menu and any editor it opens hang off. */
  anchorEl: Element;
  /** Set for a multi-day event, which is modified through the span editor. */
  span?: { start: string; end: string };
  /** A view's own actions, listed after the shared ones but before Delete —
   *  which stays last wherever it appears. */
  extra?: ContextMenuItem[];
}

/** The actions every view offers on an event, in one order everywhere. */
export function buildEventMenuItems(opts: EventMenuOptions): ContextMenuItem[] {
  const { event, occurrenceDate, anchorEl, span, extra } = opts;
  // An event on a view-only shared calendar can be copied out but not changed:
  // every write below would be refused by the owner's server.
  const readOnly = eventOwnership(event).readOnly;
  const items: ContextMenuItem[] = [];
  if (!readOnly) {
    items.push({
      label: 'Modify',
      onClick: () => {
        const ui = useUiStore.getState();
        if (span) ui.openSpanEdit(event.id, span.start, span.end, anchorEl);
        else ui.openEditor(event.id, anchorEl, occurrenceDate);
      },
    });
  }
  items.push(
    {
      label: 'Copy',
      onClick: () => useEventClipboard.getState().copy(event, occurrenceDate),
    },
    { label: 'Duplicate', onClick: () => void duplicateEvent(event, occurrenceDate) },
  );
  if (!readOnly && hasCustomStyle(event)) {
    items.push({ label: 'Reset style', onClick: () => void resetEventStyle(event) });
  }
  if (extra) items.push(...extra);
  items.push({
    label: 'Delete',
    danger: true,
    onClick: () => void deleteEventWithConfirm(event, occurrenceDate),
  });
  return items;
}
