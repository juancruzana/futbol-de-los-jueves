"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

const clean = (v: string) => v.trim().replace(/\s+/g, " ");

/** Crear un grupo nuevo: quien lo crea queda como organizador y con su jugador. */
export default function NuevoGrupo({
  supabase,
  first,
  suggestedName,
  onCreated,
  onCancel,
}: {
  supabase: SupabaseClient;
  /** no tiene ningún grupo todavía */
  first: boolean;
  /** nombre o apodo para proponer (el que ya usa en otro grupo) */
  suggestedName: string;
  onCreated: (groupId: string) => void;
  onCancel?: () => void;
}) {
  const [group, setGroup] = useState("");
  const [name, setName] = useState(suggestedName);
  const [err, setErr] = useState<{ group?: string; name?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const g = clean(group), n = clean(name);
    const next = { group: g ? undefined : "Ponele un nombre al grupo.", name: n ? undefined : "Escribí tu nombre." };
    if (next.group || next.name) { setErr(next); return; }
    setErr({});
    setBusy(true);
    const { data, error } = await supabase.rpc("create_group", { p_name: g, p_player_name: n });
    setBusy(false);
    if (error) { setErr({ form: error.message || "No se pudo crear el grupo. Probá de nuevo." }); return; }
    onCreated(data as string);
  }

  return (
    <>
      {first && (
        <section className="card">
          <h2>¿Te invitaron a un grupo?</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Abrí el link de invitación que te pasaron por WhatsApp y entrás directo.
            Si no, armá tu propio grupo acá abajo.
          </p>
        </section>
      )}
      <section className="card">
        <h2>{first ? "Armá tu grupo" : "Crear grupo nuevo"}</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Cada grupo tiene su plantel, sus partidos y su tabla. Vos quedás como organizador
          y después invitás al resto con un link.
        </p>
        <form onSubmit={submit} noValidate style={{ display: "grid", gap: 12 }}>
          <div className="field">
            <label htmlFor="ng-group">Nombre del grupo</label>
            <input
              id="ng-group"
              placeholder="Fútbol de los martes"
              maxLength={40}
              autoCapitalize="sentences"
              enterKeyHint="next"
              value={group}
              aria-invalid={!!err.group}
              aria-describedby={err.group ? "ng-group-err" : undefined}
              onChange={(e) => { setGroup(e.target.value); if (err.group) setErr({ ...err, group: undefined }); }}
            />
            {err.group && <p className="err" id="ng-group-err" role="alert">{err.group}</p>}
          </div>
          <div className="field">
            <label htmlFor="ng-name">Tu nombre o apodo en este grupo</label>
            <input
              id="ng-name"
              placeholder="El Ruso"
              maxLength={40}
              autoComplete="nickname"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="done"
              value={name}
              aria-invalid={!!err.name}
              aria-describedby={err.name ? "ng-name-err" : undefined}
              onChange={(e) => { setName(e.target.value); if (err.name) setErr({ ...err, name: undefined }); }}
            />
            {err.name && <p className="err" id="ng-name-err" role="alert">{err.name}</p>}
          </div>
          {err.form && <p className="err" role="alert">{err.form}</p>}
          <button className="btn full" disabled={busy}>{busy ? "Creando…" : "Crear grupo"}</button>
          {onCancel && (
            <button type="button" className="btn ghost full" onClick={onCancel}>Cancelar</button>
          )}
        </form>
      </section>
    </>
  );
}
