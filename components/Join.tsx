"use client";

import { useState } from "react";
import type { Ctx } from "./ctx";

/** Primera vez: la cuenta logueada crea su jugador eligiendo cómo se llama. */
export default function Join({ ctx, compact = false }: { ctx: Ctx; compact?: boolean }) {
  const { supabase, run, group } = ctx;
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = name.trim().replace(/\s+/g, " ");
    if (!v) { setErr("Escribí tu nombre."); return; }
    setErr("");
    setBusy(true);
    await run(() => supabase.rpc("create_my_player", { p_group: group.id, p_name: v }), `¡Listo, ${v}!`);
    setBusy(false);
  }

  return (
    <section className={`card ${compact ? "" : "empty"}`} style={compact ? undefined : { textAlign: "left" }}>
      <h2>{compact ? "Sumate como jugador" : `¿Cómo te llaman en ${group.name}?`}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        {compact
          ? "Como organizador ya podés usar todo, pero para votar en la encuesta creá tu jugador."
          : "Es el nombre que van a ver todos en la encuesta y en la tabla. Usá el que te conocen en el grupo."}
      </p>
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: 10 }}>
        <div className="field">
          <label htmlFor="join-name">Tu nombre o apodo</label>
          <input
            id="join-name"
            placeholder="El Ruso"
            maxLength={40}
            autoComplete="nickname"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="done"
            value={name}
            aria-invalid={!!err}
            aria-describedby={err ? "join-err" : undefined}
            onChange={(e) => { setName(e.target.value); if (err) setErr(""); }}
          />
          {err && <p className="err" id="join-err" role="alert">{err}</p>}
        </div>
        <button className="btn full" disabled={busy}>{busy ? "Guardando…" : "Entrar"}</button>
      </form>
    </section>
  );
}
