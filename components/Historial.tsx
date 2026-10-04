"use client";

import { useState } from "react";
import { FORMATS, fmtDate, hs, mvpVoteOpen, playedMatches } from "@/lib/stats";
import type { Format, Match } from "@/lib/types";
import type { Ctx } from "./ctx";
import FiguraVote from "./Figura";
import { ScoreSide } from "./Partido";

/* ---------- Editar un partido jugado ---------- */
type Row = { team: "A" | "B"; goals: number };

function EditMatch({ ctx, m, onClose }: { ctx: Ctx; m: Match; onClose: () => void }) {
  const { data, supabase, run, pname } = ctx;
  const orig = data.lineups.filter((l) => l.match_id === m.id);
  const [date, setDate] = useState(m.date);
  const [time, setTime] = useState(m.time ?? "");
  const [format, setFormat] = useState<Format>(m.format);
  const [a, setA] = useState(m.score_a);
  const [b, setB] = useState(m.score_b);
  const [mvp, setMvp] = useState<string | null>(m.mvp);
  const [rows, setRows] = useState(() => new Map<string, Row>(orig.map((r) => [r.player_id, { team: r.team, goals: r.goals }])));
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);

  const team = (t: "A" | "B") => [...rows].filter(([, r]) => r.team === t).map(([id]) => id);
  const A = team("A");
  const B = team("B");
  const goalsOf = (ids: string[], rs = rows) => ids.reduce((s, id) => s + (rs.get(id)?.goals ?? 0), 0);
  const ga = goalsOf(A);
  const gb = goalsOf(B);
  const sueltos = data.players.filter((x) => !rows.has(x.id)).sort((x, y) => x.name.localeCompare(y.name));

  const patch = (id: string, p: Partial<Row>) => {
    const next = new Map(rows).set(id, { ...rows.get(id)!, ...p });
    setRows(next);
    return next;
  };
  function bumpGoal(id: string, d: number) {
    const r = rows.get(id)!;
    const next = patch(id, { goals: Math.max(0, r.goals + d) });
    const tot = goalsOf(r.team === "A" ? A : B, next);
    if (r.team === "A" && tot > a) setA(tot);
    if (r.team === "B" && tot > b) setB(tot);
  }
  const swap = (id: string) => patch(id, { team: rows.get(id)!.team === "A" ? "B" : "A" });
  function remove(id: string) {
    const next = new Map(rows);
    next.delete(id);
    setRows(next);
    if (mvp === id) setMvp(null);
  }
  function add(id: string) {
    setRows(new Map(rows).set(id, { team: A.length <= B.length ? "A" : "B", goals: 0 }));
    setExtra("");
  }

  async function save() {
    setBusy(true);
    const ok = await run(async () => {
      const up = await supabase.from("lineups").upsert(
        [...rows].map(([player_id, r]) => ({ match_id: m.id, player_id, team: r.team, goals: r.goals }))
      );
      if (up.error) return up;
      const gone = orig.map((r) => r.player_id).filter((id) => !rows.has(id));
      if (gone.length) {
        const del = await supabase.from("lineups").delete().eq("match_id", m.id).in("player_id", gone);
        if (del.error) return del;
      }
      return supabase.from("matches").update({
        date, time: time || null, format, score_a: a, score_b: b, mvp,
      }).eq("id", m.id);
    }, "Partido actualizado");
    setBusy(false);
    if (ok) onClose();
  }

  const line = (id: string) => {
    const r = rows.get(id)!;
    return (
      <li key={id}>
        <span className="nm">{pname(id)}</span>
        <span className="acts edit-acts">
          <button className={`mvp ${mvp === id ? "on" : ""}`} aria-pressed={mvp === id} onClick={() => setMvp(mvp === id ? null : id)}>Figura</button>
          <span className="step">
            <button onClick={() => bumpGoal(id, -1)} aria-label={`Restar gol a ${pname(id)}`}>−</button>
            <span>{r.goals}</span>
            <button onClick={() => bumpGoal(id, 1)} aria-label={`Sumar gol a ${pname(id)}`}>+</button>
          </span>
          <button className="swap icon" onClick={() => swap(id)} aria-label={`Pasar a ${pname(id)} al otro equipo`}>⇄</button>
          <button className="swap icon" onClick={() => remove(id)} aria-label={`Sacar a ${pname(id)}`}>×</button>
        </span>
      </li>
    );
  };

  const sinEquipo = !A.length || !B.length;
  const mismatch = ga > a || gb > b;

  return (
    <>
      <h2>Editar partido</h2>
      <div className="fields">
        <div className="field">
          <label htmlFor="edate">Día</label>
          <input type="date" id="edate" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="etime">Horario</label>
          <input type="time" id="etime" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="eformat">Formato</label>
          <select id="eformat" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            {Object.keys(FORMATS).map((f) => <option key={f} value={f}>{f} · {FORMATS[f as Format]} jug.</option>)}
          </select>
        </div>
      </div>

      <h3 className="sub">Resultado</h3>
      <div className="score">
        <ScoreSide t="A" label="Verdes" v={a} set={setA} />
        <span className="sep" aria-hidden="true">–</span>
        <ScoreSide t="B" label="Pecheras" v={b} set={setB} />
      </div>

      <h3 className="sub" style={{ marginTop: 0 }}>Equipos, goles y figura</h3>
      <div className="teams">
        <div className="team A"><h3>Verdes<span className="small num muted">{A.length} jug.</span></h3><ul>{A.map(line)}</ul></div>
        <div className="team B"><h3>Pecheras<span className="small num muted">{B.length} jug.</span></h3><ul>{B.map(line)}</ul></div>
      </div>
      {sueltos.length > 0 && (
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="eextra">Sumar a alguien que jugó</label>
          <div className="combo">
            <select id="eextra" value={extra} onChange={(e) => setExtra(e.target.value)}>
              <option value="">Elegí un jugador…</option>
              {sueltos.map((x) => <option key={x.id} value={x.id}>{x.name}{x.active ? "" : " (inactivo)"}</option>)}
            </select>
            <button className="btn ghost" disabled={!extra} onClick={() => add(extra)}>Sumar</button>
          </div>
        </div>
      )}

      <div className="sticky-cta">
        {sinEquipo && <p className="err" role="alert">Cada equipo tiene que tener al menos un jugador.</p>}
        {!sinEquipo && mismatch && (
          <p className="err" role="alert">Hay más goles individuales que goles en el marcador.</p>
        )}
        <div className="confirm">
          <button className="btn ghost" disabled={busy} onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={busy || !date || sinEquipo} onClick={save}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- Página ---------- */
export default function Historial({ ctx }: { ctx: Ctx }) {
  const { data, isAdmin, meId, supabase, run, pname } = ctx;
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const P = playedMatches(data.matches).reverse();
  // Votaciones de figura abiertas, arriba de todo: las ven los que jugaron (votan) y el organizador.
  const votando = P.filter(
    (m) => mvpVoteOpen(m) && (isAdmin || data.lineups.some((l) => l.match_id === m.id && l.player_id === meId))
  );

  async function openVote(m: Match) {
    const ok = await run(() => supabase.from("matches").update({ mvp_vote: "abierta" }).eq("id", m.id), "Votación abierta: compartí el link");
    if (ok) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!P.length) {
    return (
      <div className="card empty">
        <h2>Sin partidos todavía</h2>
        <p className="muted">Cuando se cargue el primer resultado va a aparecer acá.</p>
      </div>
    );
  }

  return (
    <>
      {votando.map((m) => <FiguraVote key={`fig-${m.id}`} ctx={ctx} m={m} />)}
      {P.map((m) => {
        if (isAdmin && editing === m.id) {
          return (
            <article key={m.id} className="card">
              <EditMatch ctx={ctx} m={m} onClose={() => setEditing(null)} />
            </article>
          );
        }
        const rows = data.lineups.filter((l) => l.match_id === m.id);
        const A = rows.filter((r) => r.team === "A").map((r) => pname(r.player_id));
        const B = rows.filter((r) => r.team === "B").map((r) => pname(r.player_id));
        const goles = rows
          .filter((r) => r.goals > 0)
          .sort((x, y) => y.goals - x.goals)
          .map((r) => pname(r.player_id) + (r.goals > 1 ? ` (${r.goals})` : ""))
          .join(", ");
        const mvpVotes = m.mvp_vote === "cerrada" ? data.mvpVotes.filter((v) => v.match_id === m.id && v.player_id === m.mvp).length : 0;
        return (
          <article key={m.id} className="card">
            <div className="match">
              <div className="d">
                {fmtDate(m.date)}
                <div className="small muted" style={{ fontFamily: "var(--body)", textTransform: "none", marginTop: 4 }}>
                  {[m.time ? hs(m.time) : "", m.format].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="info">
                <div className="mini"><b style={{ color: "var(--a)" }}>Verdes:</b> {A.join(", ")}</div>
                <div className="mini"><b style={{ color: "var(--b)" }}>Pecheras:</b> {B.join(", ")}</div>
                {goles && <div className="mini">Goles: {goles}</div>}
                {mvpVoteOpen(m) ? (
                  <div className="mini">Figura: votación abierta</div>
                ) : m.mvp && (
                  <div className="mini">
                    Figura: <b>{pname(m.mvp)}</b>{mvpVotes > 0 && ` · ${mvpVotes} ${mvpVotes === 1 ? "voto" : "votos"}`}
                  </div>
                )}
              </div>
              <div className="res num">
                <span style={{ color: "var(--a)" }}>{m.score_a}</span>–<span style={{ color: "var(--b)" }}>{m.score_b}</span>
              </div>
            </div>
            {isAdmin && (
              <div className="match-acts">
                {confirmDel === m.id ? (
                  <div className="confirm">
                    <p className="small">¿Borrar este partido de la tabla? No se puede deshacer.</p>
                    <button className="btn ghost" onClick={() => setConfirmDel(null)}>No</button>
                    <button className="btn danger" onClick={async () => { await run(() => supabase.from("matches").delete().eq("id", m.id), "Partido borrado"); setConfirmDel(null); }}>
                      Sí, borrar
                    </button>
                  </div>
                ) : (
                  <>
                    {!mvpVoteOpen(m) && rows.length > 1 && (
                      <button className="btn ghost small" onClick={() => openVote(m)}>
                        {m.mvp_vote === "cerrada" ? "Reabrir votación" : "Votación de figura"}
                      </button>
                    )}
                    <button className="btn ghost small" onClick={() => { setEditing(m.id); setConfirmDel(null); }}>Editar</button>
                    <button className="btn danger-ghost small" onClick={() => setConfirmDel(m.id)}>Borrar</button>
                  </>
                )}
              </div>
            )}
          </article>
        );
      })}
    </>
  );
}
