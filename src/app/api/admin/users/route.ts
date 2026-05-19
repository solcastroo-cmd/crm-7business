/**
 * GET /api/admin/users
 * Retorna todos os usuários da plataforma.
 * Protegido: só admin pode acessar (is_admin = true).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Valida admin via userId passado como query param
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data: caller } = await supabaseAdmin
    .from("users")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (!caller?.is_admin) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select(`
      id,
      email,
      business_name,
      plan,
      plan_status,
      trial_ends_at,
      stripe_customer_id,
      stripe_subscription_id,
      is_admin,
      created_at
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users });
}
