import type { SupabaseClient } from "@supabase/supabase-js";
import type { Data } from "@/lib/types";

export type Tab = "tabla" | "partido" | "historial" | "plantel";

export type Ctx = {
  data: Data;
  supabase: SupabaseClient;
  isAdmin: boolean;
  /** jugador vinculado a la cuenta logueada */
  meId: string | null;
  setTab: (t: Tab) => void;
  /** corre una escritura, muestra error o mensaje, y refresca los datos */
  run: (fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => Promise<boolean>;
  toast: (msg: string) => void;
  pname: (id: string | null | undefined) => string;
};
