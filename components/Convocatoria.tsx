"use client";

import { useState } from "react";
import { DEFAULT_SLOTS, FORMATS, dayLabel, hs, playedMatches, pollSummary, sortSlots, todayISO } from "@/lib/stats";
import type { Format, Match } from "@/lib/types";
import { track } from "@/lib/analytics";
import type { Ctx } from "./ctx";

/** Lo que arma el organizador; el resto (votos, horario confirmado) sale de la encuesta. */
export type Draft = Pick<Match, "date" | "slots" | "format">;

const STEPS = ["Día", "Horarios", "Formato", "Confirmar"];
const LAST = STEPS.length - 1;
/** Horarios que se ofrecen de una; cualquier otro se agrega a mano. */
const HOURS = ["17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00"];

const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "20 · 21 · 22 hs" */
const slotsLabel = (slots: string[]) => `${slots.map((s) => hs(s).slice(0, -3)).join(" · ")} hs`;

/** Lo de siempre: el mismo día de la semana, los horarios y el formato del último partido jugado. */
function usual(matches: Match[]): Draft {
  const P = playedMatches(matches);
  const last = P[P.length - 1];
  const today = todayISO();
  return {
    date: last ? addDays(today, (toDate(last.date).getDay() - toDate(today).getDay() + 7) % 7) : today,
    slots: sortSlots(last?.slots?.length ? last.slots : DEFAULT_SLOTS),
    format: last?.format ?? "F11",
  };
}

export function Summary({ d, onEdit }: { d: Draft; onEdit?: (step: number) => void }) {
  const rows = [
    ["Día", dayLabel(d.date)],
    ["Horarios", slotsLabel(d.slots)],
    ["Formato", `${d.format} · ${FORMATS[d.format]} jugadores`],
  ];
  return (
    <dl className="summary">
      {rows.map(([k, v], i) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
          {onEdit && (
            <button className="link" onClick={() => onEdit(i)} aria-label={`Cambiar ${k.toLowerCase()}`}>Cambiar</button>
          )}
        </div>
      ))}
    </dl>
  );
}

/**
 * Abrir una encuesta paso a paso (día → horarios → formato → confirmar), o editar la que está abierta.
 * Editando arranca en el resumen: se toca "Cambiar" en lo que haga falta y se guarda todo junto.
 */
