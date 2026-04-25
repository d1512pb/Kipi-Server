import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Usamos VITE_ como prefijo porque estamos en Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * En desarrollo, el repo debe poder levantar aunque aún no se hayan configurado
 * las variables de entorno. Si faltan, habilitamos un modo "mock" (sin Supabase).
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

if (!supabase) {
  // No crashear el render: permitir demo local (AuthContext tiene fallback).
  console.warn(
    "[kipi/pwa] Supabase env vars missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Running in mock auth mode.",
  );
}
