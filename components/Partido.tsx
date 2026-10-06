"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FORMATS, balanceTeams, computeStats, dayLabel, hs, openMatch, pollSummary, sortSlots,
} from "@/lib/stats";
import type { Format, Lineup, Match } from "@/lib/types";
import { track } from "@/lib/analytics";
import type { Ctx } from "./ctx";
import { NewMatchButton } from "./Hero";

/* ---------- Piezas chicas ---------- */
const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const hue = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

function Faces({ ids, pname }: { ids: string[]; pname: Ctx["pname"] }) {
  if (!ids.length) return null;
  return (
    <span className="faces">
      {ids.slice(0, 3).map((id) => (
        <span key={id} className="face" style={{ "--h": hue(id) } as React.CSSProperties} title={pname(id)}>
          {initials(pname(id))}
        </span>
      ))}
    </span>
  );
}

function Option(props: {
  id: string; label: string; ids: string[]; max: number; on: boolean; kind: "radio" | "check";
  disabled?: boolean; onClick: () => void; pname: Ctx["pname"];
}) {
  const { id, label, ids, max, on, kind, disabled, onClick, pname } = props;
  return (
    <button className="opt" id={id} disabled={disabled} aria-pressed={on} onClick={onClick}>
      <span className={`mark ${kind} ${on ? "on" : ""}`} aria-hidden="true">{on ? "✓" : ""}</span>
      <span className="ob">
        <span className="ot">
          <span className="ol">{label}</span>
          <span className="row" style={{ gap: 6 }}>
            <Faces ids={ids} pname={pname} />
            <span className="oc num">{ids.length}</span>
          </span>
        </span>
        <span className="obar"><i style={{ width: `${(ids.length / max) * 100}%` }} /></span>
      </span>
    </button>
  );
}

/* ---------- Encuesta personal ---------- */
type Vote = { going: boolean; hours: string[] } | null;

