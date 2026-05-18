/**
 * POST /api/stripe/webhook
 * Recebe eventos Stripe e atualiza o plano do usuário no Supabase.
 *
 * Eventos tratados:
 *   checkout.session.completed     → plano ativo
 *   customer.subscription.updated  → atualiza status
 *   customer.subscription.deleted  → cancela acesso
 *   invoice.payment_failed         → marca pagamento falho
 */
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

/* Busca userId pelo stripe_customer_id */
async function getUserIdByCustomer(customerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}

async function activatePlan(userId: string, subscriptionId: string) {
  await supabaseAdmin.from("users").update({
    plan:                    "pro",
    plan_status:             "active",
    stripe_subscription_id:  subscriptionId,
    trial_ends_at:           null,
  }).eq("id", userId);
}

async function cancelPlan(userId: string) {
  await supabaseAdmin.from("users").update({
    plan:        "starter",
    plan_status: "canceled",
  }).eq("id", userId);
}

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  const secret    = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (e) {
    console.error("[Stripe Webhook] Assinatura inválida:", e);
    return NextResponse.json({ error: "Webhook inválido" }, { status: 400 });
  }

  console.log(`[Stripe Webhook] ${event.type}`);

  try {
    switch (event.type) {

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const userId = session.metadata?.supabase_user_id
          ?? await getUserIdByCustomer(session.customer as string);
        if (!userId) break;
        const subId = session.subscription as string;
        await activatePlan(userId, subId);
        console.log(`[Stripe] Plano ativado: ${userId}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id
          ?? await getUserIdByCustomer(sub.customer as string);
        if (!userId) break;

        if (sub.status === "active" || sub.status === "trialing") {
          await activatePlan(userId, sub.id);
        } else if (["canceled", "unpaid", "past_due"].includes(sub.status)) {
          await cancelPlan(userId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id
          ?? await getUserIdByCustomer(sub.customer as string);
        if (!userId) break;
        await cancelPlan(userId);
        console.log(`[Stripe] Plano cancelado: ${userId}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const userId  = await getUserIdByCustomer(invoice.customer as string);
        if (!userId) break;
        await supabaseAdmin.from("users").update({ plan_status: "payment_failed" }).eq("id", userId);
        console.log(`[Stripe] Pagamento falhou: ${userId}`);
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("[Stripe Webhook] Erro ao processar evento:", e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
