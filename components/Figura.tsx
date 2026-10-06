"use client";

import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/stats";
import type { Match } from "@/lib/types";
import { track } from "@/lib/analytics";
import type { Ctx } from "./ctx";
import { useFresh } from "./fresh";

/** Votación de la figura de un partido jugado: votan los que jugaron y la cierra el organizador. */
export default function FiguraVote({ ctx, m }: { ctx: Ctx; m: Match }) {
  const { data, supabase, run, isAdmin, meId, pname, toast } = ctx;
  const rows = data.lineups.filter((l) => l.match_id === m.id);
  const played = new Set(rows.map((r) => r.player_id));
  // Si el organizador editó los equipos después, solo cuentan votos de y para los que siguen.
  const votes = data.mvpVotes.filter((v) => v.match_id === m.id && played.has(v.voter_id) && played.has(v.player_id));
  const canVote = !!meId && played.has(meId);
  const mine = votes.find((v) => v.voter_id === meId)?.player_id ?? null;

  // El voto tocado se ve al instante; cuando termina de guardar vuelve a lo que dice el servidor.
  const [draft, setDraft] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const pick = draft === undefined ? mine : draft;

  async function vote(id: string) {
    if (busy || !meId) return;
    const next = pick === id ? null : id;
    setDraft(next);
    setBusy(true);
    const ok = await run(() =>
      next
        ? supabase.from("mvp_votes").upsert({
            match_id: m.id, voter_id: meId, player_id: next, updated_at: new Date().toISOString(),
          })
        : supabase.from("mvp_votes").delete().eq("match_id", m.id).eq("voter_id", meId)
    );
    if (ok) track("mvp_voted", { removed: !next });
    setDraft(undefined);
    setBusy(false);
  }

  // Mientras está abierta, la RLS solo le pasa los votos de todos al organizador.
  const tally = new Map<string, number>();
  votes.forEach((v) => tally.set(v.player_id, (tally.get(v.player_id) ?? 0) + 1));
  const top = Math.max(0, ...tally.values());
  const leaders = top ? [...tally].filter(([, n]) => n === top).map(([id]) => id) : [];
  const withAccount = new Set(data.players.filter((x) => x.user_id).map((x) => x.id));
  const voters = rows.map((r) => r.player_id).filter((id) => withAccount.has(id));
  const pending = voters.filter((id) => !votes.some((v) => v.voter_id === id));

  const close = (winner: string) =>
    run(() => supabase.from("matches").update({ mvp_vote: "cerrada", mvp: winner }).eq("id", m.id), `Figura: ${pname(winner)}`);
  const cancel = () =>
    run(() => supabase.from("matches").update({ mvp_vote: null }).eq("id", m.id), "Votación cancelada");

  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/figura/${m.id}`;
  const text = `Votá la figura del partido del ${fmtDate(m.date)}: ${link}`;
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: "Figura del partido", text }); } catch {}
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copiado");
    } catch {
      toast("No se pudo copiar el link.");
    }
  }

  const cands = [...rows].sort((x, y) => x.team.localeCompare(y.team) || pname(x.player_id).localeCompare(pname(y.player_id)));
  const fresh = useFresh(`fig:${m.id}`);

  return (
    <section className={`card waq ${fresh ? "fresh" : ""}`}>
      <div className="card-head">
        <h2>Figura del partido</h2>
        <span className="small muted num">{fmtDate(m.date)} · {m.score_a}–{m.score_b}</span>
      </div>
      <p className="small muted" style={{ margin: "0 0 12px" }}>
        {!canVote
          ? "Votan los que jugaron. Vos no jugaste, así que no votás: ves cómo va y cerrás la votación."
          : pick
            ? `${pick === meId ? "Te votaste a vos" : `Votaste a ${pname(pick)}`}. Podés cambiarlo hasta que se cierre la votación.`
            : "¿Quién fue la figura? Votan los que jugaron, y hasta que se cierre solo el organizador ve cómo va."}
      </p>

      <div className="opts">
        {cands.map((r) => {
          const on = pick === r.player_id;
          return (
            <button key={r.player_id} className="opt" aria-pressed={on} disabled={!canVote} onClick={() => vote(r.player_id)}>
              <span className={`mark radio ${on ? "on" : ""}`} aria-hidden="true">{on ? "✓" : ""}</span>
              <span className="ob">
                <span className="ot">
                  <span className="ol">{pname(r.player_id)}{r.player_id === meId && <span className="small muted"> (vos)</span>}</span>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="small" style={{ color: `var(--${r.team.toLowerCase()})`, fontWeight: 600 }}>
                      {r.team === "A" ? "Verdes" : "Pecheras"}
                    </span>
                    {isAdmin && <span className="oc num">{tally.get(r.player_id) ?? 0}</span>}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="invite-acts" style={{ marginTop: 12 }}>
        <button className="btn ghost" onClick={share} disabled={!origin}>Compartir link</button>
        <button className="btn ghost" onClick={copy} disabled={!origin}>Copiar link</button>
      </div>

      {isAdmin && (
        <div className="hours">
          <p className="small" style={{ margin: "0 0 10px" }}>
            Votaron <b className="num">{voters.length - pending.length}</b> de {voters.length}
            {pending.length > 0 && <span className="muted"> · Faltan: {pending.map(pname).join(", ")}</span>}
          </p>
          {leaders.length === 1 && (
            <button className="btn wide" onClick={() => close(leaders[0])}>
              Cerrar votación · Figura: {pname(leaders[0])}
            </button>
          )}
          {leaders.length > 1 && (
            <>
              <p className="small" style={{ margin: "0 0 8px" }}>
                Empate entre {leaders.map(pname).join(" y ")} con {top} {top === 1 ? "voto" : "votos"}. Elegí vos la figura y se cierra la votación:
              </p>
              <div className="slot-pick">
                {leaders.map((id) => (
                  <button key={id} className="btn ghost" onClick={() => close(id)}>{pname(id)}</button>
                ))}
              </div>
            </>
          )}
          {!leaders.length && <p className="hint">Todavía nadie votó. Compartí el link para que voten.</p>}
          <button className="btn danger-ghost wide" style={{ marginTop: 10 }} onClick={cancel}>Cancelar votación</button>
        </div>
      )}
    </section>
  );
}
