/**
 * POST /api/stripe/checkout
 * Cria uma Stripe Checkout Session e retorna a URL de pagamento.
 */
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm-7business-production.up.railway.app";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) return NextResponse.json({ error: "STRIPE_PRICE_ID não configurado" }, { status: 500 });

    /* Busca dados do usuário */
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("email, business_name, stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    /* Reutiliza ou cria customer Stripe */
    let customerId: string | undefined = user.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email   ?? undefined,
        name:     user.business_name ?? undefined,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    /* Cria Checkout Session */
    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode:                 "subscription",
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 7,
        metadata: { supabase_user_id: userId },
      },
      metadata: { supabase_user_id: userId },
      success_url: `${APP_URL}/pricing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/pricing?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar sessão";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
