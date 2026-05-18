alter table public.records
add column if not exists weather_code integer,
add column if not exists weather_label text,
add column if not exists temperature_max numeric,
add column if not exists temperature_min numeric,
add column if not exists weather_location text,
add column if not exists weather_latitude numeric,
add column if not exists weather_longitude numeric,
add column if not exists weather_fetched_at timestamptz;

