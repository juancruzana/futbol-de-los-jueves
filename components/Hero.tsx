"use client";

import { useState } from "react";
import { FORMATS, dayLabel, fmtDate, hs, openMatch, playedMatches, pollSummary } from "@/lib/stats";
import { track } from "@/lib/analytics";
import type { Ctx } from "./ctx";

export default function Hero({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const m = openMatch(data.matches);
  const act = data.players.filter((p) => p.active).length;

  if (!m) {
    const P = playedMatches(data.matches);
    const last = P[P.length - 1];
    return (
      <header className="pitch">
        <div className="eyebrow">Fútbol del grupo · {act} en el plantel</div>
        <h1>{last ? `Último: ${fmtDate(last.date)}` : "Arranca la temporada"}</h1>
        <div className="pitch-row">
          {last && (
            <div>
              <div className="eyebrow">Resultado</div>
              <div className="big num">{last.score_a} <small>–</small> {last.score_b}</div>
            </div>
          )}
          <div>
            <div className="eyebrow">Partidos jugados</div>
            <div className="big num">{P.length}</div>
          </div>
        </div>
      </header>
    );
  }

  const need = FORMATS[m.format] ?? 22;
  const p = pollSummary(m, data);

  if (!m.time) {
    const answered = p.toy.length + p.notoy.length;
    return (
      <header className="pitch">
        <div className="eyebrow"><span className="pill">Encuesta abierta</span> · {m.format}</div>
        <h1>{dayLabel(m.date)}</h1>
        <div className="pitch-row">
          <div>
            <div className="eyebrow">Respondieron</div>
            <div className="big num">{answered}<small> / {p.active.length}</small></div>
            <div className="bar"><i style={{ width: `${p.active.length ? (answered / p.active.length) * 100 : 0}%` }} /></div>
          </div>
          <div>
            <div className="eyebrow">Mejor horario</div>
            <div className="big num">{p.best ? hs(p.best) : <small>Sin votos</small>}</div>
          </div>
          {p.best && (
            <div>
              <div className="eyebrow">Pueden a esa hora</div>
              <div className="big num">{p.bySlot[p.best].length}<small> / {need}</small></div>
            </div>
          )}
        </div>
      </header>
    );
  }

  const convocados = p.bySlot[m.time]?.length ?? 0;
  const falta = Math.max(0, need - convocados);
  return (
    <header className="pitch">
      <div className="eyebrow">Próximo partido · {m.format}</div>
      <h1>{dayLabel(m.date)} · {hs(m.time)}</h1>
      <div className="pitch-row">
        <div>
          <div className="eyebrow">Confirmados</div>
          <div className="big num">{convocados}<small> / {need}</small></div>
          <div className="bar"><i style={{ width: `${Math.min(100, (convocados / need) * 100)}%` }} /></div>
        </div>
        <div>
          <div className="eyebrow">{falta ? "Faltan" : "Estado"}</div>
          <div className="big num">{falta ? falta : <small>Completo</small>}</div>
        </div>
      </div>
    </header>
  );
}

export function NewMatchButton({ ctx, className = "" }: { ctx: Ctx; className?: string }) {
  const { supabase, run, data, setTab, group } = ctx;
  const [busy, setBusy] = useState(false);
  async function create() {
    const P = playedMatches(data.matches);
    const last = P[P.length - 1];
    setBusy(true);
    const ok = await run(
      () => supabase.from("matches").insert({ group_id: group.id, format: last?.format ?? "F11", date: new Date().toLocaleDateString("en-CA") }),
      "Encuesta abierta"
    );
    setBusy(false);
    if (ok) {
      track("match_created");
      setTab("partido");
    }
  }
  return (
    <button className={`btn ${className}`} id="new-match" disabled={busy} onClick={create}>
      + Abrir encuesta
    </button>
  );
}
