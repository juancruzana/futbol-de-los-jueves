/** Adónde volver después del login. Solo rutas internas (nada de //otro-sitio). */
export const NEXT_COOKIE = "fdj-next";

export function safeNext(v: string | null | undefined) {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : null;
}
