import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import JoinGroup from "./JoinGroup";

export const dynamic = "force-dynamic";

type Preview = { id: string; name: string; players: number; already: boolean };

// Link de invitación: muestra el grupo y pide el nombre para sumarse.
export default async function Unirse({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/unirse/${code}`)}`);

  const { data } = await supabase.rpc("group_preview", { p_code: code });
  const g = (data as Preview[] | null)?.[0];
  if (g?.already) redirect(`/?g=${g.id}`);

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    "";

  return (
    <main className="login">
      <div className="box">
        <header className="pitch">
          <div className="eyebrow">Te invitaron a</div>
          <h1>{g ? g.name : "Link vencido"}</h1>
          <p style={{ margin: "10px 0 0", opacity: 0.9 }}>
            {g
              ? `${g.players} ${g.players === 1 ? "jugador" : "jugadores"} en el plantel. Sumate para votar los partidos y entrar en la tabla.`
              : "Este link de invitación no es válido o el organizador lo cambió."}
          </p>
        </header>
        {g ? (
          <JoinGroup code={code} groupName={g.name} suggestedName={displayName.split(" ")[0] ?? ""} />
        ) : (
          <section className="card" style={{ display: "grid", gap: 10 }}>
            <p className="muted small" style={{ margin: 0 }}>Pedile uno nuevo al organizador del grupo.</p>
            <Link className="btn ghost full" href="/">Ir a mis grupos</Link>
          </section>
        )}
      </div>
    </main>
  );
}
