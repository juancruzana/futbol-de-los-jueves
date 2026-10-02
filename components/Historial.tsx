"use client";

import { useState } from "react";
import { fmtDate, hs, openMatch, playedMatches } from "@/lib/stats";
import type { Ctx } from "./ctx";

export default function Historial({ ctx }: { ctx: Ctx }) {
  const { data, isAdmin, supabase, run, pname, setTab } = ctx;
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const P = playedMatches(data.matches).reverse();
  const hayAbierto = !!openMatch(data.matches);

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
      {P.map((m) => {
        const rows = data.lineups.filter((l) => l.match_id === m.id);
        const A = rows.filter((r) => r.team === "A").map((r) => pname(r.player_id));
        const B = rows.filter((r) => r.team === "B").map((r) => pname(r.player_id));
        const goles = rows
          .filter((r) => r.goals > 0)
          .sort((x, y) => y.goals - x.goals)
          .map((r) => pname(r.player_id) + (r.goals > 1 ? ` (${r.goals})` : ""))
          .join(", ");
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
                {goles && <div className="mini">⚽ {goles}</div>}
                {m.mvp && <div className="mini">Figura: <b>{pname(m.mvp)}</b></div>}
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
                    {!hayAbierto && (
                      <button
                        className="btn ghost small"
                        onClick={async () => {
                          const ok = await run(() => supabase.from("matches").update({ status: "abierto" }).eq("id", m.id), "Partido reabierto para corregir");
                          if (ok) setTab("partido");
                        }}
                      >
                        Corregir
                      </button>
                    )}
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
