import posthog from "posthog-js";

/**
 * Lo que medimos, además de lo automático de PostHog (páginas, sesiones, clics).
 * Se ve solo en PostHog, nunca en la app. Sin PostHog configurado, todo esto no hace nada.
 */
export type AnalyticsEvent =
  | "app_opened"          // abrió la app, o volvió después de un rato
  | "tab_viewed"          // { tab }: tabla (ranking), partido, historial, plantel, perfil
  | "match_created"       // abrió una encuesta (convocatoria)
  | "availability_voted"  // { going, for_other }: votó si juega (going null = borró el voto)
  | "teams_generated"     // { players }: armó los equipos
  | "result_saved"        // cargó el resultado
  | "mvp_voted"           // { removed }: votó la figura
  | "invite_shared"       // { method }: copy, share o whatsapp
  | "group_created"       // { first }: era su primer grupo
  | "group_joined";       // entró con un link de invitación

type Props = Record<string, string | number | boolean | null>;

export function track(event: AnalyticsEvent, props?: Props) {
  if (posthog.__loaded) posthog.capture(event, props);
}

/** Ata los eventos a la cuenta (solo el id de Supabase: sin mail ni nombre). */
export function identify(userId: string) {
  if (posthog.__loaded) posthog.identify(userId);
}

/** Se suma a todos los eventos que siguen (ej. el grupo que se está viendo). */
export function setContext(props: Props) {
  if (posthog.__loaded) posthog.register(props);
}

/** Al cerrar sesión: lo que siga en este dispositivo ya no es de esa cuenta. */
export function resetAnalytics() {
  if (posthog.__loaded) posthog.reset();
}
