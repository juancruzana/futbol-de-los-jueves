// Corre schema.sql sobre un Postgres en memoria imitando a Supabase (auth.uid/jwt, rol authenticated)
// y comprueba que la RLS hace lo que promete.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const FACU = "22222222-2222-2222-2222-222222222222";
const TOMI = "33333333-3333-3333-3333-333333333333";
const LUCHO = "44444444-4444-4444-4444-444444444444";

const SUPABASE = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('test.email', true)) $$;
  create role authenticated;
  grant usage on schema public to authenticated;
  alter default privileges in schema public grant all on tables to authenticated;
  grant usage on schema auth to authenticated;
  grant execute on all functions in schema auth to authenticated;
  create publication supabase_realtime;
  insert into auth.users values ('${ADMIN}','soyjuancruzana@gmail.com'),('${FACU}','facu@x.com'),('${TOMI}','tomi@x.com'),('${LUCHO}','lucho@x.com');
`;
const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? "✔" : "✘"} ${name}`); };

function client(db) {
  const as = async (uid, sql, params = []) => {
    await db.exec(`reset role; select set_config('test.uid','${uid}',false); set role authenticated;`);
    try { const r = await db.query(sql, params); return { rows: r.rows, n: r.affectedRows ?? 0 }; }
    catch (e) { return { error: e.message }; }
    finally { await db.exec("reset role"); }
  };
  return {
    asAdmin: (s, p) => as(ADMIN, s, p),
    asFacu: (s, p) => as(FACU, s, p),
    asTomi: (s, p) => as(TOMI, s, p),
    asLucho: (s, p) => as(LUCHO, s, p),
  };
}

/* =================== Base nueva =================== */
console.log("— Base nueva —");
const db = new PGlite();
await db.exec(SUPABASE);
await db.exec(schema);
await db.exec(schema); // idempotente
await db.exec(`grant all on all tables in schema public to authenticated;`);
const { asAdmin, asFacu, asTomi, asLucho } = client(db);
const id = {};

// Crear grupo
let r = await asAdmin(`select create_group($1, $2) as id`, ["  Los   Jueves ", "Juan"]);
check("cualquiera crea un grupo", !r.error);
const G1 = r.rows?.[0].id;
r = await asAdmin(`select g.name, m.role, p.name as player from groups g join group_members m on m.group_id = g.id join players p on p.group_id = g.id where g.id = $1`, [G1]);
check("el grupo queda con nombre limpio, el creador organizador y con su jugador",
  r.rows?.[0]?.name === "Los Jueves" && r.rows[0].role === "admin" && r.rows[0].player === "Juan");
r = await asAdmin(`select create_group($1, $2)`, ["   ", "Juan"]);
check("no se puede crear un grupo sin nombre", !!r.error && /nombre al grupo/.test(r.error));
r = await asAdmin(`insert into groups(name) values ('Directo')`);
check("NO se puede crear un grupo salteando la función", !!r.error);
r = await asAdmin(`select invite_code from groups where id = $1`, [G1]);
const CODE1 = r.rows?.[0].invite_code;
check("el grupo tiene link de invitación", typeof CODE1 === "string" && CODE1.length === 12);

