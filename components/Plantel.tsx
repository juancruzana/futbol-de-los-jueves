"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import type { Ctx } from "./ctx";

/** Link de invitación: cualquiera del grupo lo comparte; el organizador puede cambiarlo. */
function Invite({ ctx }: { ctx: Ctx }) {
  const { group, isAdmin, supabase, run, toast } = ctx;
  const [origin, setOrigin] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const link = `${origin}/unirse/${group.invite_code}`;
  const text = `Sumate a "${group.name}" para votar los partidos y ver la tabla: ${link}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copiado");
      track("invite_shared", { method: "copy" });
    } catch {
      toast("No se pudo copiar. Mantené apretado el link para copiarlo.");
    }
  }
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: group.name, text });
        track("invite_shared", { method: "share" });
      } catch {}
      return;
    }
    track("invite_shared", { method: "whatsapp" });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }
  async function reset() {
    await run(() => supabase.rpc("reset_invite", { p_group: group.id }), "Link nuevo listo. El anterior ya no anda.");
    setConfirmReset(false);
  }

  return (
    <section className="card">
      <h2>Invitá al grupo</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Pasá este link por WhatsApp. El que lo abre entra con su Google, elige su nombre y ya queda en el plantel.
      </p>
      <div className="invite">
        <input readOnly aria-label="Link de invitación" value={origin ? link : ""} onFocus={(e) => e.target.select()} />
        <div className="invite-acts">
          <button className="btn" onClick={share} disabled={!origin}>Compartir</button>
          <button className="btn ghost" onClick={copy} disabled={!origin}>Copiar link</button>
        </div>
      </div>
      {isAdmin && (
        <div style={{ marginTop: 12 }}>
          {confirmReset ? (
            <div className="confirm">
              <p className="small">¿Cambiar el link? El de ahora deja de andar (los que ya están siguen adentro).</p>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>No</button>
              <button className="btn danger" onClick={reset}>Sí, cambiar</button>
            </div>
          ) : (
            <button className="btn danger-ghost small" onClick={() => setConfirmReset(true)}>Cambiar link</button>
          )}
        </div>
      )}
    </section>
  );
}

/** Nombre del grupo: solo el organizador lo cambia. */
function GroupName({ ctx }: { ctx: Ctx }) {
  const { group, supabase, run } = ctx;
  const [name, setName] = useState(group.name);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const clean = name.trim().replace(/\s+/g, " ");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clean) { setErr("Ponele un nombre al grupo."); return; }
    setErr("");
    setBusy(true);
    const ok = await run(() => supabase.from("groups").update({ name: clean }).eq("id", group.id), "Nombre actualizado");
    setBusy(false);
    if (ok) setName(clean);
  }

  return (
    <section className="card">
      <h2>Grupo</h2>
      <form onSubmit={save} noValidate className="field">
        <label htmlFor="group-name">Nombre del grupo</label>
        <div className="combo">
          <input
            id="group-name"
            maxLength={40}
            autoCapitalize="sentences"
            enterKeyHint="done"
            value={name}
            aria-invalid={!!err}
            aria-describedby={err ? "group-name-err" : undefined}
            onChange={(e) => { setName(e.target.value); if (err) setErr(""); }}
          />
          <button className="btn ghost" disabled={busy || clean === group.name}>Guardar</button>
        </div>
        {err && <p className="err" id="group-name-err" role="alert">{err}</p>}
      </form>
    </section>
  );
}

export default function Plantel({ ctx }: { ctx: Ctx }) {
  const { data, group, isAdmin, supabase, run, meId, userId } = ctx;
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const act = data.players.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
  const inact = data.players.filter((p) => !p.active).sort((a, b) => a.name.localeCompare(b.name));
  const role = new Map(data.members.map((m) => [m.user_id, m.role]));
  const admins = data.members.filter((m) => m.role === "admin").length;
  const played = new Set(data.matches.filter((m) => m.status === "jugado").map((m) => m.id));

  const toggle = (id: string, active: boolean) =>
    run(() => supabase.from("players").update({ active: !active }).eq("id", id));
  const setRole = (user: string, next: "admin" | "jugador", who: string) =>
    run(
      () => supabase.rpc("set_member_role", { p_group: group.id, p_user: user, p_role: next }),
      next === "admin" ? `${who} ahora es organizador` : `${who} ya no es organizador`
    );
  async function remove(id: string, who: string) {
    await run(() => supabase.rpc("remove_player", { p_player: id }), `${who} ya no está en el plantel`);
    setConfirmDel(null);
  }

  return (
    <>
      <Invite ctx={ctx} key={`inv-${group.id}`} />

      <section className="card">
        <h2>Plantel · {act.length}</h2>
        {act.length ? (
          <div className="roster">
            {act.map((p) => {
              const org = !!p.user_id && role.get(p.user_id) === "admin";
              const isMe = p.id === meId;
              return (
                <div key={p.id} className="pl">
                  <span className="nm">
                    <span className="pn">{p.name}</span>
                    {isMe && <span className="small muted">(vos)</span>}
                    {org && <span className="badge">Organizador</span>}
                  </span>
                  <span className="acts">
                    {!p.user_id && <span className="small muted" title="Jugador sin cuenta">Sin cuenta</span>}
                    {isAdmin && p.user_id && role.has(p.user_id) && (org ? admins > 1 : true) && (
                      <button className="swap" onClick={() => setRole(p.user_id!, org ? "jugador" : "admin", isMe ? "Vos" : p.name)}>
                        {org ? (p.user_id === userId ? "Dejar de organizar" : "Quitar organizador") : "Hacer organizador"}
                      </button>
                    )}
                    {isAdmin && <button className="swap" onClick={() => toggle(p.id, p.active)}>Dar de baja</button>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">Todavía no entró nadie. Pasales el link de invitación.</p>
        )}
        {isAdmin && act.length > 0 && (
          <p className="hint" style={{ marginTop: 12 }}>Para eliminar a alguien, primero dalo de baja.</p>
        )}
      </section>

      {inact.length > 0 && (
        <section className="card">
          <h2>De baja</h2>
          <p className="muted small">Siguen en el historial pero no aparecen en la encuesta.</p>
          <div className="roster">
            {inact.map((p) => {
              const pj = data.lineups.filter((l) => l.player_id === p.id && played.has(l.match_id)).length;
              return (
                <div key={p.id} className="pl">
                  <span className="nm"><span className="pn">{p.name}</span></span>
                  {isAdmin && (confirmDel === p.id ? (
                    <div className="confirm">
                      <p className="small">
                        ¿Eliminar a {p.name} para siempre?
                        {pj > 0 && ` Se borra de la tabla y de ${pj === 1 ? "el partido que jugó" : `los ${pj} partidos que jugó`}.`}
                        {p.user_id && " También sale del grupo."} No se puede deshacer.
                      </p>
                      <button className="btn ghost" onClick={() => setConfirmDel(null)}>No</button>
                      <button className="btn danger" onClick={() => remove(p.id, p.name)}>Sí, eliminar</button>
                    </div>
                  ) : (
                    <span className="acts">
                      <button className="swap" onClick={() => toggle(p.id, p.active)}>Reincorporar</button>
                      {p.id !== meId && (
                        <button className="swap danger" onClick={() => setConfirmDel(p.id)}>Eliminar</button>
                      )}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isAdmin && <GroupName ctx={ctx} key={`name-${group.id}-${group.name}`} />}
    </>
  );
}
