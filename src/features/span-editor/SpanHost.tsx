import { useCallback, useEffect, useRef } from 'react';
import type { CalendarEvent } from '../../core/types';
import { useCalendarStore } from '../../app/store';
import { useUiStore, type SpanEditorTarget } from '../../app/uiStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { SpanForm, type SpanFormValues } from './SpanForm';

/**
 * Create/edit popover for multi-day spans. Edits are applied to the store in
 * memory as the user types so the grid/minimap/upcoming preview them live; on
 * cancel (close without saving) the pre-edit snapshot is restored.
 */
export function SpanHost() {
  const target = useUiStore((s) => s.span);
  if (!target) return null;
  return <SpanPopover key={target.eventId ?? 'new'} target={target} />;
}

function SpanPopover({ target }: { target: SpanEditorTarget }) {
  const close = useUiStore((s) => s.closeOverlays);
  const existing = useCalendarStore((s) => s.events.find((e) => e.id === target.eventId));

  const tempId = useRef(crypto.randomUUID());
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

  /** Apply the form values to the store in memory (live preview). */
  const applyInMemory = useCallback(
    (values: SpanFormValues) => {
      const endDate = values.end > values.start ? values.end : undefined;
      const store = useCalendarStore.getState();
      if (target.eventId) {
        store.updateEventInMemory(target.eventId, {
          title: values.title,
          type: values.type,
          date: values.start,
          endDate,
          color: values.color,
          cosmetic: values.cosmetic,
          showOnMinimap: values.showOnMinimap,
          showInUpcoming: values.showInUpcoming,
        });
        return;
      }
      // Create: keep a temp event in sync; drop it while the title is empty.
      const exists = store.events.some((e) => e.id === tempId.current);
      if (values.title.length === 0) {
        if (exists) {
          useCalendarStore.setState({ events: store.events.filter((e) => e.id !== tempId.current) });
        }
        return;
      }
      if (exists) {
        store.updateEventInMemory(tempId.current, {
          title: values.title,
          type: values.type,
          date: values.start,
          endDate,
          color: values.color,
          cosmetic: values.cosmetic,
          showOnMinimap: values.showOnMinimap,
          showInUpcoming: values.showInUpcoming,
        });
      } else {
        const now = new Date().toISOString();
        store.addEventInMemory({
          id: tempId.current,
          title: values.title,
          date: values.start,
          endDate,
          type: values.type,
          recurrence: null,
          color: values.color,
          cosmetic: values.cosmetic,
          showOnMinimap: values.showOnMinimap,
          showInUpcoming: values.showInUpcoming,
          createdAt: now,
          updatedAt: now,
        });
      }
    },
    [target.eventId],
  );

  const handleSubmit = useCallback(
    (values: SpanFormValues) => {
      applyInMemory(values);
      isSaved.current = true;
      void useCalendarStore.getState().commitCurrentState();
      close();
    },
    [applyInMemory, close],
  );

  const handleDelete = useCallback(() => {
    if (target.eventId) {
      isSaved.current = true;
      void useCalendarStore.getState().deleteEvent(target.eventId);
    }
    close();
  }, [target.eventId, close]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
          return;
        }
        e.preventDefault();
        handleDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDelete]);

  return (
    <AnchoredPopover anchorEl={target.anchorEl} onClose={close}>
      <SpanForm
        initial={{
          title: existing?.title ?? '',
          type: existing?.type ?? 'holiday',
          start: target.start,
          end: target.end,
          color: existing?.color ?? '',
          cosmetic: existing?.cosmetic ?? '',
          showOnMinimap: existing?.showOnMinimap !== false,
          showInUpcoming: existing?.showInUpcoming !== false,
        }}
        submitLabel={target.eventId ? 'Save' : 'Add'}
        onSubmit={handleSubmit}
        onChange={applyInMemory}
        onDelete={target.eventId ? handleDelete : undefined}
      />
    </AnchoredPopover>
  );
}