function Poll({ ctx, m }: { ctx: Ctx; m: Match }) {
  const { data, supabase, run, isAdmin, meId, pname } = ctx;
  // Votos tocados que el servidor todavía no confirmó: se muestran al instante, sin esperar la vuelta.
  const [drafts, setDrafts] = useState<Map<string, Vote>>(() => new Map());
  const view = useMemo(() => {
    if (!drafts.size) return data;
    const rest = data.availability.filter((a) => a.match_id !== m.id || !drafts.has(a.player_id));
    const local = [...drafts].flatMap(([player_id, v]) => (v ? [{ match_id: m.id, player_id, ...v }] : []));
    return { ...data, availability: [...rest, ...local] };
  }, [data, drafts, m.id]);
  const p = pollSummary(m, view);
  const need = FORMATS[m.format] ?? 22;
  const [voterSel, setVoterSel] = useState<string>("");
  const voter = isAdmin && voterSel ? voterSel : meId;
  const mine = voter ? p.votes.get(voter) : undefined;

  const maxA = Math.max(1, p.toy.length, p.notoy.length);
  const maxH = Math.max(1, ...p.slots.map((s) => p.bySlot[s].length));

  // Una escritura por vez y solo la última de cada jugador: si toca rápido, no se pisan en el servidor.
  const queue = useRef(new Map<string, Vote>());
  const flushing = useRef(false);
  async function flush() {
    if (flushing.current) return;
    flushing.current = true;
    while (queue.current.size) {
      const [id, next] = [...queue.current][0];
      queue.current.delete(id);
      const ok = await run(() =>
        next
          ? supabase.from("availability").upsert({
              match_id: m.id, player_id: id, going: next.going, hours: next.hours,
              updated_at: new Date().toISOString(),
            })
          : supabase.from("availability").delete().eq("match_id", m.id).eq("player_id", id)
      );
      if (ok) track("availability_voted", { going: next ? next.going : null, for_other: id !== meId });
      // Si falló, descarto lo que siguió tocando y vuelvo a lo que dice el servidor.
      if (!ok) queue.current.delete(id);
      if (!queue.current.has(id)) {
        setDrafts((d) => {
          const n = new Map(d);
          n.delete(id);
          return n;
        });
      }
    }
    flushing.current = false;
  }
  function save(next: Vote) {
    if (!voter) return;
    setDrafts((d) => new Map(d).set(voter, next));
    queue.current.set(voter, next);
    flush();
  }
  const toy = () => save(mine?.going ? null : { going: true, hours: mine?.hours ?? [] });
  const notoy = () => save(mine && !mine.going ? null : { going: false, hours: [] });
  const hour = (s: string) => {
    const cur = mine?.going ? mine.hours : [];
    save({ going: true, hours: cur.includes(s) ? cur.filter((x) => x !== s) : sortSlots([...cur, s]) });
  };

  const disabled = !voter;
  const voterName = voter ? pname(voter) : "";

  return (
    <section className="card waq">
      <h2 style={{ marginBottom: 2 }}>{dayLabel(m.date)}</h2>
      <p className="small muted" style={{ margin: "0 0 12px" }}>
        ¿Jugás? · {m.format}, hacen falta {need}
        {m.time && <> · Horario confirmado: <b style={{ color: "var(--ink)" }}>{hs(m.time)}</b></>}
      </p>

      {isAdmin ? (
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="voter">Votando como</label>
          <select id="voter" value={voterSel} onChange={(e) => setVoterSel(e.target.value)}>
            <option value="">{meId ? `Yo (${pname(meId)})` : "Elegí un jugador"}</option>
            {p.active
              .filter((x) => x.id !== meId)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((x) => (
                <option key={x.id} value={x.id}>{x.name}{p.votes.has(x.id) ? " ✓" : ""}</option>
              ))}
          </select>
        </div>
      ) : (
        <p className="small muted" style={{ margin: "0 0 10px" }}>
          Votando como <b style={{ color: "var(--ink)" }}>{voterName}</b>
        </p>
      )}

      <div className="opts">
        <Option id="opt-toy" label="Toy" ids={p.toy} max={maxA} on={!!mine?.going} kind="radio" disabled={disabled} onClick={toy} pname={pname} />
        <Option id="opt-notoy" label="No toy" ids={p.notoy} max={maxA} on={!!mine && !mine.going} kind="radio" disabled={disabled} onClick={notoy} pname={pname} />
      </div>

      {mine?.going ? (
        <div className="hours">
          <p style={{ margin: "0 0 2px" }}><b>¿A qué hora podés?</b></p>
          <p className="small muted" style={{ margin: "0 0 8px" }}>Elegí uno o más</p>
          <div className="opts">
            {p.slots.map((s) => (
              <Option
                key={s} id={`opt-${s.replace(":", "")}`} label={hs(s)} ids={p.bySlot[s]} max={maxH}
                on={mine.hours.includes(s)} kind="check" disabled={disabled} onClick={() => hour(s)} pname={pname}
              />
            ))}
          </div>
          {!mine.hours.length && (
            <p className="small" style={{ margin: "8px 0 0", color: "var(--hot)" }}>
              Marcá al menos un horario para que cuente.
            </p>
          )}
        </div>
      ) : (
        <div className="hours">
          <p className="small muted" style={{ margin: 0 }}>
            Horarios:{" "}
            {p.slots.map((s, i) => (
              <span key={s}>{i > 0 && " · "}<b style={{ color: "var(--ink)" }}>{hs(s)}</b> ({p.bySlot[s].length})</span>
            ))}
          </p>
        </div>
      )}

      <details className="voters">
        <summary className="small">Ver quién votó · {p.toy.length + p.notoy.length} de {p.active.length}</summary>
        {p.slots.map((s) => (
          <p key={s} className="small"><b>{hs(s)}:</b> {p.bySlot[s].map(pname).join(", ") || "—"}</p>
        ))}
        <p className="small"><b>No toy:</b> {p.notoy.map(pname).join(", ") || "—"}</p>
        <p className="small muted"><b>Sin responder:</b> {p.pending.map(pname).join(", ") || "nadie"}</p>
      </details>
    </section>
  );
}