export default function Convocatoria({ ctx, m, onClose }: { ctx: Ctx; m?: Match; onClose?: () => void }) {
  const { data, supabase, run, group, setTab } = ctx;
  const p = m ? pollSummary(m, data) : null;
  const orig: Draft | null = m && p ? { date: m.date, slots: p.slots, format: m.format } : null;
  const [first] = useState<Draft>(() => orig ?? usual(data.matches));
  const [d, setD] = useState(first);
  const [step, setStep] = useState(m ? LAST : 0);
  const [reached, setReached] = useState(m ? LAST : 0);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("19:30");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const valid = [!!d.date, d.slots.length > 0, true];
  const canGo = (i: number) => i <= reached && valid.slice(0, i).every(Boolean);
  const go = (i: number) => {
    setStep(i);
    setReached((r) => Math.max(r, i));
    setAdding(false);
  };
  // Una vez visto el resumen, cada paso vuelve directo a él.
  const target = reached === LAST ? LAST : step + 1;

  const today = todayISO();
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));
  // Los que ya traía siguen a la vista aunque se desmarquen, para poder volver a marcarlos.
  const hours = sortSlots([...HOURS, ...first.slots, ...d.slots]);
  const toggle = (s: string) =>
    set({ slots: d.slots.includes(s) ? d.slots.filter((x) => x !== s) : sortSlots([...d.slots, s]) });

  const votes = p ? p.toy.length + p.notoy.length : 0;
  const lost = p ? p.slots.filter((s) => !d.slots.includes(s) && p.bySlot[s].length) : [];
  const changed = !orig || d.date !== orig.date || d.format !== orig.format || d.slots.join() !== orig.slots.join();

  async function save() {
    setBusy(true);
    const ok = await run(
      () => (m
        ? supabase.from("matches").update(d).eq("id", m.id)
        : supabase.from("matches").insert({ group_id: group.id, ...d })),
      m ? "Encuesta actualizada" : "Encuesta abierta"
    );
    setBusy(false);
    if (!ok) return;
    if (orig) {
      track("match_edited", {
        date: d.date !== orig.date, slots: d.slots.join() !== orig.slots.join(), format: d.format !== orig.format,
      });
      onClose?.();
    } else {
      track("match_created", { format: d.format, slots: d.slots.length });
      setTab("partido");
    }
  }

  const lostWarn = lost.length > 0 && (
    <p className="warn">
      Sacás {lost.map((s) => `${hs(s)} (${p!.bySlot[s].length} ${p!.bySlot[s].length === 1 ? "voto" : "votos"})`).join(", ")}.
      Esos votos dejan de contar.
    </p>
  );

  let title: string, hint = "";
  let body: React.ReactNode;
  if (step === 0) {
    title = "¿Qué día se juega?";
    body = (
      <>
        <div className="pick-grid days">
          {days.map((x, i) => (
            <button
              key={x} className="pick" aria-pressed={d.date === x} onClick={() => set({ date: x })}
              aria-label={toDate(x).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            >
              <span className="k">{i === 0 ? "Hoy" : i === 1 ? "Mañana" : cap(toDate(x).toLocaleDateString("es-AR", { weekday: "short" }))}</span>
              <span className="v num">{toDate(x).getDate()}</span>
            </button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="cv-date">O elegí otra fecha</label>
          <input
            type="date" id="cv-date" min={m ? undefined : today} value={d.date}
            onChange={(e) => e.target.value && set({ date: e.target.value })}
          />
        </div>
        {m && d.date !== m.date && votes > 0 && (
          <p className="warn">Ya votaron {votes}. Sus votos quedan como están: avisá del cambio por si alguno ya no puede.</p>
        )}
      </>
    );
  } else if (step === 1) {
    title = "¿En qué horarios se puede?";
    hint = "Marcá todos los posibles; cada uno vota en cuáles puede.";
    body = (
      <>
        <div className="pick-grid">
          {hours.map((s) => {
            const n = p?.bySlot[s]?.length ?? 0;
            return (
              <button key={s} className="pick" aria-pressed={d.slots.includes(s)} disabled={m?.time === s} onClick={() => toggle(s)}>
                <span className="v num">{hs(s)}</span>
                {n > 0 && <span className="k num">{n} {n === 1 ? "voto" : "votos"}</span>}
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {adding ? (
            <span className="slot-add">
              <input type="time" step={900} value={custom} autoFocus aria-label="Otro horario" onChange={(e) => setCustom(e.target.value)} />
              <button
                className="btn" disabled={!custom}
                onClick={() => { set({ slots: sortSlots([...d.slots, custom]) }); setAdding(false); }}
              >Agregar</button>
              <button className="x" aria-label="Cancelar" onClick={() => setAdding(false)}>×</button>
            </span>
          ) : (
            <button className="chip slot add" onClick={() => setAdding(true)}>+ Otro horario</button>
          )}
        </div>
        {!d.slots.length && <p className="err" style={{ marginTop: 10 }}>Marcá al menos un horario.</p>}
        {m?.time && <p className="hint" style={{ marginTop: 10 }}>{hs(m.time)} es el horario confirmado: para sacarlo, reabrí la encuesta.</p>}
        {lostWarn}
      </>
    );
  } else if (step === 2) {
    title = "¿Qué formato?";
    hint = "Define cuántos hacen falta para jugar.";
    body = (
      <>
        <div className="pick-grid fmt">
          {(Object.keys(FORMATS) as Format[]).map((f) => (
            <button key={f} className="pick" aria-pressed={d.format === f} onClick={() => set({ format: f })}>
              <span className="v">{f}</span>
              <span className="k num">{FORMATS[f]} jugadores</span>
            </button>
          ))}
        </div>
        {p?.best && (
          <p className="hint" style={{ marginTop: 10 }}>
            Por ahora, a las {hs(p.best)} pueden {p.bySlot[p.best].length}.
          </p>
        )}
      </>
    );
  } else {
    title = m ? "Revisá los cambios" : "Revisá y abrí la votación";
    hint = m ? "" : "Cuando la abras, el grupo ya puede votar. Después la podés editar.";
    body = (
      <>
        <Summary d={d} onEdit={go} />
        {m && d.date !== m.date && votes > 0 && (
          <p className="warn">Cambia el día y ya votaron {votes}: avisá por si alguno ya no puede.</p>
        )}
        {lostWarn}
      </>
    );
  }

  return (
    <section className="card">
      <h2>{m ? "Editar encuesta" : "Abrir encuesta"}</h2>
      {!m && step === 0 && (
        <p className="muted small" style={{ marginTop: 0 }}>
          No hay encuesta abierta. Elegí el día, los horarios y el formato, y después se abre la votación.
        </p>
      )}
      <ol className="steps" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              className={i <= reached ? "done" : ""} aria-current={i === step ? "step" : undefined}
              disabled={!canGo(i)} onClick={() => go(i)}
            >
              <i aria-hidden="true" />{s}
            </button>
          </li>
        ))}
      </ol>
      <h3 className="sub">{title}</h3>
      {hint && <p className="hint" style={{ margin: "-4px 0 10px" }}>{hint}</p>}
      {body}
      <div className="wiz-nav">
        {step < LAST ? (
          <>
            {reached < LAST && step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}>Atrás</button>}
            <button className="btn" disabled={!valid.slice(0, target).every(Boolean)} onClick={() => go(target)}>
              {reached === LAST ? "Listo" : "Siguiente"}
            </button>
          </>
        ) : (
          <>
            {onClose && <button className="btn ghost" onClick={onClose}>Cancelar</button>}
            <button className="btn" id="open-poll" disabled={busy || !changed} onClick={save}>
              {busy ? "Guardando…" : m ? "Guardar cambios" : "Abrir encuesta"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