// Invitación
r = await asFacu(`select * from groups where id = $1`, [G1]);
check("alguien de afuera NO ve el grupo", !r.error && r.rows.length === 0);
r = await asFacu(`select * from group_preview($1)`, [CODE1.toUpperCase() + " "]);
check("con el link se ve el nombre del grupo antes de sumarse", r.rows?.[0]?.name === "Los Jueves" && r.rows[0].already === false);
r = await asFacu(`select * from group_preview($1)`, ["nocode"]);
check("un link inventado no muestra nada", !r.error && r.rows.length === 0);
r = await asFacu(`select join_group($1, $2)`, ["nocode", "Facu"]);
check("con un link inventado no se puede entrar", !!r.error && /no es válido/.test(r.error));
r = await asFacu(`select join_group($1, $2) as id`, [CODE1, "  Facu  "]);
check("Facu se suma con el link", r.rows?.[0]?.id === G1);
r = await asFacu(`select join_group($1, $2) as id`, [CODE1, "Otro nombre"]);
check("volver a abrir el link no crea otro jugador", r.rows?.[0]?.id === G1);
r = await asFacu(`select count(*)::int c from players where group_id = $1 and user_id = $2`, [G1, FACU]);
check("Facu tiene un solo jugador en el grupo", r.rows?.[0].c === 1);
r = await asFacu(`select role from group_members where group_id = $1 and user_id = $2`, [G1, FACU]);
check("el que entra con el link es jugador, no organizador", r.rows?.[0].role === "jugador");
r = await asTomi(`select join_group($1, $2)`, [CODE1, "facu"]);
check("Tomi NO puede usar un nombre que ya existe en el grupo", !!r.error && /ya lo usa/.test(r.error));
r = await asTomi(`select join_group($1, $2)`, [CODE1, "   "]);
check("no se puede entrar sin nombre", !!r.error && /Escribí/.test(r.error));
r = await asTomi(`select count(*)::int c from group_members where group_id = $1 and user_id = $2`, [G1, TOMI]);
check("si falla el nombre, tampoco queda adentro del grupo", r.rows?.[0].c === 0);
await asTomi(`select join_group($1, $2)`, [CODE1, "Tomi"]);
r = await asTomi(`insert into group_members(group_id, user_id, role) values ($1, $2, 'admin')`, [G1, TOMI]);
check("un jugador NO puede hacerse organizador solo", !!r.error);
r = await asFacu(`select * from group_preview($1)`, [CODE1]);
check("el link reconoce que ya sos del grupo", r.rows?.[0]?.already === true);

r = await asFacu(`select id, name from players where group_id = $1`, [G1]);
Object.assign(id, Object.fromEntries((r.rows ?? []).map((x) => [x.name, x.id])));
check("los del grupo ven el plantel", !!id.Juan && !!id.Facu && !!id.Tomi);

// Jugadores
r = await asTomi(`insert into players(group_id, name) values ($1, 'Colado')`, [G1]);
check("un jugador NO puede insertar jugadores directo", !!r.error);
r = await asFacu(`update players set name = 'Hackeado' where id = $1`, [id.Tomi]);
check("Facu NO puede renombrar a Tomi (0 filas)", !r.error && r.n === 0);
r = await asAdmin(`insert into players(group_id, name) values ($1, 'Ruso') returning id`, [G1]);
id.Ruso = r.rows?.[0].id; // jugador sin cuenta
check("el organizador agrega un jugador sin cuenta", !!id.Ruso);

// Perfil
await asFacu(`select update_my_profile($1, $2)`, [G1, "  Facundo   el  9 "]);
r = await asFacu(`select name from players where id = $1`, [id.Facu]);
check("Facu cambia su nombre desde el perfil", r.rows?.[0].name === "Facundo el 9");
r = await asFacu(`select update_my_profile($1, $2)`, [G1, "FACUNDO EL 9"]);
check("puede guardar su mismo nombre con otras mayúsculas", !r.error);
r = await asFacu(`select update_my_profile($1, $2)`, [G1, "tomi"]);
check("NO puede ponerse un nombre que ya usa otro", !!r.error && /ya lo usa/.test(r.error));
r = await asFacu(`select update_my_profile($1, $2)`, [G1, ""]);
check("NO puede dejar el nombre vacío", !!r.error && /Escribí/.test(r.error));
r = await asTomi(`select name from players where id = $1`, [id.Tomi]);
check("cambiar el perfil propio no toca a nadie más", r.rows?.[0].name === "Tomi");
r = await asLucho(`select update_my_profile($1, $2)`, [G1, "Lucho"]);
check("sin jugador en el grupo no hay perfil que cambiar", !!r.error && /todavía no tiene/.test(r.error));
r = await asLucho(`select create_my_player($1, $2)`, [G1, "Lucho"]);
check("alguien de afuera NO puede crearse jugador en el grupo", !!r.error && /No sos parte/.test(r.error));
r = await asFacu(`select create_my_player($1, $2)`, [G1, "Facu 2"]);
check("Facu NO puede crear un segundo jugador en el mismo grupo", !!r.error && /Ya tenés/.test(r.error));
await asFacu(`select update_my_profile($1, $2)`, [G1, "Facu"]);

// Partido
r = await asFacu(`insert into matches(group_id) values ($1)`, [G1]);
check("un jugador NO puede abrir partido", !!r.error);
r = await asAdmin(`insert into matches(group_id) values ($1) returning id, slots`, [G1]);
const mid = r.rows[0].id;
check("el organizador abre partido con horarios 20–23", r.rows[0].slots.join() === "20:00,21:00,22:00,23:00");

