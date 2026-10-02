"use client";

import { useState } from "react";
import type { Ctx } from "./ctx";

/** Primera vez: la cuenta logueada elige cuál de los jugadores del plantel es. */
export default function Claim({ ctx, compact = false }: { ctx: Ctx; compact?: boolean }) {
  const { data, supabase, run, isAdmin, setTab } = ctx;
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const free = data.players.filter((p) => p.active && !p.user_id).sort((a, b) => a.name.localeCompare(b.name));
  const taken = data.players.filter((p) => p.active && p.user_id).length;

  if (!data.players.length) {
    return (
      <div className="card empty">
        <h2>Todavía no hay plantel</h2>
        {isAdmin ? (
          <>
            <p className="muted">Cargá los nombres del grupo y después elegí cuál sos vos.</p>
            <button className="btn" onClick={() => setTab("plantel")}>Cargar plantel</button>
          </>
        ) : (
          <p className="muted">El organizador todavía no cargó los jugadores. Volvé en un rato.</p>
        )}
      </div>
    );
  }

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    await run(() => supabase.rpc("claim_player", { p: picked }), "¡Listo! Ya estás vinculado");
    setBusy(false);
    setPicked(null);
  }

  const pickedName = data.players.find((p) => p.id === picked)?.name;

  return (
    <section className={`card ${compact ? "" : "empty"}`} style={compact ? undefined : { textAlign: "left" }}>
      <h2>{compact ? "Vinculá tu jugador" : "¿Quién sos?"}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        {compact
          ? "Como organizador ya podés usar todo, pero para votar en la encuesta elegí cuál de los jugadores sos."
          : "Elegí tu nombre una sola vez. Queda atado a tu cuenta y nadie más puede votar por vos."}
      </p>
      {free.length ? (
        <div className="chips" style={{ marginBottom: 12 }}>
          {free.map((p) => (
            <button
              key={p.id}
              id={`claim-${p.id}`}
              className="chip pick"
              aria-pressed={picked === p.id}
              onClick={() => setPicked(picked === p.id ? null : p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="small">Todos los jugadores ya están vinculados ({taken}). Si no aparecés, pedile al organizador que te agregue.</p>
      )}
      {!compact && free.length > 0 && (
        <p className="small muted" style={{ marginBottom: 0 }}>¿No estás en la lista? Avisale al organizador.</p>
      )}
      {picked && (
        <div className="sticky-cta" role="group" aria-label="Confirmar jugador">
          <p className="small" style={{ margin: 0 }}>
            ¿Sos <b>{pickedName}</b>? No se puede cambiar después sin el organizador.
          </p>
          <div className="confirm">
            <button className="btn ghost" onClick={() => setPicked(null)}>No</button>
            <button className="btn" disabled={busy} onClick={confirm}>Sí, soy yo</button>
          </div>
        </div>
      )}
    </section>
  );
}
