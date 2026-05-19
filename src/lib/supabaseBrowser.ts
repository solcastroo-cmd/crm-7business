/**
 * Cliente Supabase para uso no browser (client components).
 * Usa @supabase/ssr para armazenar sessão em cookies,
 * compatível com o middleware SSR.
 */
import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
