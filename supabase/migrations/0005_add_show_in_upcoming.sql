-- Migration: Add show_in_upcoming column to public.events
alter table public.events add column if not exists show_in_upcoming boolean;
