"use client";

import { useEffect, useRef, useState } from "react";
import {
  FORMATS, balanceTeams, computeStats, dayLabel, fmtDate, hs, openMatch, pollSummary, sortSlots,
} from "@/lib/stats";
import type { Format, Lineup, Match } from "@/lib/types";
import { track } from "@/lib/analytics";
import type { Ctx } from "./ctx";
import Convocatoria, { Summary, slotsLabel } from "./Convocatoria";
import { useFresh } from "./fresh";

/* ---------- Encuesta personal: se elige, se confirma y después se mira cómo va ---------- */
type Vote = { going: boolean; hours: string[] } | null;

const sameVote = (a: Vote, b: Vote) =>
  a === b || (!!a && !!b && a.going === b.going && a.hours.join() === b.hours.join());

function Option(props: {
  id: string; on: boolean; kind: "radio" | "check"; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  const { id, on, kind, disabled, onClick, children } = props;
  return (
    <button className="opt" id={id} disabled={disabled} aria-pressed={on} onClick={onClick}>
      <span className={`mark ${kind} ${on ? "on" : ""}`} aria-hidden="true">{on ? "✓" : ""}</span>
      {children}
    </button>
  );
}

/** Una hora de la encuesta: cuántos confirmaron que pueden contra los que hacen falta, y cuál destaca.
 *  Se ve igual al elegir los horarios y en "Cómo va". */
function SlotDemand({ m, p, s }: { m: Match; p: ReturnType<typeof pollSummary>; s: string }) {
  const need = FORMATS[m.format] ?? 22;
  const n = p.bySlot[s].length;
  const top = Math.max(...p.slots.map((x) => p.bySlot[x].length));
  const tag = m.time === s ? "Confirmado" : !m.time && n > 0 && n === top ? "Más votado" : "";
  return (
    <span className="ob">
      <span className="ot">
        <span className="ol slot-l">{hs(s)}{tag && <span className="badge">{tag}</span>}</span>
        <span className="oc num">{n}<span className="muted">/{need}</span>{n >= need && " ✓"}</span>
      </span>
      <span className="obar"><i style={{ width: `${Math.min(100, (n / need) * 100)}%` }} /></span>
    </span>
  );
}

function Poll({ ctx, m }: { ctx: Ctx; m: Match }) {
  const { data, supabase, run, isAdmin, meId, pname } = ctx;
  const p = pollSummary(m, data);
  const need = FORMATS[m.format] ?? 22;
  const [voterSel, setVoterSel] = useState<string>("");
  const voter = isAdmin && voterSel ? voterSel : meId;
  const forMe = voter === meId;

  // Sin los horarios que el organizador sacó de la encuesta: esos ya no cuentan.
  const clean = (v: Vote): Vote => v && { going: v.going, hours: v.going ? v.hours.filter((s) => p.slots.includes(s)) : [] };
  const row = voter ? p.votes.get(voter) : undefined;
  const saved = clean(row ? { going: row.going, hours: row.hours } : null);
  // Lo que se va tocando no se guarda hasta confirmar (undefined = no se está cambiando nada).
  const [draft, setDraft] = useState<Vote | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const editing = draft !== undefined || !saved;
  const sel = draft === undefined ? saved : clean(draft);
  const valid = !!sel && (!sel.going || sel.hours.length > 0);

  const toy = () => setDraft(sel?.going ? null : { going: true, hours: sel?.hours ?? [] });
  const notoy = () => setDraft(sel && !sel.going ? null : { going: false, hours: [] });
  const hour = (s: string) => {
    const cur = sel?.going ? sel.hours : [];
    setDraft({ going: true, hours: cur.includes(s) ? cur.filter((x) => x !== s) : sortSlots([...cur, s]) });
  };

  async function confirm() {
    if (!voter) return;
    if (sameVote(sel, saved)) { setDraft(undefined); return; }
    setBusy(true);
    const de = forMe ? "" : ` de ${pname(voter)}`;
    const ok = await run(
      () => sel
        ? supabase.from("availability").upsert({
            match_id: m.id, player_id: voter, going: sel.going, hours: sel.hours,
            updated_at: new Date().toISOString(),
          })
        : supabase.from("availability").delete().eq("match_id", m.id).eq("player_id", voter),
      sel ? `Voto${de} confirmado` : `Voto${de} borrado`
    );
    setBusy(false);
    if (!ok) return;
    track("availability_voted", { going: sel ? sel.going : null, for_other: !forMe, changed: !!saved });
    setDraft(undefined);
  }

  // El link abre la app en esta encuesta (app/convocatoria/[id]). Sin la hoja de compartir del sistema, va por WhatsApp.
  async function share() {
    const link = `${window.location.origin}/convocatoria/${m.id}`;
    const text = m.time
      ? `¿Jugás el ${fmtDate(m.date)} a las ${hs(m.time)}? ${m.format}. Votá acá: ${link}`
      : `¿Jugás el ${fmtDate(m.date)}? ${m.format} · ${slotsLabel(p.slots)}. Votá acá: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Encuesta del partido", text });
        track("poll_shared", { method: "share" });
      } catch {}
      return;
    }
    track("poll_shared", { method: "whatsapp" });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  const disabled = !voter || busy;
  const fresh = useFresh(`poll:${m.id}`);

  return (
    <section className={`card waq ${fresh ? "fresh" : ""}`}>
      <div className="card-head">
        <h2>{dayLabel(m.date)}</h2>
        <button className="btn ghost" id="share-poll" onClick={share}>Compartir</button>
      </div>
      <p className="small muted" style={{ margin: "0 0 12px" }}>
        ¿Jugás? · {m.format}, hacen falta {need}
        {m.time && <> · Horario confirmado: <b style={{ color: "var(--ink)" }}>{hs(m.time)}</b></>}
      </p>

      {isAdmin ? (
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="voter">Votando como</label>
          <select id="voter" value={voterSel} disabled={busy} onChange={(e) => { setVoterSel(e.target.value); setDraft(undefined); }}>
            <option value="">{meId ? `Yo (${pname(meId)})` : "Elegí un jugador"}</option>
            {p.active
              .filter((x) => x.id !== meId)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((x) => (
                <option key={x.id} value={x.id}>{x.name}{p.votes.has(x.id) ? " ✓" : ""}</option>
              ))}
          </select>
        </div>
      ) : editing && (
        <p className="small muted" style={{ margin: "0 0 10px" }}>
          Votando como <b style={{ color: "var(--ink)" }}>{pname(voter)}</b>
        </p>
      )}

      {!editing && saved ? (
        <div className="myvote">
          <span className="mark radio on" aria-hidden="true">✓</span>
          <span className="mv">
            <span className="k">{forMe ? "Tu voto" : `Voto de ${pname(voter)}`}</span>
            <span className="ol">{saved.going ? "Toy" : "No toy"}</span>
            {saved.going && (saved.hours.length ? (
              <span className="small">{slotsLabel(saved.hours)}</span>
            ) : (
              <span className="small" style={{ color: "var(--hot)" }}>Sin horario, así no cuenta: tocá Cambiar y marcá alguno.</span>
            ))}
          </span>
          <button className="btn ghost" onClick={() => setDraft(saved)}>Cambiar</button>
        </div>
      ) : (
        <>
          <div className="opts">
            <Option id="opt-toy" on={!!sel?.going} kind="radio" disabled={disabled} onClick={toy}>
              <span className="ol">Toy</span>
            </Option>
            <Option id="opt-notoy" on={!!sel && !sel.going} kind="radio" disabled={disabled} onClick={notoy}>
              <span className="ol">No toy</span>
            </Option>
          </div>
          {sel?.going && (
            <div className="hours">
              <p style={{ margin: "0 0 2px" }}><b>¿A qué hora podés?</b></p>
              <p className="small muted" style={{ margin: "0 0 8px" }}>Elegí uno o más. Al lado, cuántos ya confirmaron cada hora.</p>
              <div className="opts">
                {p.slots.map((s) => (
                  <Option
                    key={s} id={`opt-${s.replace(":", "")}`} on={sel.hours.includes(s)} kind="check"
                    disabled={disabled} onClick={() => hour(s)}
                  >
                    <SlotDemand m={m} p={p} s={s} />
                  </Option>
                ))}
              </div>
            </div>
          )}
          {/* Hasta acá nada se guardó: recién cuenta al confirmar. Sin elegir nada, "Borrar voto" saca el que había. */}
          <div className="sticky-cta">
            {sel?.going && !sel.hours.length && <p className="hint">Marcá al menos un horario para confirmar.</p>}
            {saved ? (
              <div className="confirm">
                <button className="btn ghost" disabled={busy} onClick={() => setDraft(undefined)}>Cancelar</button>
                {sel ? (
                  <button className="btn" id="confirm-vote" disabled={busy || !valid} onClick={confirm}>
                    {busy ? "Guardando…" : "Confirmar voto"}
                  </button>
                ) : (
                  <button className="btn danger" disabled={busy} onClick={confirm}>{busy ? "Borrando…" : "Borrar voto"}</button>
                )}
              </div>
            ) : (
              <button className="btn" id="confirm-vote" disabled={disabled || !valid} onClick={confirm}>
                {busy ? "Guardando…" : "Confirmar voto"}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/* ---------- Cómo va: la encuesta en vivo ---------- */
/** Ids cuyo valor cambió mientras se mira (lo que ya estaba al abrir no cuenta), con cuándo cambió, para resaltarlos un rato. */
function useJustChanged(sigs: Map<string, string>, ms = 4000) {
  const key = [...sigs].map(([id, s]) => `${id}=${s}`).sort().join("|");
  const prev = useRef<Map<string, string> | null>(null);
  const [hot, setHot] = useState<Map<string, number>>(() => new Map());
  useEffect(() => {
    const before = prev.current;
    prev.current = sigs;
    if (!before) return;
    const at = Date.now();
    const changed = [...new Set([...before.keys(), ...sigs.keys()])].filter((id) => before.get(id) !== sigs.get(id));
    if (changed.length) setHot((h) => new Map([...h, ...changed.map((id) => [id, at] as const)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!hot.size) return;
    const wait = Math.min(...hot.values()) + ms - Date.now();
    const t = setTimeout(() => setHot((h) => new Map([...h].filter(([, at]) => Date.now() - at < ms))), Math.max(0, wait) + 50);
    return () => clearTimeout(t);
  }, [hot, ms]);
  return hot;
}

function Board({ ctx, m }: { ctx: Ctx; m: Match }) {
  const { data, meId, pname, live } = ctx;
  const p = pollSummary(m, data);
  // Dijeron que juegan pero no tienen ningún horario que siga en la encuesta: no suman en ninguno.
  const loose = p.toy.filter((id) => !p.slots.some((s) => p.bySlot[s].includes(id)));
  const hot = useJustChanged(new Map([...p.votes].map(([id, v]) => [id, v.going ? `toy ${v.hours.join()}` : "notoy"])));

  const names = (ids: string[], off = false) => ids.length > 0 && (
    <div className={`names ${off ? "off" : ""}`}>
      {ids.map((id) => {
        const at = hot.get(id);
        // La key cambia con cada cambio: el nombre se vuelve a montar y la animación arranca de nuevo.
        return (
          <span key={`${id}:${at ?? ""}`} className={`${id === meId ? "me" : ""} ${at ? "new" : ""}`}>
            {pname(id)}{id === meId && " (vos)"}
          </span>
        );
      })}
    </div>
  );
  const rowOf = (label: string, ids: string[], off = false) => (
    <div className="trow">
      <div className="ot">
        <span className={`ol ${off ? "muted" : ""}`}>{label}</span>
        <span className={`oc num ${off ? "muted" : ""}`}>{ids.length}</span>
      </div>
      {names(ids, off)}
    </div>
  );

  return (
    <section className="card">
      <div className="card-head">
        <h2>Cómo va</h2>
        <span className={`live ${live ? "" : "off"}`} role="status">{live ? "En vivo" : "Conectando…"}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Respondieron <b className="num" style={{ color: "var(--ink)" }}>{p.toy.length + p.notoy.length}</b> de {p.active.length}
      </p>
      <div className="tally">
        {p.slots.map((s) => (
          <div key={s} className={`trow ${m.time === s ? "pick" : ""}`}>
            <SlotDemand m={m} p={p} s={s} />
            {names(p.bySlot[s])}
          </div>
        ))}
        {loose.length > 0 && rowOf("Toy, sin horario", loose)}
        {rowOf("No toy", p.notoy)}
        {rowOf("Sin responder", p.pending, true)}
      </div>
    </section>
  );
}

/* ---------- Panel del organizador ---------- */
const FORMAT_LIST = Object.keys(FORMATS) as Format[];

function Organizer({ ctx, m }: { ctx: Ctx; m: Match }) {
  const { data, supabase, run, pname } = ctx;
  const p = pollSummary(m, data);
  const need = FORMATS[m.format] ?? 22;
  const maxH = Math.max(0, ...p.slots.map((s) => p.bySlot[s].length));
  const [editing, setEditing] = useState(false);
  // Antes de cerrar: el horario elegido y lo que todavía se puede ajustar. Se guarda todo junto al confirmar.
  const [pick, setPick] = useState<string | null>(null);
  const [date, setDate] = useState(m.date);
  const [format, setFormat] = useState<Format>(m.format);
  const [busy, setBusy] = useState(false);

  if (editing) return <Convocatoria ctx={ctx} m={m} onClose={() => setEditing(false)} />;

  const going = pick ? p.bySlot[pick] ?? [] : [];
  const needAt = FORMATS[format] ?? 22;
  // El formato más grande que se llena con los que pueden a esa hora.
  const fit = FORMAT_LIST.filter((f) => FORMATS[f] <= going.length).pop();

  function choose(s: string) {
    setPick(s === pick ? null : s);
    setDate(m.date);
    setFormat(m.format);
  }
  async function close() {
    if (!pick) return;
    setBusy(true);
    const ok = await run(async () => {
      const del = await supabase.from("lineups").delete().eq("match_id", m.id);
      if (del.error) return del;
      return supabase.from("matches").update({ time: pick, date, format }).eq("id", m.id);
    }, `Encuesta cerrada · ${hs(pick)}`);
    setBusy(false);
    if (ok) {
      track("poll_closed", { edited: date !== m.date || format !== m.format });
      setPick(null);
    }
  }
  async function reopen() {
    await run(async () => {
      const del = await supabase.from("lineups").delete().eq("match_id", m.id);
      if (del.error) return del;
      return supabase.from("matches").update({ time: null }).eq("id", m.id);
    }, "Encuesta reabierta");
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Organizador</h2>
        <button className="btn ghost" onClick={() => { setPick(null); setEditing(true); }}>Editar encuesta</button>
      </div>
      <Summary d={{ date: m.date, slots: p.slots, format: m.format }} />

      {m.time ? (
        <>
          <h3 className="sub">Encuesta cerrada</h3>
          <div className="combo" style={{ alignItems: "center" }}>
            <span>Juegan a las <b>{hs(m.time)}</b></span>
            <button className="btn ghost" onClick={reopen}>Reabrir</button>
          </div>
        </>
      ) : (
        <>
          <h3 className="sub">Cerrar encuesta</h3>
          <p className="hint" style={{ marginBottom: 8 }}>
            Elegí el horario cuando haya suficientes votos. Juegan los que marcaron esa hora.
          </p>
          <div className="slot-pick">
            {p.slots.map((s) => {
              const n = p.bySlot[s].length;
              const on = pick ? pick === s : !!n && n === maxH;
              return (
                <button key={s} className={`btn ${on ? "" : "ghost"}`} aria-pressed={pick === s} disabled={!n} onClick={() => choose(s)}>
                  {hs(s)} · {n}{n >= need ? " ✓" : ""}
                </button>
              );
            })}
          </div>
          {pick ? (
            <div className="closebox">
              <p style={{ margin: 0 }}>
                <b>Cerrar a las {hs(pick)}</b> · pueden {going.length}. Último momento para ajustar:
              </p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="cl-date">Día</label>
                  <input type="date" id="cl-date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="cl-format">Formato</label>
                  <select id="cl-format" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                    {FORMAT_LIST.map((f) => <option key={f} value={f}>{f} · {FORMATS[f]} jug.</option>)}
                  </select>
                </div>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="small">
                  {going.length >= needAt ? `Alcanza para ${format} ✓` : `Faltan ${needAt - going.length} para ${format}.`}
                </span>
                {going.length < needAt && fit && (
                  <button className="btn ghost" onClick={() => setFormat(fit)}>Pasar a {fit}</button>
                )}
              </div>
              <p className="small muted" style={{ margin: 0 }}>Juegan: {going.map(pname).join(", ")}</p>
              <div className="confirm">
                <button className="btn ghost" onClick={() => setPick(null)}>Volver</button>
                <button className="btn" disabled={busy} onClick={close}>Cerrar encuesta</button>
              </div>
            </div>
          ) : (
            p.best && p.bySlot[p.best].length < need && (
              <p className="small" style={{ margin: "10px 0 0" }}>
                Al mejor horario le faltan {need - p.bySlot[p.best].length} para {m.format}.
              </p>
            )
          )}
        </>
      )}
    </section>
  );
}

/* ---------- Equipos ---------- */
function Teams({ ctx, m }: { ctx: Ctx; m: Match }) {
  const { data, supabase, run, isAdmin, pname } = ctx;
  const p = pollSummary(m, data);
  const convocados = p.bySlot[m.time!] ?? [];
  const rows = data.lineups.filter((l) => l.match_id === m.id);
  const A = rows.filter((r) => r.team === "A").map((r) => r.player_id);
  const B = rows.filter((r) => r.team === "B").map((r) => r.player_id);
  const inTeam = new Set([...A, ...B]);
  const sinEquipo = convocados.filter((id) => !inTeam.has(id));
  const extrasPosibles = p.active.filter((x) => !inTeam.has(x.id) && !convocados.includes(x.id));
  const { list } = computeStats(data);
  const byId = new Map(list.map((s) => [s.id, s]));
  const [extra, setExtra] = useState("");

  async function balance() {
    const ids = [...new Set([...convocados, ...inTeam])];
    if (ids.length < 2) { ctx.toast("Necesitás al menos 2 confirmados"); return; }
    const t = balanceTeams(ids, list);
    const prevGoals = new Map(rows.map((r) => [r.player_id, r.goals]));
    const next: Lineup[] = [
      ...t.A.map((id) => ({ match_id: m.id, player_id: id, team: "A" as const, goals: prevGoals.get(id) ?? 0 })),
      ...t.B.map((id) => ({ match_id: m.id, player_id: id, team: "B" as const, goals: prevGoals.get(id) ?? 0 })),
    ];
    const ok = await run(async () => {
      const del = await supabase.from("lineups").delete().eq("match_id", m.id);
      if (del.error) return del;
      return supabase.from("lineups").insert(next);
    }, "Equipos armados");
    if (ok) track("teams_generated", { players: ids.length });
  }
  const swap = (id: string, team: "A" | "B") =>
    run(() => supabase.from("lineups").update({ team: team === "A" ? "B" : "A" }).eq("match_id", m.id).eq("player_id", id));
  const remove = (id: string) =>
    run(() => supabase.from("lineups").delete().eq("match_id", m.id).eq("player_id", id));
  const add = (id: string) =>
    run(() => supabase.from("lineups").insert({ match_id: m.id, player_id: id, team: A.length <= B.length ? "A" : "B" }), "Agregado");

  const Col = ({ t, ids, label }: { t: "A" | "B"; ids: string[]; label: string }) => (
    <div className={`team ${t}`}>
      <h3>{label}<span className="small num muted">{ids.length} jug.</span></h3>
      <ul>
        {ids.map((id) => {
          const s = byId.get(id);
          return (
            <li key={id}>
              <span className="nm">{pname(id)}</span>
              <span className="acts">
                <span className="small muted num">{s?.ppm != null ? `${s.ppm.toFixed(1)} pts/PJ` : "nuevo"}</span>
                {isAdmin && (
                  <>
                    <button className="swap icon" onClick={() => swap(id, t)} aria-label={`Pasar a ${pname(id)} al otro equipo`}>⇄</button>
                    <button className="swap icon" onClick={() => remove(id)} aria-label={`Sacar a ${pname(id)}`}>×</button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <section className="card">
      <div className="card-head">
        <h2>Equipos</h2>
        <span className="small muted num">{convocados.length} confirmados</span>
      </div>
      <p className="muted small">
        Juegan los que pueden a las {hs(m.time)}. Los equipos se reparten según puntos por partido para que queden parejos.
      </p>
      {isAdmin && !rows.length && (
        <button className="btn wide" style={{ marginBottom: 12 }} onClick={balance}>Armar equipos parejos</button>
      )}
      {rows.length ? (
        <div className="teams">
          <Col t="A" ids={A} label="Verdes" />
          <Col t="B" ids={B} label="Pecheras" />
        </div>
      ) : (
        <p className="muted">
          {convocados.length ? `Confirmados: ${convocados.map(pname).join(", ")}.` : "Nadie marcó ese horario todavía."}
        </p>
      )}
      {rows.length > 0 && sinEquipo.length > 0 && (
        <p className="small" style={{ margin: "10px 0 0" }}>
          Confirmados sin equipo: {sinEquipo.map(pname).join(", ")}.{isAdmin && " Tocá “Rearmar parejos” para sumarlos."}
        </p>
      )}
      {isAdmin && rows.length > 0 && extrasPosibles.length > 0 && (
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="extra">Sumar a alguien más</label>
          <div className="combo">
            <select id="extra" value={extra} onChange={(e) => setExtra(e.target.value)}>
              <option value="">Elegí un jugador…</option>
              {extrasPosibles.sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button className="btn ghost" disabled={!extra} onClick={() => { add(extra); setExtra(""); }}>Sumar</button>
          </div>
        </div>
      )}
      {isAdmin && rows.length > 0 && (
        <button className="btn ghost wide" style={{ marginTop: 12 }} onClick={balance}>Rearmar parejos</button>
      )}
    </section>
  );
}

/* ---------- Resultado ---------- */
// Teclado numérico para tipear el marcador directo; los −/+ quedan para ajustar.
export function ScoreSide({ t, label, v, set }: { t: "A" | "B"; label: string; v: number; set: (n: number) => void }) {
  return (
    <div className={`side ${t}`}>
      <label className="lbl" htmlFor={`score-${t}`} style={{ color: `var(--${t.toLowerCase()})` }}>{label}</label>
      <input
        id={`score-${t}`} className="num" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
        value={v} onFocus={(e) => e.target.select()}
        onChange={(e) => set(Math.min(99, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0))}
      />
      <span className="step">
        <button onClick={() => set(Math.max(0, v - 1))} aria-label={`Restar gol ${label}`}>−</button>
        <button onClick={() => set(Math.min(99, v + 1))} aria-label={`Sumar gol ${label}`}>+</button>
      </span>
    </div>
  );
}

function ResultForm({ ctx, m }: { ctx: Ctx; m: Match }) {
  const { data, supabase, run, pname, setTab } = ctx;
  const rows = data.lineups.filter((l) => l.match_id === m.id);
  const A = rows.filter((r) => r.team === "A").map((r) => r.player_id);
  const B = rows.filter((r) => r.team === "B").map((r) => r.player_id);
  const [a, setA] = useState(m.score_a);
  const [b, setB] = useState(m.score_b);
  const [goals, setGoals] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.player_id, r.goals])));
  const [mvp, setMvp] = useState<string | null>(m.mvp);
  const [busy, setBusy] = useState(false);

  // Si cambian los equipos, conservo lo cargado y sumo a los nuevos en 0.
  const key = rows.map((r) => r.player_id).sort().join();
  useEffect(() => {
    setGoals((g) => Object.fromEntries(rows.map((r) => [r.player_id, g[r.player_id] ?? r.goals])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ga = A.reduce((s, id) => s + (goals[id] || 0), 0);
  const gb = B.reduce((s, id) => s + (goals[id] || 0), 0);

  function bumpGoal(id: string, d: number) {
    const next = { ...goals, [id]: Math.max(0, (goals[id] || 0) + d) };
    setGoals(next);
    const inA = A.includes(id);
    const tot = (inA ? A : B).reduce((s, x) => s + (next[x] || 0), 0);
    if (inA && tot > a) setA(tot);
    if (!inA && tot > b) setB(tot);
  }

  async function finish() {
    setBusy(true);
    const ok = await run(async () => {
      const up = await supabase.from("lineups").upsert(
        rows.map((r) => ({ match_id: m.id, player_id: r.player_id, team: r.team, goals: goals[r.player_id] || 0 }))
      );
      if (up.error) return up;
      return supabase.from("matches").update({
        score_a: a, score_b: b, mvp, status: "jugado", played_at: m.played_at ?? new Date().toISOString(),
      }).eq("id", m.id);
    }, "Resultado guardado");
    setBusy(false);
    if (ok) {
      track("result_saved");
      setTab("tabla");
    }
  }

  const line = (id: string) => (
    <li key={id}>
      <span className="nm">{pname(id)}</span>
      <span className="acts">
        <button className={`mvp ${mvp === id ? "on" : ""}`} aria-pressed={mvp === id} onClick={() => setMvp(mvp === id ? null : id)}>Figura</button>
        <span className="step">
          <button onClick={() => bumpGoal(id, -1)} aria-label={`Restar gol a ${pname(id)}`}>−</button>
          <span>{goals[id] || 0}</span>
          <button onClick={() => bumpGoal(id, 1)} aria-label={`Sumar gol a ${pname(id)}`}>+</button>
        </span>
      </span>
    </li>
  );

  const mismatch = ga > a || gb > b;

  return (
    <section className="card">
      <h2>Cargar resultado</h2>
      <div className="score">
        <ScoreSide t="A" label="Verdes" v={a} set={setA} />
        <span className="sep" aria-hidden="true">–</span>
        <ScoreSide t="B" label="Pecheras" v={b} set={setB} />
      </div>
      <h3 className="sub" style={{ marginTop: 0 }}>Goles y figura</h3>
      <div className="teams">
        <div className="team A"><h3>Verdes</h3><ul>{A.map(line)}</ul></div>
        <div className="team B"><h3>Pecheras</h3><ul>{B.map(line)}</ul></div>
      </div>
      <div className="sticky-cta">
        {mismatch && (
          <p className="err" role="alert">Hay más goles individuales que goles en el marcador.</p>
        )}
        <button className="btn" id="finish" disabled={busy} onClick={finish}>
          {busy ? "Guardando…" : `Guardar ${a}–${b} y cerrar partido`}
        </button>
      </div>
    </section>
  );
}

/* ---------- Página ---------- */
export default function Partido({ ctx }: { ctx: Ctx }) {
  const { data, isAdmin, meId, supabase, run } = ctx;
  const m = openMatch(data.matches);
  const [confirmDel, setConfirmDel] = useState(false);

  if (!data.players.length) {
    return (
      <div className="card empty">
        <h2>Todavía no hay jugadores</h2>
        <p className="muted">Pasale el link de invitación al grupo (está en Plantel): cada uno se suma entrando con su Google.</p>
      </div>
    );
  }
  if (!m) {
    if (isAdmin) return <Convocatoria ctx={ctx} />;
    return (
      <div className="card empty">
        <h2>No hay encuesta abierta</h2>
        <p className="muted">Cuando el organizador abra la encuesta del próximo partido, la vas a ver acá.</p>
      </div>
    );
  }

  const hasTeams = data.lineups.some((l) => l.match_id === m.id);
  // "Cómo va" aparece recién después de votar; el organizador lo ve siempre.
  const watching = isAdmin || data.availability.some((a) => a.match_id === m.id && a.player_id === meId);

  // Partido ya jugado que se reabrió desde Historial: solo equipos y resultado.
  if (m.played_at) {
    return (
      <>
        {m.time && <Teams ctx={ctx} m={m} />}
        {hasTeams && isAdmin && <ResultForm ctx={ctx} m={m} key={`res-${m.id}`} />}
      </>
    );
  }

  return (
    <>
      <Poll ctx={ctx} m={m} key={`poll-${m.id}`} />
      {watching && <Board ctx={ctx} m={m} key={`board-${m.id}`} />}
      {isAdmin && <Organizer ctx={ctx} m={m} />}
      {m.time && <Teams ctx={ctx} m={m} />}
      {m.time && hasTeams && isAdmin && <ResultForm ctx={ctx} m={m} key={`res-${m.id}`} />}
      {isAdmin && (
        <div className="danger-zone">
          {confirmDel ? (
            <div className="confirm">
              <p className="small">¿Borrar esta encuesta y sus votos? No se puede deshacer.</p>
              <button className="btn ghost" onClick={() => setConfirmDel(false)}>No</button>
              <button className="btn danger" onClick={async () => { await run(() => supabase.from("matches").delete().eq("id", m.id), "Encuesta borrada"); setConfirmDel(false); }}>
                Sí, borrar
              </button>
            </div>
          ) : (
            <button className="btn danger-ghost wide" onClick={() => setConfirmDel(true)}>Cancelar partido</button>
          )}
        </div>
      )}
    </>
  );
}
