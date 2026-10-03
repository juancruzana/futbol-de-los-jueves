import type { SupabaseClient } from "@supabase/supabase-js";
import type { Data, Group } from "@/lib/types";

export type Tab = "tabla" | "partido" | "historial" | "plantel" | "perfil";

export type Ctx = {
  data: Data;
  supabase: SupabaseClient;
  /** grupo que se está viendo */
  group: Group;
  /** organizador del grupo que se está viendo */
  isAdmin: boolean;
  /** cuenta logueada */
  userId: string;
  /** jugador de la cuenta logueada en este grupo */
  meId: string | null;
  setTab: (t: Tab) => void;
  /** corre una escritura, muestra error o mensaje, y refresca los datos */
  run: (fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => Promise<boolean>;
  toast: (msg: string) => void;
  pname: (id: string | null | undefined) => string;
};
