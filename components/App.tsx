"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Data, Group } from "@/lib/types";
import { openMatch } from "@/lib/stats";
import type { Ctx, Tab } from "./ctx";
import Hero, { NewMatchButton } from "./Hero";
import Tabla from "./Tabla";
import Partido from "./Partido";
import Historial from "./Historial";
import Plantel from "./Plantel";
import Join from "./Join";
import Perfil from "./Perfil";
import NuevoGrupo from "./NuevoGrupo";

const ICON_PROPS = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2,
  strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
} as const;

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "tabla", label: "Tabla",
    icon: <svg {...ICON_PROPS}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" /></svg>,
  },
  {
    id: "partido", label: "Partido",
    icon: <svg {...ICON_PROPS}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M9 15l2 2 4-4" /></svg>,
  },
  {
    id: "historial", label: "Historial",
    icon: <svg {...ICON_PROPS}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>,
  },
  {
    id: "plantel", label: "Plantel",
    icon: <svg {...ICON_PROPS}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></svg>,
  },
];

const initials = (n: string) =>
  n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const EMPTY: Data = { players: [], matches: [], availability: [], lineups: [], members: [] };

/** Un menú desplegable se cierra tocando afuera o con Escape. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

export default function App({
  userId,
  displayName,
  email,
  initialGroup,
}: {
  userId: string;
  displayName: string;
  email: string;
  /** grupo a abrir (ej. recién sumado con un link de invitación) */
  initialGroup?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const groupRef = useRef<string | null>(initialGroup ?? null);
  const [creating, setCreating] = useState(false);
  const [data, setData] = useState<Data>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTabState] = useState<Tab>("tabla");
  const [msg, setMsg] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useDismiss(menuOpen, menuRef, useCallback(() => setMenuOpen(false), []));
  useDismiss(groupMenuOpen, groupMenuRef, useCallback(() => setGroupMenuOpen(false), []));

  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMsg(""), 2400);
  }, []);

  useEffect(() => {
    try {
      const t = localStorage.getItem("fdj-tab") as Tab | null;
      if (t && TABS.some((x) => x.id === t)) setTabState(t);
    } catch {}
    // El ?g= de la invitación ya se usó: lo saco de la barra de direcciones.
    if (initialGroup) window.history.replaceState(null, "", "/");
  }, [initialGroup]);
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    try { localStorage.setItem("fdj-tab", t); } catch {}
    window.scrollTo({ top: 0 });
  }, []);

  const load = useCallback(async () => {
    const mem = await supabase
      .from("group_members")
      .select("role, groups(id, name, invite_code)")
      .eq("user_id", userId);
    if (mem.error) {
      setLoadError("No se pudieron cargar los datos. Revisá la conexión y recargá.");
      return;
    }
    const gs: Group[] = (mem.data as unknown as { role: Group["role"]; groups: Omit<Group, "role"> | null }[])
      .flatMap((r) => (r.groups ? [{ ...r.groups, role: r.role }] : []))
      .sort((a, b) => a.name.localeCompare(b.name));

    let gid = groupRef.current;
    if (!gid || !gs.some((g) => g.id === gid)) {
      let saved: string | null = null;
      try { saved = localStorage.getItem("fdj-group"); } catch {}
      gid = gs.find((g) => g.id === saved)?.id ?? gs[0]?.id ?? null;
    }
    groupRef.current = gid;
    if (gid) try { localStorage.setItem("fdj-group", gid); } catch {}
    if (!gid) {
      setGroups(gs);
      setGroupId(null);
      setData(EMPTY);
      setLoadError("");
      setLoaded(true);
      return;
    }

    const [p, m, a, l, mb] = await Promise.all([
      supabase.from("players").select("*").eq("group_id", gid).order("name"),
      supabase.from("matches").select("*").eq("group_id", gid),
      supabase.from("availability").select("match_id,player_id,going,hours").eq("group_id", gid),
      supabase.from("lineups").select("match_id,player_id,team,goals").eq("group_id", gid),
      supabase.from("group_members").select("user_id,role").eq("group_id", gid),
    ]);
    // Si mientras cargaba se cambió de grupo, esta respuesta ya no sirve.
    if (groupRef.current !== gid) return;
    const err = p.error || m.error || a.error || l.error || mb.error;
    if (err) {
      setLoadError("No se pudieron cargar los datos. Revisá la conexión y recargá.");
      return;
    }
    setLoadError("");
    setGroups(gs);
    setGroupId(gid);
    setData({ players: p.data!, matches: m.data!, availability: a.data!, lineups: l.data!, members: mb.data! });
    setLoaded(true);
  }, [supabase, userId]);

  const switchGroup = useCallback((id: string) => {
    setGroupMenuOpen(false);
    setCreating(false);
    if (id === groupRef.current) return;
    groupRef.current = id;
    setLoaded(false);
    setData(EMPTY);
    load();
    window.scrollTo({ top: 0 });
  }, [load]);

  // Carga inicial + tiempo real: ante cualquier cambio de cualquiera, recargo (son pocos datos).
  // La RLS ya filtra: solo llegan cambios de mis grupos.
  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const bump = () => { clearTimeout(t); t = setTimeout(load, 250); };
    const ch = supabase.channel("futbol");
    ["groups", "group_members", "players", "matches", "availability", "lineups"].forEach((table) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table }, bump)
    );
    ch.subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
    };
  }, [supabase, load]);

  const run = useCallback<Ctx["run"]>(
    async (fn, ok) => {
      const { error } = await fn();
      if (error) {
        toast(
          /row-level security|permission/i.test(error.message)
            ? "No tenés permiso para hacer eso."
            : error.message || "No se pudo guardar. Probá de nuevo."
        );
        return false;
      }
      if (ok) toast(ok);
      await load();
      return true;
    },
    [load, toast]
  );

  const group = groups.find((g) => g.id === groupId) ?? null;
  const isAdmin = group?.role === "admin";
  const me = data.players.find((p) => p.user_id === userId) ?? null;
  const pname = useCallback(
    (id: string | null | undefined) => data.players.find((p) => p.id === id)?.name ?? "Ex jugador",
    [data.players]
  );
  const suggestedName = me?.name ?? (displayName.includes("@") ? "" : displayName.split(" ")[0]);

  const ctx: Ctx | null = group
    ? { data, supabase, group, isAdmin, userId, meId: me?.id ?? null, setTab, run, toast, pname }
    : null;

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <div className="card empty">
        <h2>Sin conexión</h2>
        <p className="muted">{loadError}</p>
        <button className="btn" onClick={load}>Reintentar</button>
      </div>
    );
  } else if (!loaded) {
    body = <div className="card empty"><h2>Cargando…</h2></div>;
  } else if (creating || !ctx) {
    body = (
      <NuevoGrupo
        supabase={supabase}
        first={!groups.length}
        suggestedName={suggestedName}
        onCreated={(id) => { switchGroup(id); setTab("plantel"); toast("¡Grupo creado! Invitá al resto"); }}
        onCancel={groups.length ? () => setCreating(false) : undefined}
      />
    );
  } else if (!me && !isAdmin) {
    body = <Join ctx={ctx} />;
  } else {
    body = (
      <>
        {/* La cancha resume el próximo partido: va arriba de todo en la pantalla de inicio */}
        {tab === "tabla" && <Hero ctx={ctx} />}
        {!me && isAdmin && <Join ctx={ctx} compact />}
        {tab === "tabla" && <Tabla ctx={ctx} />}
        {tab === "partido" && <Partido ctx={ctx} />}
        {tab === "historial" && <Historial ctx={ctx} />}
        {tab === "plantel" && <Plantel ctx={ctx} />}
        {tab === "perfil" && <Perfil key={`${group!.id}-${me?.id ?? "sin-jugador"}`} ctx={ctx} email={email} />}
      </>
    );
  }

  const showTabs = loaded && !loadError && !creating && !!ctx && (me || isAdmin);
  const open = openMatch(data.matches);
  const needsVote = !!open && !open.played_at && !!me && !data.availability.some((a) => a.match_id === open.id && a.player_id === me.id);
  const name = me?.name ?? displayName;

  // Acción principal al alcance del pulgar. En "Partido" no hace falta: la acción ya está en pantalla.
  let fab: React.ReactNode = null;
  if (showTabs && ctx && tab !== "partido") {
    if (needsVote) {
      fab = <button className="btn fab" onClick={() => setTab("partido")}>¿Jugás? Votá</button>;
    } else if (isAdmin && !open && data.players.length > 0) {
      fab = <NewMatchButton ctx={ctx} className="fab" />;
    }
  }

  const logo = (
    <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--pitch)" />
      <rect x="5" y="7" width="22" height="18" rx="2" fill="none" stroke="var(--on-pitch)" strokeWidth="1.6" />
      <line x1="16" y1="7" x2="16" y2="25" stroke="var(--on-pitch)" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="3.6" fill="none" stroke="var(--on-pitch)" strokeWidth="1.6" />
    </svg>
  );

  return (
    <div className={`wrap ${showTabs ? "" : "no-nav"}`}>
      <header className="topbar">
        {groups.length ? (
          <div className="gsw" ref={groupMenuRef}>
            <button
              className="brand"
              aria-label={`Grupo: ${group?.name ?? ""}. Cambiar de grupo`}
              aria-haspopup="menu"
              aria-expanded={groupMenuOpen}
              onClick={() => setGroupMenuOpen((o) => !o)}
            >
              {logo}
              <span>{group?.name ?? "Fútbol de los Jueves"}</span>
              <svg className="chev" {...ICON_PROPS} width="18" height="18"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {groupMenuOpen && (
              <div className="menu left" role="menu">
                <div className="menu-label">Tus grupos</div>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    className="menu-item"
                    role="menuitemradio"
                    aria-checked={g.id === groupId && !creating}
                    onClick={() => switchGroup(g.id)}
                  >
                    <span className="gname">{g.name}</span>
                    {g.role === "admin" && <span className="badge">Org.</span>}
                    <span className="check" aria-hidden="true">{g.id === groupId && !creating ? "✓" : ""}</span>
                  </button>
                ))}
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  role="menuitem"
                  onClick={() => { setGroupMenuOpen(false); setCreating(true); window.scrollTo({ top: 0 }); }}
                >
                  + Crear grupo nuevo
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="brand">{logo}<span>Fútbol de los Jueves</span></div>
        )}
        <div className="acct" ref={menuRef}>
          <button
            className="avatar"
            aria-label={`Cuenta de ${name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {initials(name)}
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <div className="who">
                <b>{name}</b>
                {name !== displayName && <span className="small muted">{displayName}</span>}
                {isAdmin && <span className="badge">Organizador</span>}
              </div>
              {ctx && (
                <>
                  <button
                    className="menu-item"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setCreating(false); setTab("perfil"); }}
                  >
                    Mi perfil
                  </button>
                  <button
                    className="menu-item"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setCreating(false); setTab("plantel"); }}
                  >
                    Invitar al grupo
                  </button>
                </>
              )}
              <form action="/auth/signout" method="post">
                <button className="menu-item danger" type="submit" role="menuitem">Cerrar sesión</button>
              </form>
            </div>
          )}
        </div>
      </header>

      {showTabs && (
        <nav className="bnav" aria-label="Secciones">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              <span className="ico">{t.icon}</span>
              {t.label}
              {t.id === "partido" && needsVote && <span className="dot" aria-label="Falta tu voto" />}
            </button>
          ))}
        </nav>
      )}

      <main className="panel">{body}</main>

      {fab}
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  );
}
