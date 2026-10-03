"use client";

import { PTS, computeStats, openMatch, type PlayerStats, type Result } from "@/lib/stats";
import type { Ctx } from "./ctx";

const LETTER: Record<Result, string> = { W: "G", D: "E", L: "P" };

function Streak({ n }: { n: number }) {
  return (
    <span
      className={`streak ${n ? "on" : "off"} ${n >= 3 ? "hot" : ""}`}
      title={`${n} ${n === 1 ? "partido seguido" : "partidos seguidos"} presente`}
    >
      <span aria-hidden>🔥</span>
      <span className="num">{n}</span>
    </span>
  );
}

function Form({ form }: { form: Result[] }) {
  const pad = Math.max(0, 5 - form.length);
  return (
    <div className="form">
      {Array.from({ length: pad }, (_, i) => <span key={`x${i}`} className="X">·</span>)}
      {form.map((r, i) => <span key={i} className={r}>{LETTER[r]}</span>)}
    </div>
  );
}

function Scoring() {
  return (
    <section className="card">
      <h2>Cómo se suman los puntos</h2>
      <div className="legend" style={{ margin: 0 }}>
        <span><b>+{PTS.presencia}</b> por jugar</span>
        <span><b>+{PTS.victoria}</b> victoria</span>
        <span><b>+{PTS.empate}</b> empate</span>
        <span><b>+{PTS.gol}</b> por gol</span>
        <span><b>+{PTS.figura}</b> figura del partido</span>
      </div>
      <p className="muted small" style={{ margin: "8px 0 0" }}>
        El punto por presencia premia a los que vienen siempre: jugar más suma más.
      </p>
    </section>
  );
}

export default function Tabla({ ctx }: { ctx: Ctx }) {
  const { data, isAdmin, meId, setTab } = ctx;
  const open = openMatch(data.matches);
  const { list, total } = computeStats(data);
  const rows = list
    .filter((s) => s.active || s.pj)
    .sort((a, b) => b.pts - a.pts || b.pj - a.pj || b.goles - a.goles || a.name.localeCompare(b.name));

  if (!total) {
    return (
      <>
        <div className="card empty">
          <h2>Todavía no hay partidos cargados</h2>
          <p className="muted">
            {isAdmin
              ? "Abrí la encuesta, que cada uno vote su horario, armá los equipos y cargá el resultado. La tabla y las rachas se calculan solas."
              : "Cuando se juegue el primer partido, acá vas a ver la tabla, las rachas y los goleadores."}
          </p>
          {open && (
            <button className="btn ghost" onClick={() => setTab("partido")}>Ver el próximo partido</button>
          )}
        </div>
        <Scoring />
      </>
    );
  }

  const best = (f: (s: PlayerStats) => number) =>
    rows.filter((r) => f(r) > 0).sort((a, b) => f(b) - f(a))[0];
  const hot = best((s) => s.recentPts);
  const unb = best((s) => s.unbeaten);
  const att = best((s) => s.attend);
  const gol = best((s) => s.goles);
  const ausentes = rows.filter((r) => r.active && r.missed >= 3).sort((a, b) => b.missed - a.missed);
  const plural = (n: number, s: string, p = s + "s") => `${n} ${n === 1 ? s : p}`;

  const Card = ({ k, s, sub, fire = false }: { k: string; s?: PlayerStats; sub: (s: PlayerStats) => string; fire?: boolean }) => (
    <div className="card">
      <div className="k">{k}</div>
      <div className={`v ${fire ? "fire" : ""}`}>{s ? s.name : "—"}</div>
      <div className="s">{s ? sub(s) : "Sin datos todavía"}</div>
    </div>
  );

  return (
    <>
      <section className="hl">
        <Card k="En llamas" fire s={hot} sub={(s) => `${s.recentPts} pts en los últimos 4 partidos`} />
        <Card k="Invicto" s={unb} sub={(s) => `${plural(s.unbeaten, "partido")} seguidos sin perder`} />
        <Card k="No falta nunca" s={att} sub={(s) => `${plural(s.attend, "partido")} seguidos jugados`} />
        <Card k="Goleador" s={gol} sub={(s) => `${plural(s.goles, "gol", "goles")} en ${s.pj} PJ`} />
      </section>

      <section className="card">
        <h2>Tabla general</h2>

        {/* Celular: una fila por jugador con lo esencial a la vista */}
        <ol className="standings only-mob">
          {rows.map((r, i) => (
            <li key={r.id} className={`${i < 3 ? "top" : ""} ${r.id === meId ? "me" : ""}`}>
              <span className="pos num">{i + 1}</span>
              <div className="who">
                <span className="name-row">
                  <span className="name">{r.name}{r.id === meId && <span className="small muted"> (vos)</span>}</span>
                  <Streak n={r.attend} />
                </span>
                <span className="meta num">
                  <span><b>{r.pj}</b> PJ</span>
                  <span><b>{r.w}‑{r.d}‑{r.l}</b></span>
                  <span><b>{r.goles}</b> {r.goles === 1 ? "gol" : "goles"}</span>
                  {r.mvp > 0 && <span className="fig"><b>{r.mvp}</b> {r.mvp === 1 ? "figura" : "figuras"}</span>}
                  <span><b>{r.pct}%</b> asistencia</span>
                </span>
                <Form form={r.form} />
              </div>
              <span className="pts num">{r.pts}<small>pts</small></span>
            </li>
          ))}
        </ol>

        {/* Escritorio: tabla completa */}
        <div className="tablewrap only-desk">
          <table>
            <thead>
              <tr>
                <th></th><th>Jugador</th><th className="n">Pts</th><th className="n">PJ</th>
                <th className="n">G‑E‑P</th><th className="n">Goles</th><th className="n">Fig.</th>
                <th className="n">Asist.</th><th>Forma</th><th>Racha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={i < 3 ? "top" : ""} style={r.id === meId ? { background: "var(--a-soft)" } : undefined}>
                  <td className="pos num">{i + 1}</td>
                  <td className="name">{r.name}{r.id === meId && <span className="small muted"> (vos)</span>}</td>
                  <td className="n pts">{r.pts}</td>
                  <td className="n">{r.pj}</td>
                  <td className="n">{r.w}‑{r.d}‑{r.l}</td>
                  <td className="n">{r.goles}</td>
                  <td className="n">{r.mvp}</td>
                  <td className="n">{r.pct}%</td>
                  <td><Form form={r.form} /></td>
                  <td><Streak n={r.attend} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend">
          <span className="only-mob"><b>PJ</b> jugados · <b>G‑E‑P</b> ganados, empatados, perdidos</span>
          <span><b>Asistencia</b> % de los {total} partidos jugados</span>
          <span><b>🔥 Racha</b> partidos seguidos presente</span>
        </div>
      </section>

      {ausentes.length > 0 && (
        <section className="card">
          <h2>Los extrañamos</h2>
          <p className="muted small">Faltaron a los últimos 3 partidos o más. Un mensajito en el grupo no viene mal.</p>
          <div className="chips">
            {ausentes.map((a) => <span key={a.id} className="chip">{a.name} · {a.missed} sin venir</span>)}
          </div>
        </section>
      )}

      <Scoring />
    </>
  );
}
