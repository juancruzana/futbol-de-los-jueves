"use client";

import { useState } from "react";
import type { Ctx } from "./ctx";

/** Configuración del perfil: cada uno edita los datos de su propio jugador. */
export default function Perfil({ ctx, email }: { ctx: Ctx; email: string }) {
  const { data, supabase, run, meId, group } = ctx;
  const me = data.players.find((p) => p.id === meId) ?? null;
  const [name, setName] = useState(me?.name ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const clean = name.trim().replace(/\s+/g, " ");
  const changed = !!me && clean !== me.name;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clean) { setErr("Escribí tu nombre."); return; }
    setErr("");
    setBusy(true);
    const ok = await run(() => supabase.rpc("update_my_profile", { p_group: group.id, p_name: clean }), "Perfil actualizado");
    setBusy(false);
    if (ok) setName(clean);
  }

  return (
    <>
      {me && (
        <section className="card">
          <h2>Mi perfil en {group.name}</h2>
          <form onSubmit={save} noValidate style={{ display: "grid", gap: 10 }}>
            <div className="field">
              <label htmlFor="perfil-name">Nombre o apodo</label>
              <p className="hint" id="perfil-hint">Es como te ven todos en la encuesta, la tabla y el historial de este grupo. En cada grupo podés usar un nombre distinto.</p>
              <input
                id="perfil-name"
                maxLength={40}
                autoComplete="nickname"
                autoCapitalize="words"
                spellCheck={false}
                enterKeyHint="done"
                value={name}
                aria-invalid={!!err}
                aria-describedby={err ? "perfil-hint perfil-err" : "perfil-hint"}
                onChange={(e) => { setName(e.target.value); if (err) setErr(""); }}
              />
              {err && <p className="err" id="perfil-err" role="alert">{err}</p>}
            </div>
            <button className="btn full" disabled={busy || !changed}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
          </form>
        </section>
      )}

      <section className="card">
        <h2>Cuenta</h2>
        <div className="field">
          <span className="lbl">Entrás con Google</span>
          <span style={{ overflowWrap: "anywhere" }}>{email}</span>
        </div>
        <form action="/auth/signout" method="post" style={{ marginTop: 14 }}>
          <button className="btn ghost full" type="submit">Cerrar sesión</button>
        </form>
      </section>
    </>
  );
}
