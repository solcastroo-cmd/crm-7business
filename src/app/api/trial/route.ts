import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseClient";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("users")
    .select("trial_ends_at, plan_status, plan")
    .eq("id", userId)
    .single();

  if (!data) return NextResponse.json({ status: "active", days_left: null });

  // Plano pago ativo ou sem trial definido = acesso liberado
  if (data.plan === "pro" || data.plan_status === "active" || !data.trial_ends_at) {
    return NextResponse.json({ status: "active", days_left: null });
  }

  const msLeft = new Date(data.trial_ends_at).getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / 86_400_000);

  if (daysLeft <= 0) {
    return NextResponse.json({ status: "expired", days_left: 0 });
  }

  return NextResponse.json({
    status: "trial",
    days_left: daysLeft,
    trial_ends_at: data.trial_ends_at,
  });
}
