import posthog from "posthog-js";

// Métricas de uso: solo las ve el dueño de la app, en PostHog. Sin clave no se mide nada.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (key) {
  const region = process.env.NEXT_PUBLIC_POSTHOG_REGION === "eu" ? "eu" : "us";
  posthog.init(key, {
    // Pasa por nuestro dominio (ver next.config.mjs) para que los bloqueadores no corten las métricas.
    api_host: "/ingest",
    ui_host: `https://${region}.posthog.com`,
    defaults: "2026-08-30",
  });
}
