import type { Data, Format, Lineup, Match } from "./types";

export const PTS = { presencia: 1, victoria: 3, empate: 1, gol: 1, figura: 2 } as const;
export const FORMATS: Record<Format, number> = { F5: 10, F6: 12, F7: 14, F8: 16, F9: 18, F11: 22 };
export const DEFAULT_SLOTS = ["20:00", "21:00", "22:00", "23:00"];

/* ---------- Fechas y horarios ---------- */
export function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}
export function dayLabel(iso: string) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split("-").map(Number);
  const diff = Math.round((new Date(y, m - 1, d).getTime() - t.getTime()) / 864e5);
  const base = fmtDate(iso);
  return diff === 0 ? `Hoy · ${base}` : diff === 1 ? `Mañana · ${base}` : base;
}
/** Ordena horarios tratando la madrugada (00–05) como después de las 23. */
const slotKey = (s: string) => {
  const h = +s.slice(0, 2);
  return (h < 6 ? h + 24 : h) * 60 + +s.slice(3, 5);
};
export const sortSlots = (a: string[]) => [...new Set(a)].sort((x, y) => slotKey(x) - slotKey(y));
export const hs = (s: string | null | undefined) =>
  s ? `${s.endsWith(":00") ? String(+s.slice(0, 2)) : s} hs` : "";

/* ---------- Partidos ---------- */
export const playedMatches = (matches: Match[]) =>
  matches
    .filter((m) => m.status === "jugado")
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));

export const openMatch = (matches: Match[]) =>
  matches
    .filter((m) => m.status === "abierto")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

/* ---------- Votación de la figura ---------- */
export const mvpVoteOpen = (m: Match) => m.status === "jugado" && m.mvp_vote === "abierta";

/** ¿Jugué algún partido con la votación de figura abierta y todavía no voté? */
export function pendingMvpVote({ matches, lineups, mvpVotes }: Pick<Data, "matches" | "lineups" | "mvpVotes">, me: string) {
  return matches.some(
    (m) =>
      mvpVoteOpen(m) &&
      lineups.some((l) => l.match_id === m.id && l.player_id === me) &&
      !mvpVotes.some((v) => v.match_id === m.id && v.voter_id === me)
  );
}

export type Result = "W" | "D" | "L";

export type PlayerStats = {
  id: string;
  name: string;
  active: boolean;
  pj: number;
  w: number;
  d: number;
  l: number;
  goles: number;
  mvp: number;
  pts: number;
  /** racha de partidos seguidos presente (hasta el último) */
  attend: number;
  /** partidos seguidos sin perder */
  unbeaten: number;
  /** partidos seguidos sin venir (hasta el último) */
  missed: number;
  /** puntos en los últimos 4 partidos del grupo */
  recentPts: number;
  /** últimos 5 resultados propios */
  form: Result[];
  /** % de asistencia sobre partidos jugados */
  pct: number;
  /** puntos por partido jugado */
  ppm: number | null;
};

export function computeStats({ players, matches, lineups }: Pick<Data, "players" | "matches" | "lineups">) {
  const P = playedMatches(matches);
  const byMatch = new Map<string, Lineup[]>();
  lineups.forEach((l) => {
    const arr = byMatch.get(l.match_id) ?? [];
    arr.push(l);
    byMatch.set(l.match_id, arr);
  });

  const list: PlayerStats[] = players.map((p) => {
    const hist: ({ r: Result; pts: number } | null)[] = [];
    let pj = 0, w = 0, d = 0, l = 0, goles = 0, mvp = 0, pts = 0;
    P.forEach((m) => {
      const row = (byMatch.get(m.id) ?? []).find((x) => x.player_id === p.id);
      if (!row) {
        hist.push(null);
        return;
      }
      const mine = row.team === "A" ? m.score_a : m.score_b;
      const theirs = row.team === "A" ? m.score_b : m.score_a;
      const r: Result = mine > theirs ? "W" : mine < theirs ? "L" : "D";
      const isMvp = m.mvp === p.id;
      const got =
        PTS.presencia +
        (r === "W" ? PTS.victoria : r === "D" ? PTS.empate : 0) +
        row.goals * PTS.gol +
        (isMvp ? PTS.figura : 0);
      pj++;
      if (r === "W") w++;
      else if (r === "D") d++;
      else l++;
      goles += row.goals;
      if (isMvp) mvp++;
      pts += got;
      hist.push({ r, pts: got });
    });

    let attend = 0;
    for (let i = hist.length - 1; i >= 0 && hist[i]; i--) attend++;
    let unbeaten = 0;
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (!h) continue;
      if (h.r === "L") break;
      unbeaten++;
    }
    let missed = 0;
    for (let i = hist.length - 1; i >= 0 && !hist[i]; i--) missed++;
    const recentPts = hist.slice(-4).reduce((a, x) => a + (x ? x.pts : 0), 0);
    const form = hist.filter((x): x is { r: Result; pts: number } => !!x).slice(-5).map((x) => x.r);

    return {
      id: p.id,
      name: p.name,
      active: p.active,
      pj, w, d, l, goles, mvp, pts,
      attend, unbeaten, missed, recentPts, form,
      pct: P.length ? Math.round((pj / P.length) * 100) : 0,
      ppm: pj ? pts / pj : null,
    };
  });

  return { list, total: P.length };
}

/**
 * Reparte jugadores en dos equipos parejos según puntos por partido.
 * Los que nunca jugaron toman el promedio del grupo. Un poco de ruido
 * para que "Rearmar" no dé siempre lo mismo.
 */
export function balanceTeams(ids: string[], stats: PlayerStats[], noise = 0.3) {
  const by = new Map(stats.map((s) => [s.id, s]));
  const known = stats.filter((s) => s.ppm != null).map((s) => s.ppm as number);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  const rated = ids
    .map((id) => ({ id, r: (by.get(id)?.ppm ?? avg) + Math.random() * noise }))
    .sort((a, b) => b.r - a.r);
  const A: string[] = [], B: string[] = [];
  let sa = 0, sb = 0;
  rated.forEach((p) => {
    const toA = A.length < B.length || (A.length === B.length && sa <= sb);
    if (toA) { A.push(p.id); sa += p.r; } else { B.push(p.id); sb += p.r; }
  });
  return { A, B };
}

/* ---------- Encuesta ---------- */
export function pollSummary(match: Match, data: Data) {
  const slots = sortSlots(match.slots?.length ? match.slots : DEFAULT_SLOTS);
  const active = data.players.filter((p) => p.active);
  const votes = new Map(
    data.availability.filter((a) => a.match_id === match.id).map((a) => [a.player_id, a])
  );
  const toy = active.filter((p) => votes.get(p.id)?.going).map((p) => p.id);
  const notoy = active.filter((p) => votes.get(p.id) && !votes.get(p.id)!.going).map((p) => p.id);
  const pending = active.filter((p) => !votes.has(p.id)).map((p) => p.id);
  const bySlot: Record<string, string[]> = Object.fromEntries(
    slots.map((s) => [s, toy.filter((id) => votes.get(id)!.hours.includes(s))])
  );
  let best: string | null = null;
  slots.forEach((s) => {
    if (bySlot[s].length > (best ? bySlot[best].length : 0)) best = s;
  });
  return { slots, votes, toy, notoy, pending, bySlot, best: best as string | null, active };
}
