-- Migration 0010: end time for timed events (week-view move/resize support).
-- "HH:mm" local wall-clock in the event's own tz, same day as `time`; null on
-- all-day events and legacy rows (the app treats those as 1 hour long).
-- Apply via the Supabase SQL editor or `supabase db push`.
alter table public.events add column if not exists end_time text;
