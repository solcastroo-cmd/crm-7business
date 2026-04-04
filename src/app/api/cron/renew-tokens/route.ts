/**
 * GET /api/cron/renew-tokens
 *
 * Cron job diário: renova tokens Meta que vencem em < 7 dias.
 * Chame com: Authorization: Bearer {CRON_SECRET}
 *
 * Railway Cron: configurar para rodar às 03:00 UTC diariamente.
 * URL: https://crm-7business-production.up.railway.app/api/cron/renew-tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin as getSupabase }               from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const GRAPH            = "https://graph.facebook.com/v19.0";
const META_APP_ID      = process.env.META_APP_ID!;
const META_APP_SECRET  = process.env.META_APP_SECRET!;
const CRON_SECRET      = process.env.CRON_SECRET ?? "cron_7business";
const RENEW_DAYS_AHEAD = 7;  // renova se faltam <= 7 dias

type RenewResult = {
  userId:      string;
  displayPhone: string | null;
  status:      "renewed" | "permanent" | "failed" | "skipped";
  daysAdded?:  number;
  error?:      string;
};

export async function GET(req: NextRequest) {
  // ── Autenticação do cron ────────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const db      = getSupabase();
  const results: RenewResult[] = [];

  // ── Busca usuários com token prestes a vencer (ou já vencido) ───────────────
  const threshold = new Date(Date.now() + RENEW_DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString();

  const { data: users, error: fetchErr } = await db
    .from("users")
    .select("id, whatsapp_token, token_expires_at, display_phone")
    .not("whatsapp_token", "is", null)      // só usuários conectados
    .not("token_expires_at", "is", null)    // tokens permanentes (null) são ignorados
    .lte("token_expires_at", threshold);    // expira nos próximos 7 dias

  if (fetchErr) {
    console.error("[Cron] Erro ao buscar usuários:", fetchErr.message);
    return NextResponse.json({ error: "Erro ao buscar usuários" }, { status: 500 });
  }

  if (!users || users.length === 0) {
    console.log("[Cron] ✅ Nenhum token precisando renovação.");
    return NextResponse.json({ renewed: 0, results: [] });
  }

  console.log(`[Cron] 🔄 ${users.length} token(s) para renovar...`);

  // ── Renova cada token ────────────────────────────────────────────────────────
  for (const user of users) {
    const result: RenewResult = {
      userId:       user.id,
      displayPhone: user.display_phone ?? null,
      status:       "skipped",
    };

    try {
      const res = await fetch(
        `${GRAPH}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}` +
        `&fb_exchange_token=${user.whatsapp_token}`,
        { signal: AbortSignal.timeout(10000) }
      );

      const data = await res.json() as {
        access_token?: string;
        expires_in?:   number;
        error?:        { message: string; code: number };
      };

      if (!res.ok || data.error) {
        // Código 190 = token inválido/revogado — limpa do banco
        if (data.error?.code === 190) {
          await db
            .from("users")
            .update({ whatsapp_token: null, token_expires_at: null, phone_number_id: null })
            .eq("id", user.id);
          result.status = "failed";
          result.error  = "Token revogado pelo usuário — desconectado.";
          console.warn(`[Cron] ⚠️ userId ${user.id}: token revogado, limpando.`);
        } else {
          result.status = "failed";
          result.error  = data.error?.message ?? "Erro desconhecido na Meta API";
          console.error(`[Cron] ❌ userId ${user.id}: ${result.error}`);
        }
        results.push(result);
        continue;
      }

      if (!data.access_token) {
        result.status = "failed";
        result.error  = "Meta não retornou novo token";
        results.push(result);
        continue;
      }

      const expiresIn = data.expires_in ?? 5184000; // 60 dias fallback
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      await db
        .from("users")
        .update({ whatsapp_token: data.access_token, token_expires_at: expiresAt })
        .eq("id", user.id);

      result.status   = "renewed";
      result.daysAdded = Math.floor(expiresIn / 86400);
      console.log(`[Cron] ✅ userId ${user.id} renovado — +${result.daysAdded} dias`);

    } catch (e) {
      result.status = "failed";
      result.error  = e instanceof Error ? e.message : "Timeout";
      console.error(`[Cron] ❌ userId ${user.id}: ${result.error}`);
    }

    results.push(result);
  }

  const renewed = results.filter(r => r.status === "renewed").length;
  const failed  = results.filter(r => r.status === "failed").length;

  console.log(`[Cron] 🏁 Concluído: ${renewed} renovados, ${failed} falhas.`);

  return NextResponse.json({
    renewed,
    failed,
    total:   users.length,
    results,
    ran_at:  new Date().toISOString(),
  });
}