// Votos
r = await asFacu(`insert into availability(match_id,player_id,going,hours) values ($1,$2,true,'{21:00,22:00}') returning group_id`, [mid, id.Facu]);
check("Facu vota por sí mismo (y el voto toma el grupo del partido)", !r.error && r.rows[0].group_id === G1);
r = await asFacu(`insert into availability(match_id,player_id,going,hours) values ($1,$2,false,'{}')`, [mid, id.Tomi]);
check("Facu NO puede votar por Tomi", !!r.error);
r = await asFacu(`update availability set hours='{20:00}' where match_id=$1 and player_id=$2`, [mid, id.Tomi]);
check("Facu NO puede editar el voto de Tomi (0 filas)", !r.error && r.n === 0);
r = await asAdmin(`insert into availability(match_id,player_id,going,hours) values ($1,$2,true,'{21:00}')`, [mid, id.Ruso]);
check("el organizador vota por alguien que contestó por WhatsApp", !r.error);
r = await asTomi(`select count(*)::int c from availability where match_id=$1`, [mid]);
check("todos los del grupo ven los votos", r.rows?.[0].c === 2);

// Equipos y resultado
r = await asFacu(`insert into lineups(match_id,player_id,team,goals) values ($1,$2,'A',5)`, [mid, id.Facu]);
check("un jugador NO puede cargarse goles", !!r.error);
r = await asAdmin(`insert into lineups(match_id,player_id,team,goals) values ($1,$2,'A',2),($1,$3,'B',1)`, [mid, id.Facu, id.Ruso]);
check("el organizador arma equipos", !r.error);
r = await asFacu(`update matches set score_a=9 where id=$1`, [mid]);
check("un jugador NO puede tocar el resultado (0 filas)", !r.error && r.n === 0);
r = await asAdmin(`update matches set score_a=3, score_b=1, status='jugado' where id=$1`, [mid]);
check("el organizador cierra el partido", !r.error && r.n === 1);
r = await asFacu(`update availability set hours='{20:00}' where match_id=$1 and player_id=$2`, [mid, id.Facu]);
check("con el partido cerrado ya no se puede cambiar el voto", !r.error && r.n === 0);

// Votación de la figura (jugaron Facu, Ruso y Juan; Tomi no)
await asAdmin(`insert into lineups(match_id,player_id,team) values ($1,$2,'A')`, [mid, id.Juan]);
const mvpVote = (as, voter, player) =>
  as(`insert into mvp_votes(match_id,voter_id,player_id) values ($1,$2,$3)
      on conflict (match_id,voter_id) do update set player_id = excluded.player_id returning group_id`, [mid, voter, player]);
r = await mvpVote(asFacu, id.Facu, id.Juan);
check("sin votación abierta no se puede votar la figura", !!r.error);
r = await asFacu(`update matches set mvp_vote='abierta' where id=$1`, [mid]);
check("un jugador NO puede abrir la votación de la figura (0 filas)", !r.error && r.n === 0);
r = await asAdmin(`update matches set mvp_vote='abierta' where id=$1`, [mid]);
check("el organizador abre la votación de la figura", !r.error && r.n === 1);
r = await mvpVote(asFacu, id.Facu, id.Juan);
check("Facu, que jugó, vota la figura (y el voto toma el grupo del partido)", !r.error && r.rows[0].group_id === G1);
r = await mvpVote(asFacu, id.Facu, id.Ruso);
check("Facu cambia su voto", !r.error);
r = await mvpVote(asFacu, id.Facu, id.Tomi);
check("NO se puede votar a alguien que no jugó", !!r.error);
r = await mvpVote(asTomi, id.Tomi, id.Facu);
check("el que no jugó NO vota la figura", !!r.error);
r = await mvpVote(asAdmin, id.Juan, id.Juan);
check("se puede votar a uno mismo", !r.error);
r = await mvpVote(asAdmin, id.Ruso, id.Facu);
check("ni el organizador puede votar en nombre de otro", !!r.error);
await mvpVote(asAdmin, id.Juan, id.Ruso);
r = await asTomi(`select count(*)::int c from mvp_votes where match_id=$1`, [mid]);
check("con la votación abierta, un jugador NO ve los votos de otros", r.rows?.[0].c === 0);
r = await asFacu(`select player_id from mvp_votes where match_id=$1`, [mid]);
check("cada uno ve su propio voto", r.rows?.length === 1 && r.rows[0].player_id === id.Ruso);
r = await asAdmin(`select count(*)::int c from mvp_votes where match_id=$1`, [mid]);
check("el organizador ve cómo va la votación", r.rows?.[0].c === 2);
r = await asLucho(`select count(*)::int c from mvp_votes`);
check("alguien de otro grupo NO ve votos de figura", r.rows?.[0].c === 0);
r = await asAdmin(`update matches set mvp_vote='cerrada', mvp=$2 where id=$1`, [mid, id.Ruso]);
check("el organizador cierra la votación con el más votado", !r.error && r.n === 1);
r = await asTomi(`select count(*)::int c from mvp_votes where match_id=$1`, [mid]);
check("cerrada la votación, todo el grupo ve el resultado", r.rows?.[0].c === 2);
r = await asFacu(`update mvp_votes set player_id=$3 where match_id=$1 and voter_id=$2`, [mid, id.Facu, id.Juan]);
check("cerrada la votación ya no se puede cambiar el voto (0 filas)", !r.error && r.n === 0);
r = await asFacu(`delete from mvp_votes where match_id=$1 and voter_id=$2`, [mid, id.Facu]);
check("cerrada la votación ya no se puede borrar el voto (0 filas)", !r.error && r.n === 0);

