"use client";

import { useState } from "react";
import type { Ctx } from "./ctx";

export default function Plantel({ ctx }: { ctx: Ctx }) {
  const { data, isAdmin, supabase, run, meId } = ctx;
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);
  const act = data.players.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
  const inact = data.players.filter((p) => !p.active).sort((a, b) => a.name.localeCompare(b.name));
  const linked = act.filter((p) => p.user_id).length;

  // Se calcula en vivo para que el formulario diga qué va a pasar antes de tocar "Agregar".
  const existing = new Set(data.players.map((p) => p.name.trim().toLowerCase()));
  const typed = [...new Set(bulk.split(/\n|,/).map((s) => s.trim()).filter(Boolean))];
  const fresh = typed.filter((n) => !existing.has(n.toLowerCase())).slice(0, 60);
  const repeated = typed.length - fresh.length;

  async function add() {
    const names = fresh.map((n) => ({ name: n.slice(0, 40) }));
    if (!names.length) { ctx.toast("No hay nombres nuevos para agregar"); return; }
    setBusy(true);
    const ok = await run(() => supabase.from("players").insert(names),
      `${names.length} jugador${names.length === 1 ? "" : "es"} agregado${names.length === 1 ? "" : "s"}`);
    setBusy(false);
    if (ok) setBulk("");
  }
  const toggle = (id: string, active: boolean) =>
    run(() => supabase.from("players").update({ active: !active }).eq("id", id));
  const unlink = async (id: string) => {
    await run(() => supabase.from("players").update({ user_id: null }).eq("id", id), "Cuenta desvinculada");
    setConfirmUnlink(null);
  };

  return (
    <>
      {isAdmin && (
        <section className="card">
          <h2>Agregar jugadores</h2>
          <div className="field">
            <label htmlFor="bulk">Nombres</label>
            <p className="hint" id="bulk-hint">Uno por línea o separados por coma. Podés pegar la lista entera del grupo de WhatsApp.</p>
            <textarea
              id="bulk" placeholder={"Tomi\nFacu\nEl Ruso"} value={bulk} onChange={(e) => setBulk(e.target.value)}
              autoCapitalize="words" autoComplete="off" spellCheck={false} aria-describedby="bulk-hint bulk-count"
            />
            <p className="hint" id="bulk-count" aria-live="polite">
              {typed.length > 0 && (
                <>
                  <b style={{ color: fresh.length ? "var(--win)" : "var(--muted)" }}>
                    {fresh.length} nuevo{fresh.length === 1 ? "" : "s"}
                  </b>
                  {repeated > 0 && ` · ${repeated} ya ${repeated === 1 ? "está" : "están"} en el plantel`}
                </>
              )}
            </p>
          </div>
          <button className="btn wide" style={{ marginTop: 10 }} disabled={busy || !fresh.length} onClick={add}>
            {busy ? "Agregando…" : fresh.length ? `Agregar ${fresh.length}` : "Agregar"}
          </button>
        </section>
      )}

      <section className="card">
        <h2>Plantel · {act.length}</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          {linked} de {act.length} ya entraron con su cuenta.
          {linked < act.length && " Pasales el link de la página para que se sumen."}
        </p>
        {act.length ? (
          <div className="roster">
            {act.map((p) => (
              <div key={p.id} className="pl">
                <span className="nm">
                  {p.name}
                  {p.id === meId && <span className="small muted"> (vos)</span>}
                </span>
                <span className="acts">
                  {p.user_id ? <span className="badge" title="Ya entró con su cuenta">✓ Cuenta</span> : <span className="small muted">Sin cuenta</span>}
                  {isAdmin && (
                    confirmUnlink === p.id ? (
                      <>
                        <button className="swap" onClick={() => setConfirmUnlink(null)}>No</button>
                        <button className="swap" style={{ color: "var(--loss)" }} onClick={() => unlink(p.id)}>Sí, desvincular</button>
                      </>
                    ) : (
                      <>
                        {p.user_id && <button className="swap" onClick={() => setConfirmUnlink(p.id)} title="Desvincular la cuenta (si alguien eligió el nombre equivocado)">Desvincular</button>}
                        <button className="swap" onClick={() => toggle(p.id, p.active)}>Dar de baja</button>
                      </>
                    )
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Todavía no hay nadie cargado.</p>
        )}
      </section>

      {inact.length > 0 && (
        <section className="card">
          <h2>De baja</h2>
          <p className="muted small">Siguen en el historial pero no aparecen en la encuesta.</p>
          <div className="roster">
            {inact.map((p) => (
              <div key={p.id} className="pl">
                <span className="nm">{p.name}</span>
                {isAdmin && <button className="swap" onClick={() => toggle(p.id, p.active)}>Reincorporar</button>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
