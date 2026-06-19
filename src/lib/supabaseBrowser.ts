/**
 * Cliente Supabase singleton para uso no browser (client components).
 * Uma única instância é compartilhada por todos os componentes — evita
 * múltiplos listeners de auth que causam re-renders em cascata.
 */
import { createBrowserClient } from "@supabase/ssr";

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}