// Organizadores
r = await asFacu(`select set_member_role($1, $2, 'admin')`, [G1, FACU]);
check("un jugador NO puede nombrarse organizador", !!r.error);
r = await asAdmin(`select set_member_role($1, $2, 'jugador')`, [G1, ADMIN]);
check("el único organizador NO puede dejar de serlo", !!r.error && /al menos un organizador/.test(r.error));
r = await asAdmin(`select set_member_role($1, $2, 'admin')`, [G1, FACU]);
check("el organizador nombra a Facu organizador", !r.error);
r = await asFacu(`update groups set name = 'Jueves FC' where id = $1`, [G1]);
check("un organizador le cambia el nombre al grupo", !r.error && r.n === 1);
r = await asTomi(`update groups set name = 'Hackeado' where id = $1`, [G1]);
check("un jugador NO le cambia el nombre al grupo (0 filas)", !r.error && r.n === 0);
r = await asTomi(`select reset_invite($1)`, [G1]);
check("un jugador NO puede cambiar el link", !!r.error);
r = await asFacu(`select reset_invite($1) as code`, [G1]);
const CODE1b = r.rows?.[0].code;
check("un organizador cambia el link", !!CODE1b && CODE1b !== CODE1);
r = await asLucho(`select join_group($1, $2)`, [CODE1, "Lucho"]);
check("el link viejo deja de andar", !!r.error && /no es válido/.test(r.error));
await asFacu(`select set_member_role($1, $2, 'jugador')`, [G1, FACU]);

// Otro grupo: todo separado
r = await asLucho(`select create_group($1, $2) as id`, ["Los Martes", "Lucho"]);
const G2 = r.rows?.[0].id;
r = await asLucho(`select invite_code from groups where id = $1`, [G2]);
const CODE2 = r.rows?.[0].invite_code;
r = await asFacu(`select join_group($1, $2) as id`, [CODE2, "Facu"]);
check("Facu puede estar en dos grupos con el mismo nombre", r.rows?.[0]?.id === G2);
r = await asLucho(`select id from players where group_id = $1 and user_id = $2`, [G2, FACU]);
id.FacuG2 = r.rows?.[0]?.id;
r = await asLucho(`select count(*)::int c from players where group_id = $1`, [G1]);
check("Lucho NO ve el plantel del otro grupo", r.rows?.[0].c === 0);
r = await asLucho(`select count(*)::int c from matches`);
check("Lucho NO ve partidos del otro grupo", r.rows?.[0].c === 0);
r = await asLucho(`select count(*)::int c from availability`);
check("Lucho NO ve votos del otro grupo", r.rows?.[0].c === 0);
r = await asLucho(`update matches set score_a = 0 where id = $1`, [mid]);
check("el organizador de un grupo NO toca partidos de otro (0 filas)", !r.error && r.n === 0);
r = await asLucho(`insert into matches(group_id) values ($1)`, [G1]);
check("el organizador de un grupo NO abre partidos en otro", !!r.error);
r = await asAdmin(`insert into matches(group_id) values ($1) returning id`, [G1]);
const mid2 = r.rows?.[0].id;
r = await asAdmin(`insert into lineups(match_id,player_id,team) values ($1,$2,'A')`, [mid2, id.FacuG2]);
check("NO se puede meter en un partido a un jugador de otro grupo", !!r.error);
r = await asAdmin(`update matches set group_id = $2 where id = $1`, [mid2, G2]);
check("un partido NO se puede mudar de grupo", !!r.error);
r = await asFacu(`select update_my_profile($1, $2)`, [G2, "Facundo"]);
r = await asFacu(`select (select name from players where id = $1) a, (select name from players where id = $2) b`, [id.Facu, id.FacuG2]);
check("el nombre se cambia por grupo", r.rows?.[0].a === "Facu" && r.rows[0].b === "Facundo");

