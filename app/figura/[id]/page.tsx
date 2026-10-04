import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Link para votar la figura de un partido: abre su grupo en Historial, donde está la votación.
// Si el partido no existe o no es de un grupo tuyo (la RLS no lo deja ver), va al inicio.
export default async function Figura({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/figura/${id}`)}`);

  const { data } = await supabase.from("matches").select("group_id").eq("id", id).maybeSingle();
  redirect(data ? `/?g=${data.group_id}&tab=historial` : "/");
}
