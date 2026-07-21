-- Round-trip rides: a non-null return time means the rider comes back the
-- same day from the destination, and the nightly forecast covers both legs.
alter table public.rides
  add column return_local_time time;
