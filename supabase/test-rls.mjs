// Corre schema.sql sobre un Postgres en memoria imitando a Supabase (auth.uid/jwt, rol authenticated)
// y comprueba que la RLS hace lo que promete.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";

const db = new PGlite();
const ADMIN = "11111111-1111-1111-1111-111111111111";
const FACU = "22222222-2222-2222-2222-222222222222";
const TOMI = "33333333-3333-3333-3333-333333333333";

await db.exec(`
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
  insert into auth.users values ('${ADMIN}','soyjuancruzana@gmail.com'),('${FACU}','facu@x.com'),('${TOMI}','tomi@x.com');
`);
const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
await db.exec(schema);
await db.exec(schema); // idempotente
await db.exec(`grant all on all tables in schema public to authenticated;`);

let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? "✔" : "✘"} ${name}`); };

async function as(uid, email, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid','${uid}',false), set_config('test.email','${email}',false); set role authenticated;`);
  try { const r = await db.query(sql, params); return { rows: r.rows, n: r.affectedRows ?? 0 }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec("reset role"); }
}
const asAdmin = (s, p) => as(ADMIN, "soyjuancruzana@gmail.com", s, p);
const asFacu = (s, p) => as(FACU, "facu@x.com", s, p);
const asTomi = (s, p) => as(TOMI, "tomi@x.com", s, p);

// Admin carga plantel
let r = await asAdmin(`insert into players(name) values ('Juan Cruz'),('Facu'),('Tomi'),('Ruso') returning id,name`);
check("admin carga jugadores", r.rows?.length === 4);
const id = Object.fromEntries(r.rows.map((x) => [x.name, x.id]));

r = await asFacu(`insert into players(name) values ('Colado')`);
check("un jugador NO puede agregar al plantel", !!r.error);

// Reclamos
r = await asFacu(`select claim_player($1)`, [id.Facu]);
check("Facu reclama su jugador", !r.error);
r = await asTomi(`select claim_player($1)`, [id.Facu]);
check("Tomi NO puede reclamar a Facu", !!r.error && /otra persona/.test(r.error));
r = await asFacu(`select claim_player($1)`, [id.Ruso]);
check("Facu NO puede reclamar un segundo jugador", !!r.error);
r = await asTomi(`select claim_player($1)`, [id.Tomi]);
check("Tomi reclama el suyo", !r.error);
r = await asFacu(`update players set user_id = null where id = $1`, [id.Tomi]);
check("Facu NO puede desvincular a Tomi", !r.error && r.n === 0);

// Partido
r = await asFacu(`insert into matches default values`);
check("un jugador NO puede abrir partido", !!r.error);
r = await asAdmin(`insert into matches default values returning id, slots`);
const mid = r.rows[0].id;
check("admin abre partido con horarios 20–23", r.rows[0].slots.join() === "20:00,21:00,22:00,23:00");

// Votos
r = await asFacu(`insert into availability(match_id,player_id,going,hours) values ($1,$2,true,'{21:00,22:00}')`, [mid, id.Facu]);
check("Facu vota por sí mismo", !r.error);
r = await asFacu(`insert into availability(match_id,player_id,going,hours) values ($1,$2,false,'{}')`, [mid, id.Tomi]);
check("Facu NO puede votar por Tomi", !!r.error);
r = await asFacu(`update availability set hours='{20:00}' where match_id=$1 and player_id=$2`, [mid, id.Tomi]);
check("Facu NO puede editar el voto de Tomi (0 filas)", !r.error && r.n === 0);
r = await asAdmin(`insert into availability(match_id,player_id,going,hours) values ($1,$2,true,'{21:00}')`, [mid, id.Ruso]);
check("admin vota por alguien que contestó por WhatsApp", !r.error);
r = await asTomi(`select count(*)::int c from availability where match_id=$1`, [mid]);
check("todos ven los votos", r.rows?.[0].c === 2);

// Equipos y resultado
r = await asFacu(`insert into lineups(match_id,player_id,team,goals) values ($1,$2,'A',5)`, [mid, id.Facu]);
check("un jugador NO puede cargarse goles", !!r.error);
r = await asAdmin(`insert into lineups(match_id,player_id,team,goals) values ($1,$2,'A',2),($1,$3,'B',1)`, [mid, id.Facu, id.Ruso]);
check("admin arma equipos", !r.error);
r = await asFacu(`update matches set score_a=9 where id=$1`, [mid]);
check("un jugador NO puede tocar el resultado (0 filas)", !r.error && r.n === 0);
r = await asAdmin(`update matches set score_a=3, score_b=1, status='jugado' where id=$1`, [mid]);
check("admin cierra el partido", !r.error && r.n === 1);
r = await asFacu(`update availability set hours='{20:00}' where match_id=$1 and player_id=$2`, [mid, id.Facu]);
check("con el partido cerrado ya no se puede cambiar el voto", !r.error && r.n === 0);

r = await asFacu(`select * from admin_emails`);
check("la lista de organizadores no es legible", !!r.error || r.rows.length === 0);

console.log(`\n${pass} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
