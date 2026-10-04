-- =============================================================
-- Fútbol de los Jueves — esquema + seguridad (RLS)
-- Pegalo entero en Supabase → SQL Editor → Run.
-- Se puede volver a correr: todo es idempotente.
-- =============================================================

-- ---------- Organizadores de antes ----------
-- Antes había un solo grupo y los organizadores eran estos mails. Solo se usa
-- para migrar: al pasar a grupos, estas cuentas quedan como organizadoras del
-- grupo que se crea con los datos que ya había.
create table if not exists admin_emails (
  email text primary key
);
insert into admin_emails (email) values ('soyjuancruzana@gmail.com')
  on conflict do nothing;

-- ---------- Tablas ----------
-- Cada grupo es su propio fútbol: plantel, partidos, encuesta y tabla.
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Quién está en cada grupo y con qué rol.
create table if not exists group_members (
  group_id    uuid not null references groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'jugador' check (role in ('admin','jugador')),
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on group_members (user_id);

create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  active      boolean not null default true,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists matches (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
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
-- group_id lo completa un trigger con el del partido.
create table if not exists availability (
  match_id    uuid not null references matches(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  group_id    uuid not null references groups(id) on delete cascade,
  going       boolean not null,
  hours       text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (match_id, player_id)
);

-- Quién jugó en qué equipo y cuántos goles hizo.
create table if not exists lineups (
  match_id    uuid not null references matches(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  group_id    uuid not null references groups(id) on delete cascade,
  team        text not null check (team in ('A','B')),
  goals       int not null default 0 check (goals >= 0),
  primary key (match_id, player_id)
);

-- ---------- Migración: de un solo grupo a varios ----------
-- Bases creadas antes de los grupos: agrega las columnas y mete todo lo que
-- había en un grupo "Fútbol de los Jueves".
alter table players      add column if not exists group_id uuid references groups(id) on delete cascade;
alter table matches      add column if not exists group_id uuid references groups(id) on delete cascade;
alter table availability add column if not exists group_id uuid references groups(id) on delete cascade;
alter table lineups      add column if not exists group_id uuid references groups(id) on delete cascade;

do $$
declare
  g uuid;
  v_owner uuid;
begin
  if exists (select 1 from players where group_id is null)
     or exists (select 1 from matches where group_id is null) then
    select u.id into v_owner
      from auth.users u join admin_emails a on lower(a.email) = lower(u.email)
      limit 1;
    insert into groups (name, created_by) values ('Fútbol de los Jueves', v_owner) returning id into g;
    update players set group_id = g where group_id is null;
    update matches set group_id = g where group_id is null;
    insert into group_members (group_id, user_id, role)
      select g, u.id, 'admin'
      from auth.users u join admin_emails a on lower(a.email) = lower(u.email)
      on conflict do nothing;
    insert into group_members (group_id, user_id)
      select g, user_id from players where group_id = g and user_id is not null
      on conflict do nothing;
  end if;
  update availability a set group_id = m.group_id from matches m where m.id = a.match_id and a.group_id is null;
  update lineups l      set group_id = m.group_id from matches m where m.id = l.match_id and l.group_id is null;
end $$;

alter table players      alter column group_id set not null;
alter table matches      alter column group_id set not null;
alter table availability alter column group_id set not null;
alter table lineups      alter column group_id set not null;

-- Antes una cuenta tenía un solo jugador; ahora tiene uno por grupo.
alter table players drop constraint if exists players_user_id_key;
create unique index if not exists players_group_user on players (group_id, user_id);
create unique index if not exists players_id_group on players (id, group_id);
create index if not exists matches_group on matches (group_id);

-- Un voto o un equipo solo puede tener jugadores del mismo grupo que el partido.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'availability_player_same_group') then
    alter table availability add constraint availability_player_same_group
      foreign key (player_id, group_id) references players (id, group_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lineups_player_same_group') then
    alter table lineups add constraint lineups_player_same_group
      foreign key (player_id, group_id) references players (id, group_id) on delete cascade;
  end if;
end $$;

-- ---------- Triggers ----------
-- Votos y equipos heredan el grupo del partido (nadie lo elige a mano).
create or replace function set_group_from_match() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select group_id into new.group_id from matches where id = new.match_id;
  return new;
end $$;

drop trigger if exists availability_group on availability;
create trigger availability_group before insert or update on availability
  for each row execute function set_group_from_match();
drop trigger if exists lineups_group on lineups;
create trigger lineups_group before insert or update on lineups
  for each row execute function set_group_from_match();

-- Un jugador o un partido no se puede mudar de grupo.
create or replace function lock_group_id() returns trigger
language plpgsql as $$
begin
  if new.group_id is distinct from old.group_id then
    raise exception 'No se puede pasar de un grupo a otro';
  end if;
  return new;
end $$;

drop trigger if exists players_lock_group on players;
create trigger players_lock_group before update on players
  for each row execute function lock_group_id();
drop trigger if exists matches_lock_group on matches;
create trigger matches_lock_group before update on matches
  for each row execute function lock_group_id();

-- ---------- Funciones de ayuda ----------
create or replace function is_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members where group_id = p_group and user_id = auth.uid()
  );
$$;

create or replace function is_group_admin(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members where group_id = p_group and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function my_player_id(p_group uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from players where group_id = p_group and user_id = auth.uid();
$$;

-- Limpia y valida un nombre de jugador dentro de un grupo.
-- p_except: el jugador que se está renombrando.
create or replace function clean_player_name(p_group uuid, p_name text, p_except uuid default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if v_name = '' then
    raise exception 'Escribí tu nombre';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'El nombre puede tener hasta 40 letras';
  end if;
  if exists (
    select 1 from players
    where group_id = p_group and active and lower(name) = lower(v_name) and id is distinct from p_except
  ) then
    raise exception 'Ese nombre ya lo usa otro. Probá con un apodo';
  end if;
  return v_name;
end $$;

create or replace function clean_group_name(p_name text) returns text
language plpgsql immutable as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if v_name = '' then
    raise exception 'Ponele un nombre al grupo';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'El nombre del grupo puede tener hasta 40 letras';
  end if;
  return v_name;
end $$;

-- Crear un grupo: quien lo crea queda como organizador y con su jugador.
create or replace function create_group(p_name text, p_player_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión';
  end if;
  insert into groups (name, created_by) values (clean_group_name(p_name), auth.uid()) returning id into v_group;
  insert into group_members (group_id, user_id, role) values (v_group, auth.uid(), 'admin');
  insert into players (group_id, name, user_id)
    values (v_group, clean_player_name(v_group, p_player_name), auth.uid());
  return v_group;
end $$;

-- Lo que ve alguien que abre un link de invitación, antes de sumarse.
create or replace function group_preview(p_code text)
returns table (id uuid, name text, players int, already boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name,
         (select count(*)::int from players p where p.group_id = g.id and p.active),
         exists (select 1 from group_members m where m.group_id = g.id and m.user_id = auth.uid())
  from groups g
  where auth.uid() is not null and g.invite_code = lower(btrim(p_code));
$$;

-- Sumarse con el link de invitación: queda como jugador del grupo.
create or replace function join_group(p_code text, p_player_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión';
  end if;
  select id into v_group from groups where invite_code = lower(btrim(p_code));
  if v_group is null then
    raise exception 'El link de invitación no es válido o lo cambiaron. Pedile uno nuevo al organizador';
  end if;
  insert into group_members (group_id, user_id) values (v_group, auth.uid()) on conflict do nothing;
  if not exists (select 1 from players where group_id = v_group and user_id = auth.uid()) then
    insert into players (group_id, name, user_id)
      values (v_group, clean_player_name(v_group, p_player_name), auth.uid());
  end if;
  return v_group;
end $$;

-- Un miembro sin jugador (ej. un organizador de antes) crea el suyo.
create or replace function create_my_player(p_group uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_member(p_group) then
    raise exception 'No sos parte de este grupo';
  end if;
  if my_player_id(p_group) is not null then
    raise exception 'Ya tenés un jugador en este grupo';
  end if;
  insert into players (group_id, name, user_id)
    values (p_group, clean_player_name(p_group, p_name), auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Perfil: cada uno cambia el nombre de su propio jugador en ese grupo.
create or replace function update_my_profile(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := my_player_id(p_group);
begin
  if v_id is null then
    raise exception 'Tu cuenta todavía no tiene jugador en este grupo';
  end if;
  update players set name = clean_player_name(p_group, p_name, v_id) where id = v_id;
end $$;

-- El organizador cambia el link de invitación (el viejo deja de andar).
create or replace function reset_invite(p_group uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  if not is_group_admin(p_group) then
    raise exception 'Solo el organizador puede cambiar el link';
  end if;
  update groups set invite_code = v_code where id = p_group;
  return v_code;
end $$;

-- El organizador nombra o saca organizadores. Siempre queda al menos uno.
create or replace function set_member_role(p_group uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_admin(p_group) then
    raise exception 'Solo el organizador puede cambiar eso';
  end if;
  if p_role not in ('admin', 'jugador') then
    raise exception 'Rol inválido';
  end if;
  if p_role = 'jugador' and not exists (
    select 1 from group_members where group_id = p_group and role = 'admin' and user_id <> p_user
  ) then
    raise exception 'El grupo tiene que tener al menos un organizador';
  end if;
  update group_members set role = p_role where group_id = p_group and user_id = p_user;
  if not found then
    raise exception 'Esa persona no es parte del grupo';
  end if;
end $$;

create or replace function remove_player(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
  v_user uuid;
begin
  select group_id, user_id into v_group, v_user from players where id = p_player;
  if v_group is null then
    raise exception 'Ese jugador ya no está en el plantel';
  end if;
  if not is_group_admin(v_group) then
    raise exception 'Solo el organizador puede eliminar jugadores';
  end if;
  if v_user = auth.uid() then
    raise exception 'No te podés eliminar a vos mismo';
  end if;
  delete from players where id = p_player;
  if v_user is not null then
    delete from group_members where group_id = v_group and user_id = v_user;
  end if;
end $$;

grant execute on function is_member(uuid)                      to authenticated;
grant execute on function is_group_admin(uuid)                 to authenticated;
grant execute on function my_player_id(uuid)                   to authenticated;
grant execute on function create_group(text, text)             to authenticated;
grant execute on function group_preview(text)                  to authenticated;
grant execute on function join_group(text, text)               to authenticated;
grant execute on function create_my_player(uuid, text)         to authenticated;
grant execute on function update_my_profile(uuid, text)        to authenticated;
grant execute on function reset_invite(uuid)                   to authenticated;
grant execute on function set_member_role(uuid, uuid, text)    to authenticated;
grant execute on function remove_player(uuid)                  to authenticated;

-- ---------- RLS ----------
alter table admin_emails  enable row level security;
alter table groups        enable row level security;
alter table group_members enable row level security;
alter table players       enable row level security;
alter table matches       enable row level security;
alter table availability  enable row level security;
alter table lineups       enable row level security;

-- Políticas de antes de los grupos (dependen de funciones que ya no existen).
drop policy if exists "admins leen"    on admin_emails;
drop policy if exists "players: leer"  on players;
drop policy if exists "players: admin" on players;
drop policy if exists "matches: leer"  on matches;
drop policy if exists "matches: admin" on matches;
drop policy if exists "lineups: leer"  on lineups;
drop policy if exists "lineups: admin" on lineups;
drop policy if exists "avail: leer"    on availability;
drop policy if exists "avail: propio"  on availability;
drop policy if exists "avail: admin"   on availability;
drop function if exists claim_player(uuid);
drop function if exists create_my_player(text);
drop function if exists update_my_profile(text);
drop function if exists clean_player_name(text, uuid);
drop function if exists my_player_id();
drop function if exists is_admin();

-- admin_emails: nadie lo lee ni lo escribe desde la app (solo SQL).

-- groups: los miembros lo ven; el organizador le cambia el nombre.
-- Crear y sumarse va por create_group / join_group.
drop policy if exists "groups: leer"    on groups;
drop policy if exists "groups: editar"  on groups;
create policy "groups: leer"   on groups for select to authenticated using (is_member(id));
create policy "groups: editar" on groups for update to authenticated
  using (is_group_admin(id)) with check (is_group_admin(id));

-- group_members: los del grupo ven quién está y quién organiza.
-- Se escribe solo por funciones (join_group, set_member_role, remove_player).
drop policy if exists "members: leer" on group_members;
create policy "members: leer" on group_members for select to authenticated using (is_member(group_id));

-- players
drop policy if exists "players: leer"  on players;
drop policy if exists "players: admin" on players;
create policy "players: leer"  on players for select to authenticated using (is_member(group_id));
create policy "players: admin" on players for all    to authenticated
  using (is_group_admin(group_id)) with check (is_group_admin(group_id));

-- matches
drop policy if exists "matches: leer"  on matches;
drop policy if exists "matches: admin" on matches;
create policy "matches: leer"  on matches for select to authenticated using (is_member(group_id));
create policy "matches: admin" on matches for all    to authenticated
  using (is_group_admin(group_id)) with check (is_group_admin(group_id));

-- lineups
drop policy if exists "lineups: leer"  on lineups;
drop policy if exists "lineups: admin" on lineups;
create policy "lineups: leer"  on lineups for select to authenticated using (is_member(group_id));
create policy "lineups: admin" on lineups for all    to authenticated
  using (is_group_admin(group_id)) with check (is_group_admin(group_id));

-- availability: los del grupo leen; cada uno escribe SOLO lo suyo y solo con
-- la encuesta abierta; el organizador puede cargar por cualquiera del grupo.
drop policy if exists "avail: leer"      on availability;
drop policy if exists "avail: propio"    on availability;
drop policy if exists "avail: admin"     on availability;
create policy "avail: leer" on availability for select to authenticated using (is_member(group_id));
create policy "avail: propio" on availability for all to authenticated
  using (
    player_id = my_player_id(group_id)
    and exists (select 1 from matches m where m.id = match_id and m.status = 'abierto')
  )
  with check (
    player_id = my_player_id(group_id)
    and exists (select 1 from matches m where m.id = match_id and m.status = 'abierto')
  );
create policy "avail: admin" on availability for all to authenticated
  using (is_group_admin(group_id)) with check (is_group_admin(group_id));

-- ---------- Tiempo real ----------
-- Para que la encuesta se actualice sola en todos los celulares.
do $$
declare t text;
begin
  foreach t in array array['groups','group_members','players','matches','availability','lineups'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
