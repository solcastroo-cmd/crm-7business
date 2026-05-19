/**
 * POST /api/onboarding
 * Finaliza o onboarding: salva dados da loja, credenciais Z-API e ativa o agente Paulo.
 * Envia email de boas-vindas após configuração.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      business_name,
      notify_phone,
      zapi_instance,
      zapi_token,
      zapi_client_token,
      zapi_phone,
      ai_name,
    } = body;

    if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

    const agentName = (ai_name ?? "Paulo").trim() || "Paulo";

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .update({
        business_name:     business_name     || null,
        notify_phone:      notify_phone      || null,
        zapi_instance:     zapi_instance     || null,
        zapi_token:        zapi_token        || null,
        zapi_client_token: zapi_client_token || null,
        zapi_phone:        zapi_phone        || null,
        ai_enabled:        true,
        ai_name:           agentName,
        plan:              "trial",
        updated_at:        new Date().toISOString(),
      })
      .eq("id", userId)
      .select("email, business_name")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ── Email de boas-vindas ──────────────────────────────────────────────────
    if (user?.email) {
      const storeName = user.business_name ?? "sua loja";
      const welcomeHtml = `
        <div style="font-family:Segoe UI,sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#fff;border-radius:16px;overflow:hidden">
          <div style="background:#e63946;padding:32px;text-align:center">
            <div style="width:56px;height:56px;background:#fff;border-radius:14px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#e63946;line-height:56px;text-align:center">7</div>
            <h1 style="color:#fff;margin:0;font-size:22px">Bem-vindo ao CRM 7Business!</h1>
          </div>
          <div style="padding:32px">
            <p style="color:#d1d5db;font-size:15px">Olá! <strong style="color:#fff">${storeName}</strong> está configurada e pronta para vender mais.</p>

            <div style="background:#232323;border-radius:12px;padding:20px;margin:20px 0">
              <p style="color:#9ca3af;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">Seu agente <strong style="color:#e63946">${agentName}</strong> está ativo</p>
              <p style="color:#d1d5db;font-size:14px;margin:0">Responde automaticamente no WhatsApp 24h por dia, qualifica leads e avisa você quando aparecer um cliente quente 🔥</p>
            </div>

            <p style="color:#9ca3af;font-size:13px;margin:0 0 8px"><strong style="color:#fff">Próximos passos:</strong></p>
            <ul style="color:#d1d5db;font-size:14px;padding-left:20px;margin:0 0 24px">
              <li style="margin-bottom:6px">🚗 Cadastre seus veículos no Estoque</li>
              <li style="margin-bottom:6px">📱 Envie uma mensagem de teste no seu WhatsApp</li>
              <li style="margin-bottom:6px">📊 Acompanhe seus leads no Funil</li>
            </ul>

            <a href="https://crm-7business-production.up.railway.app" style="display:block;background:#e63946;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px">
              Acessar meu CRM →
            </a>

            <p style="color:#6b7280;font-size:12px;text-align:center;margin:20px 0 0">
              Dúvidas? Fale com a gente: <a href="mailto:7businesscrm@gmail.com" style="color:#e63946">7businesscrm@gmail.com</a>
            </p>
          </div>
        </div>
      `;

      // Envia via Supabase Auth admin (usa SMTP configurado)
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: user.email,
      }).catch(() => null); // silencia erro se falhar — não bloqueia o onboarding

      // Envia email de boas-vindas via fetch para a API de email do Supabase
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-welcome`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify({ to: user.email, subject: `Bem-vindo ao CRM 7Business — ${storeName}`, html: welcomeHtml }),
        }).catch(() => null);
      } catch { /* silencia */ }

      console.log(`[Onboarding] Boas-vindas para ${user.email} — agente: ${agentName}`);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
}
