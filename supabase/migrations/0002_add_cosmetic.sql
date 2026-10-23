-- Migration: Add cosmetic column to public.events
alter table public.events add column if not exists cosmetic text;
