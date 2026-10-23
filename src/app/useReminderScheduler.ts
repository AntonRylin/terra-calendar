import { useEffect, useRef, useState } from 'react';
import { useCalendarStore } from './store';
import { useUiStore } from './uiStore';
import { systemTimeZone } from '../core/timezone';
import { computeDueReminders } from './reminderLogic';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

const STORAGE_KEY = 'open-calendar.fired-reminders';
/** Cap the persisted fired-set so it can't grow without bound over months of
 *  use; reminders only fire within a ~9-day window, so old ids are dead weight. */
const MAX_FIRED = 500;

export function useReminderScheduler() {
  const [hasPermission, setHasPermission] = useState(false);
  // Held in a ref, not state: the fired-set never affects render, and keeping it
  // out of the effect deps stops every fired reminder from tearing down and
  // recreating the 30s interval.
  const firedRef = useRef<Set<string>>(
    (() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
      } catch {
        return new Set<string>();
      }
    })(),
  );

  // Request permissions on mount
  useEffect(() => {
    let active = true;
    async function checkPermission() {
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const permission = await requestPermission();
          granted = permission === 'granted';
        }
        if (active) {
          setHasPermission(granted);
        }
      } catch (err) {
        console.error('Failed to initialize notification plugin permissions:', err);
      }
    }
    void checkPermission();
    return () => {
      active = false;
    };
  }, []);

  // Scheduler interval loop. Events are read via `getState()` rather than a
  // store subscription: this hook runs inside MainScreen, so subscribing made
  // every event edit re-render the whole screen — and tear down and recreate
  // this interval, running a full reminder sweep each time. The 30s tick always
  // sees current events anyway.
  useEffect(() => {
    if (!hasPermission) return;

    function checkReminders() {
      const fired = firedRef.current;
      const ui = useUiStore.getState();
      const skipIds = new Set<string>(
        [ui.editor?.eventId, ui.create?.eventId].filter((id): id is string => Boolean(id)),
      );

      const events = useCalendarStore.getState().events;
      const due = computeDueReminders(events, new Date(), fired, systemTimeZone(), { skipIds });
      if (due.length === 0) return;

      for (const reminder of due) {
        sendNotification({ title: reminder.title, body: reminder.body });
        fired.add(reminder.id);
      }

      // Keep only the most recent ids so the persisted set stays bounded.
      const trimmed =
        fired.size > MAX_FIRED ? new Set(Array.from(fired).slice(-MAX_FIRED)) : fired;
      firedRef.current = trimmed;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(trimmed)));
      } catch (err) {
        console.error('Failed to save fired reminders state:', err);
      }
    }

    // Run check immediately on mount and then every 30 seconds
    checkReminders();
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [hasPermission]);
}