/* ---------- Panel del organizador ---------- */
function Organizer({ ctx, m }: { ctx: Ctx; m: Match }) {
  const { data, supabase, run } = ctx;
  const p = pollSummary(m, data);
  const need = FORMATS[m.format] ?? 22;
  const [newSlot, setNewSlot] = useState("19:00");
  const [adding, setAdding] = useState(false);
  const maxH = Math.max(0, ...p.slots.map((s) => p.bySlot[s].length));
  const upd = (patch: Partial<Match>, ok?: string) =>
    run(() => supabase.from("matches").update(patch).eq("id", m.id), ok);

  async function pickTime(s: string) {
    await run(async () => {
      const del = await supabase.from("lineups").delete().eq("match_id", m.id);
      if (del.error) return del;
      return supabase.from("matches").update({ time: s }).eq("id", m.id);
    }, `Horario confirmado: ${hs(s)}`);
  }
  async function reopen() {
    await run(async () => {
      const del = await supabase.from("lineups").delete().eq("match_id", m.id);
      if (del.error) return del;
      return supabase.from("matches").update({ time: null }).eq("id", m.id);
    }, "Encuesta reabierta");
  }

  const dupSlot = p.slots.includes(newSlot);
  function addSlot() {
    if (!newSlot || dupSlot) return;
    upd({ slots: sortSlots([...p.slots, newSlot]) }, "Horario agregado");
    setAdding(false);
  }
  function startAdding() {
    // Sugiere una hora después del último horario
    const h = Number(p.slots[p.slots.length - 1]?.slice(0, 2) ?? 18) + 1;
    setNewSlot(`${String(h % 24).padStart(2, "0")}:00`);
    setAdding(true);
  }

  return (
    <section className="card">
      <h2>Organizador</h2>
      <div className="fields">
        <div className="field">
          <label htmlFor="mdate">Día</label>
          <input type="date" id="mdate" value={m.date} onChange={(e) => e.target.value && upd({ date: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="mformat">Formato</label>
          <select id="mformat" value={m.format} onChange={(e) => upd({ format: e.target.value as Format })}>
            {Object.keys(FORMATS).map((f) => <option key={f} value={f}>{f} · {FORMATS[f as Format]} jug.</option>)}
          </select>
        </div>
      </div>

      {m.time ? (
        <>
          <h3 className="sub">Horario</h3>
          <div className="combo" style={{ alignItems: "center" }}>
            <span>Confirmado: <b>{hs(m.time)}</b></span>
            <button className="btn ghost" onClick={reopen}>Cambiar</button>
          </div>
        </>
      ) : (
        <>
          <h3 className="sub">Horarios de la encuesta</h3>
          <div className="chips" style={{ marginBottom: 10 }}>
            {p.slots.map((s) => (
              <span key={s} className="chip slot">
                {hs(s)}
                <button
                  className="x"
                  aria-label={`Quitar ${hs(s)}`}
                  onClick={() =>
                    p.slots.length > 1
                      ? upd({ slots: p.slots.filter((x) => x !== s) })
                      : ctx.toast("Tiene que quedar al menos un horario")
                  }
                >×</button>
              </span>
            ))}
            {adding ? (
              <span className="slot-add">
                <input
                  type="time" step={1800} value={newSlot} autoFocus
                  aria-label="Nuevo horario"
                  aria-invalid={dupSlot} aria-describedby={dupSlot ? "newslot-err" : undefined}
                  onChange={(e) => setNewSlot(e.target.value)}
                />
                <button className="btn" disabled={!newSlot || dupSlot} onClick={addSlot}>Agregar</button>
                <button className="x" aria-label="Cancelar" onClick={() => setAdding(false)}>×</button>
              </span>
            ) : (
              <button className="chip slot add" onClick={startAdding}>+ Agregar</button>
            )}
          </div>
          {adding && dupSlot && <p className="err" id="newslot-err" style={{ marginBottom: 10 }}>Ese horario ya está en la encuesta.</p>}

          <h3 className="sub">Confirmar horario</h3>
          <p className="hint" style={{ marginBottom: 8 }}>
            Elegilo cuando haya suficientes votos. Juegan los que marcaron esa hora.
          </p>
          <div className="slot-pick">
            {p.slots.map((s) => {
              const n = p.bySlot[s].length;
              return (
                <button key={s} className={`btn ${n && n === maxH ? "" : "ghost"}`} disabled={!n} onClick={() => pickTime(s)}>
                  {hs(s)} · {n}{n >= need ? " ✓" : ""}
                </button>
              );
            })}
          </div>
          {p.best && p.bySlot[p.best].length < need && (
            <p className="small" style={{ margin: "10px 0 0" }}>
              Al mejor horario le faltan {need - p.bySlot[p.best].length} para {m.format}. Podés esperar más respuestas o cambiar el formato.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- Equipos ---------- */
function Teams({ ctx, m }: { ctx: Ctx; m: Match }) {
  const { data, supabase, run, isAdmin, pname } = ctx;
  const p = pollSummary(m, data);
  const convocados = p.bySlot[m.time!] ?? [];
  const rows = data.lineups.filter((l) => l.match_id === m.id);
  const A = rows.filter((r) => r.team === "A").map((r) => r.player_id);
  const B = rows.filter((r) => r.team === "B").map((r) => r.player_id);
  const inTeam = new Set([...A, ...B]);
  const sinEquipo = convocados.filter((id) => !inTeam.has(id));
  const extrasPosibles = p.active.filter((x) => !inTeam.has(x.id) && !convocados.includes(x.id));
  const { list } = computeStats(data);
  const byId = new Map(list.map((s) => [s.id, s]));
  const [extra, setExtra] = useState("");

  async function balance() {
    const ids = [...new Set([...convocados, ...inTeam])];
    if (ids.length < 2) { ctx.toast("Necesitás al menos 2 confirmados"); return; }
    const t = balanceTeams(ids, list);
    const prevGoals = new Map(rows.map((r) => [r.player_id, r.goals]));
    const next: Lineup[] = [
      ...t.A.map((id) => ({ match_id: m.id, player_id: id, team: "A" as const, goals: prevGoals.get(id) ?? 0 })),
      ...t.B.map((id) => ({ match_id: m.id, player_id: id, team: "B" as const, goals: prevGoals.get(id) ?? 0 })),
    ];
    const ok = await run(async () => {
      const del = await supabase.from("lineups").delete().eq("match_id", m.id);
      if (del.error) return del;
      return supabase.from("lineups").insert(next);
    }, "Equipos armados");
    if (ok) track("teams_generated", { players: ids.length });
  }
  const swap = (id: string, team: "A" | "B") =>
    run(() => supabase.from("lineups").update({ team: team === "A" ? "B" : "A" }).eq("match_id", m.id).eq("player_id", id));
  const remove = (id: string) =>
    run(() => supabase.from("lineups").delete().eq("match_id", m.id).eq("player_id", id));
  const add = (id: string) =>
    run(() => supabase.from("lineups").insert({ match_id: m.id, player_id: id, team: A.length <= B.length ? "A" : "B" }), "Agregado");

  const Col = ({ t, ids, label }: { t: "A" | "B"; ids: string[]; label: string }) => (
    <div className={`team ${t}`}>
      <h3>{label}<span className="small num muted">{ids.length} jug.</span></h3>
      <ul>
        {ids.map((id) => {
          const s = byId.get(id);
          return (
            <li key={id}>
              <span className="nm">{pname(id)}</span>
              <span className="acts">
                <span className="small muted num">{s?.ppm != null ? `${s.ppm.toFixed(1)} pts/PJ` : "nuevo"}</span>
                {isAdmin && (
                  <>
                    <button className="swap icon" onClick={() => swap(id, t)} aria-label={`Pasar a ${pname(id)} al otro equipo`}>⇄</button>
                    <button className="swap icon" onClick={() => remove(id)} aria-label={`Sacar a ${pname(id)}`}>×</button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <section className="card">
      <div className="card-head">
        <h2>Equipos</h2>
        <span className="small muted num">{convocados.length} confirmados</span>
      </div>
      <p className="muted small">
        Juegan los que pueden a las {hs(m.time)}. Los equipos se reparten según puntos por partido para que queden parejos.
      </p>
      {isAdmin && !rows.length && (
        <button className="btn wide" style={{ marginBottom: 12 }} onClick={balance}>Armar equipos parejos</button>
      )}
      {rows.length ? (
        <div className="teams">
          <Col t="A" ids={A} label="Verdes" />
          <Col t="B" ids={B} label="Pecheras" />
        </div>
      ) : (
        <p className="muted">
          {convocados.length ? `Confirmados: ${convocados.map(pname).join(", ")}.` : "Nadie marcó ese horario todavía."}
        </p>
      )}
      {rows.length > 0 && sinEquipo.length > 0 && (
        <p className="small" style={{ margin: "10px 0 0" }}>
          Confirmados sin equipo: {sinEquipo.map(pname).join(", ")}.{isAdmin && " Tocá “Rearmar parejos” para sumarlos."}
        </p>
      )}
      {isAdmin && rows.length > 0 && extrasPosibles.length > 0 && (
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="extra">Sumar a alguien más</label>
          <div className="combo">
            <select id="extra" value={extra} onChange={(e) => setExtra(e.target.value)}>
              <option value="">Elegí un jugador…</option>
              {extrasPosibles.sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button className="btn ghost" disabled={!extra} onClick={() => { add(extra); setExtra(""); }}>Sumar</button>
          </div>
        </div>
      )}
      {isAdmin && rows.length > 0 && (
        <button className="btn ghost wide" style={{ marginTop: 12 }} onClick={balance}>Rearmar parejos</button>
      )}
    </section>
  );
}

/* ---------- Resultado ---------- */
// Teclado numérico para tipear el marcador directo; los −/+ quedan para ajustar.
export function ScoreSide({ t, label, v, set }: { t: "A" | "B"; label: string; v: number; set: (n: number) => void }) {
  return (
    <div className={`side ${t}`}>
      <label className="lbl" htmlFor={`score-${t}`} style={{ color: `var(--${t.toLowerCase()})` }}>{label}</label>
      <input
        id={`score-${t}`} className="num" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
        value={v} onFocus={(e) => e.target.select()}
        onChange={(e) => set(Math.min(99, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0))}
      />
      <span className="step">
        <button onClick={() => set(Math.max(0, v - 1))} aria-label={`Restar gol ${label}`}>−</button>
        <button onClick={() => set(Math.min(99, v + 1))} aria-label={`Sumar gol ${label}`}>+</button>
      </span>
    </div>
  );
}

function ResultForm({ ctx, m }: { ctx: Ctx; m: Match }) {
  const { data, supabase, run, pname, setTab } = ctx;
  const rows = data.lineups.filter((l) => l.match_id === m.id);
  const A = rows.filter((r) => r.team === "A").map((r) => r.player_id);
  const B = rows.filter((r) => r.team === "B").map((r) => r.player_id);
  const [a, setA] = useState(m.score_a);
  const [b, setB] = useState(m.score_b);
  const [goals, setGoals] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.player_id, r.goals])));
  const [mvp, setMvp] = useState<string | null>(m.mvp);
  const [busy, setBusy] = useState(false);

  // Si cambian los equipos, conservo lo cargado y sumo a los nuevos en 0.
  const key = rows.map((r) => r.player_id).sort().join();
  useEffect(() => {
    setGoals((g) => Object.fromEntries(rows.map((r) => [r.player_id, g[r.player_id] ?? r.goals])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ga = A.reduce((s, id) => s + (goals[id] || 0), 0);
  const gb = B.reduce((s, id) => s + (goals[id] || 0), 0);

  function bumpGoal(id: string, d: number) {
    const next = { ...goals, [id]: Math.max(0, (goals[id] || 0) + d) };
    setGoals(next);
    const inA = A.includes(id);
    const tot = (inA ? A : B).reduce((s, x) => s + (next[x] || 0), 0);
    if (inA && tot > a) setA(tot);
    if (!inA && tot > b) setB(tot);
  }

  async function finish() {
    setBusy(true);
    const ok = await run(async () => {
      const up = await supabase.from("lineups").upsert(
        rows.map((r) => ({ match_id: m.id, player_id: r.player_id, team: r.team, goals: goals[r.player_id] || 0 }))
      );
      if (up.error) return up;
      return supabase.from("matches").update({
        score_a: a, score_b: b, mvp, status: "jugado", played_at: m.played_at ?? new Date().toISOString(),
      }).eq("id", m.id);
    }, "Resultado guardado");
    setBusy(false);
    if (ok) {
      track("result_saved");
      setTab("tabla");
    }
  }

  const line = (id: string) => (
    <li key={id}>
      <span className="nm">{pname(id)}</span>
      <span className="acts">
        <button className={`mvp ${mvp === id ? "on" : ""}`} aria-pressed={mvp === id} onClick={() => setMvp(mvp === id ? null : id)}>Figura</button>
        <span className="step">
          <button onClick={() => bumpGoal(id, -1)} aria-label={`Restar gol a ${pname(id)}`}>−</button>
          <span>{goals[id] || 0}</span>
          <button onClick={() => bumpGoal(id, 1)} aria-label={`Sumar gol a ${pname(id)}`}>+</button>
        </span>
      </span>
    </li>
  );

  const mismatch = ga > a || gb > b;

  return (
    <section className="card">
      <h2>Cargar resultado</h2>
      <div className="score">
        <ScoreSide t="A" label="Verdes" v={a} set={setA} />
        <span className="sep" aria-hidden="true">–</span>
        <ScoreSide t="B" label="Pecheras" v={b} set={setB} />
      </div>
      <h3 className="sub" style={{ marginTop: 0 }}>Goles y figura</h3>
      <div className="teams">
        <div className="team A"><h3>Verdes</h3><ul>{A.map(line)}</ul></div>
        <div className="team B"><h3>Pecheras</h3><ul>{B.map(line)}</ul></div>
      </div>
      <div className="sticky-cta">
        {mismatch && (
          <p className="err" role="alert">Hay más goles individuales que goles en el marcador.</p>
        )}
        <button className="btn" id="finish" disabled={busy} onClick={finish}>
          {busy ? "Guardando…" : `Guardar ${a}–${b} y cerrar partido`}
        </button>
      </div>
    </section>
  );
}

/* ---------- Página ---------- */
export default function Partido({ ctx }: { ctx: Ctx }) {
  const { data, isAdmin, supabase, run } = ctx;
  const m = openMatch(data.matches);
  const [confirmDel, setConfirmDel] = useState(false);

  if (!data.players.length) {
    return (
      <div className="card empty">
        <h2>Todavía no hay jugadores</h2>
        <p className="muted">Pasale el link de invitación al grupo (está en Plantel): cada uno se suma entrando con su Google.</p>
      </div>
    );
  }
  if (!m) {
    return (
      <div className="card empty">
        <h2>No hay encuesta abierta</h2>
        <p className="muted">
          {isAdmin
            ? "Abrí una para el próximo partido y que cada uno vote si va y a qué hora."
            : "Cuando el organizador abra la encuesta del próximo partido, la vas a ver acá."}
        </p>
        {isAdmin && <NewMatchButton ctx={ctx} />}
      </div>
    );
  }

  const hasTeams = data.lineups.some((l) => l.match_id === m.id);

  // Partido ya jugado que se reabrió desde Historial: solo equipos y resultado.
  if (m.played_at) {
    return (
      <>
        {m.time && <Teams ctx={ctx} m={m} />}
        {hasTeams && isAdmin && <ResultForm ctx={ctx} m={m} key={`res-${m.id}`} />}
      </>
    );
  }

  return (
    <>
      <Poll ctx={ctx} m={m} key={`poll-${m.id}`} />
      {isAdmin && <Organizer ctx={ctx} m={m} />}
      {m.time && <Teams ctx={ctx} m={m} />}
      {m.time && hasTeams && isAdmin && <ResultForm ctx={ctx} m={m} key={`res-${m.id}`} />}
      {isAdmin && (
        <div className="danger-zone">
          {confirmDel ? (
            <div className="confirm">
              <p className="small">¿Borrar esta encuesta y sus votos? No se puede deshacer.</p>
              <button className="btn ghost" onClick={() => setConfirmDel(false)}>No</button>
              <button className="btn danger" onClick={async () => { await run(() => supabase.from("matches").delete().eq("id", m.id), "Encuesta borrada"); setConfirmDel(false); }}>
                Sí, borrar
              </button>
            </div>
          ) : (
            <button className="btn danger-ghost wide" onClick={() => setConfirmDel(true)}>Cancelar partido</button>
          )}
        </div>
      )}
    </>
  );
}
