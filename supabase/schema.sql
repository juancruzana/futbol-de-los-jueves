-- =============================================================
-- Fútbol de los Jueves — esquema + seguridad (RLS)
-- Pegalo entero en Supabase → SQL Editor → Run.
-- Se puede volver a correr: todo es idempotente.
-- =============================================================

-- ---------- Organizadores ----------
-- Quien tenga uno de estos mails puede abrir convocatorias, armar
-- equipos, cargar resultados y administrar el plantel.
create table if not exists admin_emails (
  email text primary key
);
insert into admin_emails (email) values ('soyjuancruzana@gmail.com')
  on conflict do nothing;

-- ---------- Tablas ----------
create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  active      boolean not null default true,
  user_id     uuid unique references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists matches (
  id          uuid primary key default gen_random_uuid(),
  date        date not null default current_date,
  format      text not null default 'F11' check (format in ('F5','F6','F7','F8','F9','F11')),
  status      text not null default 'abierto' check (status in ('abierto','jugado')),
  slots       text[] not null default array['20:00','21:00','22:00','23:00'],
  time        text,                       -- horario confirmado (null = encuesta abierta)
  score_a     int not null default 0 check (score_a >= 0),
  score_b     int not null default 0 check (score_b >= 0),
  mvp         uuid references players(id) on delete set null,
  created_at  timestamptz not null default now(),
  played_at   timestamptz
);

-- Respuesta de cada jugador a la encuesta: "Toy" (+ horarios) o "No toy".
create table if not exists availability (
  match_id    uuid not null references matches(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  going       boolean not null,
  hours       text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (match_id, player_id)
);

-- Quién jugó en qué equipo y cuántos goles hizo.
create table if not exists lineups (
  match_id    uuid not null references matches(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  team        text not null check (team in ('A','B')),
  goals       int not null default 0 check (goals >= 0),
  primary key (match_id, player_id)
);

-- ---------- Funciones de ayuda ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function my_player_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from players where user_id = auth.uid();
$$;

-- Un usuario logueado reclama un jugador libre del plantel (una sola vez).
create or replace function claim_player(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión';
  end if;
  if exists (select 1 from players where user_id = auth.uid()) then
    raise exception 'Tu cuenta ya está vinculada a un jugador';
  end if;
  update players set user_id = auth.uid()
   where id = p and user_id is null and active;
  if not found then
    raise exception 'Ese jugador ya lo eligió otra persona';
  end if;
end $$;

grant execute on function is_admin()      to authenticated;
grant execute on function my_player_id()  to authenticated;
grant execute on function claim_player(uuid) to authenticated;

-- ---------- RLS ----------
alter table admin_emails enable row level security;
alter table players      enable row level security;
alter table matches      enable row level security;
alter table availability enable row level security;
alter table lineups      enable row level security;

-- admin_emails: nadie lo lee ni lo escribe desde la app (solo SQL).
drop policy if exists "admins leen" on admin_emails;

-- players
drop policy if exists "players: leer"  on players;
drop policy if exists "players: admin" on players;
create policy "players: leer"  on players for select to authenticated using (true);
create policy "players: admin" on players for all    to authenticated using (is_admin()) with check (is_admin());

-- matches
drop policy if exists "matches: leer"  on matches;
drop policy if exists "matches: admin" on matches;
create policy "matches: leer"  on matches for select to authenticated using (true);
create policy "matches: admin" on matches for all    to authenticated using (is_admin()) with check (is_admin());

-- lineups
drop policy if exists "lineups: leer"  on lineups;
drop policy if exists "lineups: admin" on lineups;
create policy "lineups: leer"  on lineups for select to authenticated using (true);
create policy "lineups: admin" on lineups for all    to authenticated using (is_admin()) with check (is_admin());

-- availability: todos leen; cada uno escribe SOLO lo suyo y solo con la
-- encuesta abierta; el organizador puede cargar por cualquiera.
drop policy if exists "avail: leer"      on availability;
drop policy if exists "avail: propio"    on availability;
drop policy if exists "avail: admin"     on availability;
create policy "avail: leer" on availability for select to authenticated using (true);
create policy "avail: propio" on availability for all to authenticated
  using (
    player_id = my_player_id()
    and exists (select 1 from matches m where m.id = match_id and m.status = 'abierto')
  )
  with check (
    player_id = my_player_id()
    and exists (select 1 from matches m where m.id = match_id and m.status = 'abierto')
  );
create policy "avail: admin" on availability for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------- Tiempo real ----------
-- Para que la encuesta se actualice sola en todos los celulares.
do $$
declare t text;
begin
  foreach t in array array['players','matches','availability','lineups'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
