"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState(params.get("error") ? "No se pudo iniciar sesión. Probá de nuevo." : "");
  const [emailErr, setEmailErr] = useState("");
  const redirectTo = () => `${window.location.origin}/auth/callback`;
  const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  async function google() {
    setError("");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) setError("No se pudo abrir Google. Probá con el mail.");
  }

  async function magic(e: React.FormEvent) {
    e.preventDefault();
    if (!validEmail(email)) {
      setEmailErr(email.trim() ? "Ese mail no parece válido. Revisalo." : "Escribí tu mail.");
      return;
    }
    setEmailErr("");
    setError("");
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) {
      setState("idle");
      setError(
        error.status === 429
          ? "Se mandaron muchos mails seguidos. Esperá un minuto y probá de nuevo."
          : "No se pudo mandar el mail. Revisá la dirección."
      );
      return;
    }
    setState("sent");
  }

  return (
    <main className="login">
      <div className="box">
        <header className="pitch">
          <div className="eyebrow">El grupo de los jueves</div>
          <h1>Fútbol de los Jueves</h1>
          <p style={{ margin: "10px 0 0", opacity: 0.9 }}>
            Votá si vas, elegí tu horario y mirá cómo viene la tabla.
          </p>
        </header>

        <section className="card" style={{ display: "grid", gap: 14 }}>
          <button className="gbtn" onClick={google} id="google">
            <GoogleIcon /> Entrar con Google
          </button>

          <div className="or">o con tu mail</div>

          {state === "sent" ? (
            <p className="ok">
              Listo. Te mandamos un link a <b>{email}</b>. Abrilo desde este mismo celular para entrar.
            </p>
          ) : (
            <form onSubmit={magic} noValidate style={{ display: "grid", gap: 10 }}>
              <div className="field">
                <label htmlFor="email">Mail</label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  placeholder="vos@gmail.com"
                  value={email}
                  aria-invalid={!!emailErr}
                  aria-describedby={emailErr ? "email-err" : undefined}
                  onChange={(e) => { setEmail(e.target.value); if (emailErr && validEmail(e.target.value)) setEmailErr(""); }}
                  onBlur={() => email.trim() && !validEmail(email) && setEmailErr("Ese mail no parece válido. Revisalo.")}
                />
                {emailErr && <p className="err" id="email-err" role="alert">{emailErr}</p>}
              </div>
              <button className="btn full" disabled={state === "sending"}>
                {state === "sending" ? "Mandando…" : "Mandarme el link"}
              </button>
            </form>
          )}

          {error && <p className="err" role="alert">{error}</p>}
        </section>

        <p className="small muted" style={{ textAlign: "center", margin: 0 }}>
          La sesión queda guardada: la próxima vez entrás directo.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
