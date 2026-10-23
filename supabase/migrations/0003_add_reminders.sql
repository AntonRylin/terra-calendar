-- Add reminders column to events table
alter table public.events add column if not exists reminders jsonb;
