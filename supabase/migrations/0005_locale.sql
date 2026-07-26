-- bike-my-day interface + forecast language
--
-- The UI language lives in a cookie so a signed-out visitor still gets a
-- localised page, but the nightly cron has no request context — it needs to
-- know which language to generate each rider's verdict in, so the choice is
-- mirrored here whenever a signed-in rider switches.

set search_path = public;

alter table public.profiles
  add column locale text not null default 'sv'
    check (locale in ('sv', 'en'));

comment on column public.profiles.locale is
  'Language for generated forecasts and push notifications: sv | en.';
