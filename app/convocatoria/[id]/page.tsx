import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Link de la encuesta de un partido: abre su grupo en Partido, donde se vota (si ya se jugó, en Historial).
// Si el partido no existe o no es de un grupo tuyo (la RLS no lo deja ver), va al inicio.
export default async function ConvocatoriaLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/convocatoria/${id}`)}`);

  const { data } = await supabase.from("matches").select("group_id, status").eq("id", id).maybeSingle();
  if (!data) redirect("/");
  redirect(`/?g=${data.group_id}&tab=${data.status === "jugado" ? "historial" : "partido"}`);
}
