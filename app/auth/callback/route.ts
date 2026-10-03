import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { NEXT_COOKIE, safeNext } from "@/lib/next";

// Google vuelve acá con un ?code= que se canjea por la sesión.
// Si venía de un link (ej. una invitación), sigue hacia ahí.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const jar = await cookies();
      let next: string | null = null;
      try { next = safeNext(decodeURIComponent(jar.get(NEXT_COOKIE)?.value ?? "")); } catch {}
      jar.delete(NEXT_COOKIE);
      return NextResponse.redirect(`${origin}${next ?? "/"}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=1`);
}
