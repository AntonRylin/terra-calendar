-- Migration 0006: columns so every CalendarEvent field round-trips to the cloud —
-- spans (end_date), categories (type), per-day overrides, tasks, and (optional)
-- calendar routing. (show_in_upcoming is added by 0005.) Apply via the Supabase
-- SQL editor or `supabase db push`.
alter table public.events add column if not exists end_date      text;
alter table public.events add column if not exists type          text;
alter table public.events add column if not exists day_overrides jsonb;
alter table public.events add column if not exists calendar_urls text[];
alter table public.events add column if not exists is_task       boolean;
