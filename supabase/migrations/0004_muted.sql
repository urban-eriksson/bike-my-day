-- Per-ride notification mute: the cron skips muted rides entirely.
alter table public.rides
  add column muted boolean not null default false;
