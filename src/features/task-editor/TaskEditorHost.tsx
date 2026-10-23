import { useCallback } from 'react';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { TaskForm, type TaskFormValues } from './TaskForm';

/** Create/edit popover for tasks. Setting a date promotes the task to an event. */
export function TaskEditorHost() {
  const target = useUiStore((s) => s.taskEditor);
  const close = useUiStore((s) => s.closeOverlays);
  const addEvent = useCalendarStore((s) => s.addEvent);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const existing = useCalendarStore((s) =>
    target?.eventId ? s.events.find((e) => e.id === target.eventId) ?? null : null,
  );

  const handleSubmit = useCallback(
    (values: TaskFormValues) => {
      const promoting = !!values.date;
      if (target?.eventId) {
        updateEvent(target.eventId, {
          title: values.title,
          description: values.description,
          type: values.type,
          color: values.color,
          cosmetic: values.cosmetic,
          // Promotion: give it a date and drop the task flag.
          ...(promoting ? { date: values.date!, isTask: undefined } : {}),
        });
      } else if (promoting) {
        void addEvent({
          title: values.title, date: values.date!, description: values.description,
          type: values.type, color: values.color, cosmetic: values.cosmetic,
        });
      } else {
        void addEvent({
          title: values.title, date: '', isTask: true, description: values.description,
          type: values.type, color: values.color, cosmetic: values.cosmetic,
        });
      }
      close();
    },
    [target, addEvent, updateEvent, close],
  );

  if (!target) return null;
  const initial: TaskFormValues = existing
    ? { title: existing.title, description: existing.description, type: existing.type, color: existing.color, cosmetic: existing.cosmetic, date: '' }
    : { title: '' };

  return (
    <AnchoredPopover anchorEl={target.anchorEl} onClose={close}>
      <TaskForm
        initial={initial}
        submitLabel={target.eventId ? 'Save' : 'Add task'}
        focusDate={target.focusDate}
        onSubmit={handleSubmit}
        onDelete={target.eventId ? () => { void deleteEvent(target.eventId!); close(); } : undefined}
      />
    </AnchoredPopover>
  );
}