// Eliminar jugadores
r = await asFacu(`select remove_player($1)`, [id.Ruso]);
check("un jugador NO puede eliminar a otro", !!r.error && /Solo el organizador/.test(r.error));
r = await asLucho(`select remove_player($1)`, [id.Tomi]);
check("el organizador de otro grupo NO elimina jugadores de este", !!r.error && /Solo el organizador/.test(r.error));
r = await asAdmin(`select remove_player($1)`, [id.Juan]);
check("el organizador NO se puede eliminar a sí mismo", !!r.error && /vos mismo/.test(r.error));
await asAdmin(`update matches set mvp = $2 where id = $1`, [mid, id.Ruso]);
r = await asAdmin(`select remove_player($1)`, [id.Ruso]);
check("el organizador elimina a un jugador sin cuenta", !r.error);
r = await asAdmin(`select (select count(*)::int from players where id = $1) p, (select count(*)::int from lineups where player_id = $1) l,
  (select count(*)::int from availability where player_id = $1) a, (select count(*)::int from matches where id = $2) m,
  (select mvp from matches where id = $2) mvp`, [id.Ruso, mid]);
check("se borran sus votos, sus equipos y la figura, pero el partido queda",
  r.rows?.[0].p === 0 && r.rows[0].l === 0 && r.rows[0].a === 0 && r.rows[0].m === 1 && r.rows[0].mvp === null);
r = await asAdmin(`select count(*)::int c from mvp_votes where player_id = $1 or voter_id = $1`, [id.Ruso]);
check("y también los votos de figura que recibió", r.rows?.[0].c === 0);
r = await asAdmin(`select remove_player($1)`, [id.Ruso]);
check("eliminar a alguien que ya no está avisa", !!r.error && /ya no está/.test(r.error));
r = await asAdmin(`select remove_player($1)`, [id.Tomi]);
check("el organizador elimina a un jugador con cuenta", !r.error);
r = await asTomi(`select (select count(*)::int from groups where id = $1) g, (select count(*)::int from players where group_id = $1) p`, [G1]);
check("el eliminado queda afuera del grupo", r.rows?.[0].g === 0 && r.rows[0].p === 0);
r = await asLucho(`select remove_player($1)`, [id.FacuG2]);
r = await asFacu(`select (select count(*)::int from group_members where user_id = $1) g, (select count(*)::int from players where id = $2) p`, [FACU, id.Facu]);
check("eliminarlo de un grupo no lo saca de los otros", r.rows?.[0].g === 1 && r.rows[0].p === 1);

// Eliminar un grupo
r = await asLucho(`select create_group($1, $2) as id`, ["Para borrar", "Lucho"]);
const G3 = r.rows?.[0].id;
r = await asLucho(`select invite_code from groups where id = $1`, [G3]);
await asFacu(`select join_group($1, $2)`, [r.rows?.[0].invite_code, "Facu"]);
r = await asLucho(`insert into matches(group_id) values ($1) returning id`, [G3]);
const mid3 = r.rows?.[0].id;
r = await asLucho(`select id from players where group_id = $1 and user_id = $2`, [G3, FACU]);
await asLucho(`insert into lineups(match_id,player_id,team) values ($1,$2,'A')`, [mid3, r.rows?.[0].id]);
r = await asFacu(`select delete_group($1)`, [G3]);
check("un jugador NO puede eliminar el grupo", !!r.error && /Solo el organizador/.test(r.error));
r = await asAdmin(`select delete_group($1)`, [G3]);
check("el organizador de otro grupo NO puede eliminarlo", !!r.error && /Solo el organizador/.test(r.error));
r = await asLucho(`select delete_group($1)`, [G3]);
check("el organizador elimina el grupo", !r.error);
r = await db.query(`select (select count(*)::int from groups where id = $1) g, (select count(*)::int from group_members where group_id = $1) m,
  (select count(*)::int from players where group_id = $1) p, (select count(*)::int from matches where group_id = $1) mt,
  (select count(*)::int from lineups where group_id = $1) l`, [G3]);
