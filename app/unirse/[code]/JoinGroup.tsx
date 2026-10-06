"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";

export default function JoinGroup({
  code,
  groupName,
  suggestedName,
}: {
  code: string;
  groupName: string;
  suggestedName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(suggestedName);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = name.trim().replace(/\s+/g, " ");
    if (!v) { setErr("Escribí tu nombre."); return; }
    setErr("");
    setBusy(true);
    const { data, error } = await createClient().rpc("join_group", { p_code: code, p_player_name: v });
    if (error) {
      setBusy(false);
      setErr(error.message || "No se pudo entrar al grupo. Probá de nuevo.");
      return;
    }
    track("group_joined");
    router.replace(`/?g=${data as string}`);
  }

  return (
    <section className="card">
      <h2>¿Cómo te llaman en {groupName}?</h2>
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: 10 }}>
        <div className="field">
          <label htmlFor="join-name">Tu nombre o apodo</label>
          <p className="hint" id="join-hint">Es el que van a ver todos en la encuesta y en la tabla. Usá el que te conocen en el grupo.</p>
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
            aria-describedby={err ? "join-hint join-err" : "join-hint"}
            onChange={(e) => { setName(e.target.value); if (err) setErr(""); }}
          />
          {err && <p className="err" id="join-err" role="alert">{err}</p>}
        </div>
        <button className="btn full" disabled={busy}>{busy ? "Entrando…" : "Sumarme al grupo"}</button>
      </form>
    </section>
  );
}
