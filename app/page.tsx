import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import App from "@/components/App";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ g?: string; tab?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { g, tab } = await searchParams;
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email ||
    "";

  return <App userId={user.id} displayName={displayName} email={user.email ?? ""} initialGroup={g} initialTab={tab} />;
}