check("se borra todo lo del grupo", Object.values(r.rows[0]).every((c) => c === 0));
r = await asFacu(`select count(*)::int c from group_members where user_id = $1`, [FACU]);
check("los demás grupos de los miembros quedan como estaban", r.rows?.[0].c === 1);

r = await asFacu(`select * from admin_emails`);
check("la lista de organizadores de antes no es legible", !!r.error || r.rows.length === 0);

/* =================== Base de antes de los grupos =================== */
console.log("\n— Migración de una base de un solo grupo —");
const old = new PGlite();
await old.exec(SUPABASE);
await old.exec(`
  create table admin_emails (email text primary key);
  insert into admin_emails values ('soyjuancruzana@gmail.com');
  create table players (id uuid primary key default gen_random_uuid(), name text not null, active boolean not null default true,
    user_id uuid unique references auth.users(id) on delete set null, created_at timestamptz not null default now());
  create table matches (id uuid primary key default gen_random_uuid(), date date not null default current_date,
    format text not null default 'F11', status text not null default 'abierto',
    slots text[] not null default array['20:00','21:00','22:00','23:00'], time text,
    score_a int not null default 0, score_b int not null default 0, mvp uuid references players(id) on delete set null,
    created_at timestamptz not null default now(), played_at timestamptz);
  create table availability (match_id uuid not null references matches(id) on delete cascade,
    player_id uuid not null references players(id) on delete cascade, going boolean not null,
    hours text[] not null default '{}', updated_at timestamptz not null default now(), primary key (match_id, player_id));
  create table lineups (match_id uuid not null references matches(id) on delete cascade,
    player_id uuid not null references players(id) on delete cascade, team text not null,
    goals int not null default 0, primary key (match_id, player_id));
  create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from admin_emails where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))) $$;
  create function my_player_id() returns uuid language sql stable security definer set search_path = public as $$
    select id from players where user_id = auth.uid() $$;
  alter table players enable row level security;
  alter table availability enable row level security;
  create policy "players: admin" on players for all to authenticated using (is_admin()) with check (is_admin());
  create policy "avail: propio" on availability for all to authenticated using (player_id = my_player_id());
  insert into players (id, name, user_id) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Facu', '${FACU}'),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'Ruso', null);
  insert into matches (id, status, score_a, score_b) values ('bbbbbbbb-0000-0000-0000-000000000001', 'jugado', 2, 1);
  insert into lineups values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 2);
  insert into availability (match_id, player_id, going) values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', true);
`);
r = await old.exec(schema).then(() => ({}), (e) => ({ error: e.message }));
check("el esquema nuevo corre sobre la base vieja", !r.error);
if (r.error) console.log("   ", r.error);
await old.exec(schema);
await old.exec(`grant all on all tables in schema public to authenticated;`);
const o = client(old);
r = await o.asAdmin(`select g.name, m.role from groups g join group_members m on m.group_id = g.id where m.user_id = $1`, [ADMIN]);
check("los datos de antes quedan en el grupo «Fútbol de los Jueves» con el organizador de siempre",
  r.rows?.length === 1 && r.rows[0].name === "Fútbol de los Jueves" && r.rows[0].role === "admin");
r = await o.asFacu(`select (select count(*)::int from players) p, (select count(*)::int from matches) m,
  (select count(*)::int from lineups) l, (select count(*)::int from availability) a`);
check("los jugadores de antes siguen viendo plantel, partidos, equipos y votos",
  r.rows?.[0].p === 2 && r.rows[0].m === 1 && r.rows[0].l === 1 && r.rows[0].a === 1);
r = await o.asFacu(`select role from group_members where user_id = $1`, [FACU]);
check("los jugadores con cuenta quedan como jugadores del grupo", r.rows?.[0]?.role === "jugador");
r = await o.asTomi(`select count(*)::int c from players`);
check("alguien que nunca estuvo NO ve nada", r.rows?.[0].c === 0);
r = await old.query(`select count(*)::int c from groups`);
check("correrlo dos veces no crea grupos de más", r.rows[0].c === 1);

console.log(`\n${pass} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
