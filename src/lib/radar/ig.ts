import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const GRAPH = "https://graph.facebook.com/v25.0";

export const RADAR_SCOPES = [
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

export class GraphError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

export async function graph<T = any>(
  path: string,
  token: string,
  params: Record<string, string> = {},
  init?: RequestInit,
  timeoutMs = 20_000,
): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    throw new GraphError(json?.error?.message ?? `HTTP ${res.status}`, json?.error?.code);
  }
  return json as T;
}

/** A loja é o próprio usuário logado (users.id). Retorna null se não houver sessão. */
export async function getSessionStoreId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}
