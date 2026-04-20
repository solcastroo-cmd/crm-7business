"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const WHATSAPP_VENDAS = "5585988887777"; // substituir pelo número real de vendas
const PRECO_MENSAL = "R$ 197";
const PRECO_ANUAL  = "R$ 1.697";

const FEATURES = [
  "Funil de leads ilimitado (Kanban)",
  "Integração WhatsApp (Z-API / Evolution)",
  "IA para qualificação automática de leads",
  "Gestão de estoque de veículos",
  "Dashboard com analytics em tempo real",
  "Integração OLX, Webmotors, iCarros",
  "Integração Facebook Lead Ads",
  "Múltiplos vendedores",
  "Suporte via WhatsApp",
];

function PricingContent() {
  const params = useSearchParams();
  const expired = params.get("expired") === "1";

  const waLink = `https://wa.me/${WHATSAPP_VENDAS}?text=Olá!%20Quero%20assinar%20o%20CRM%207Business%20(Plano%20Pro).`;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1a1a",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "Segoe UI, sans-serif",
      padding: "40px 20px",
    }}>
      {/* Expirado */}
      {expired && (
        <div style={{
          background: "#2a0a0a",
          border: "1px solid #e63946",
          color: "#fca5a5",
          borderRadius: "12px",
          padding: "16px 24px",
          marginBottom: "32px",
          fontSize: "15px",
          textAlign: "center",
          maxWidth: "480px",
          width: "100%",
        }}>
          ⏰ <strong>Seu período de teste encerrou.</strong><br />
          Assine o plano Pro para continuar usando o CRM 7Business.
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <div style={{
          width: "56px", height: "56px",
          background: "#e63946",
          borderRadius: "14px",
          margin: "0 auto 16px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "26px", fontWeight: 900, color: "#fff",
        }}>7</div>
        <h1 style={{ color: "#fff", fontSize: "28px", fontWeight: 800, margin: "0 0 8px" }}>
          CRM 7Business — Plano Pro
        </h1>
        <p style={{ color: "#888", fontSize: "15px", margin: 0 }}>
          Tudo que sua loja de veículos precisa para vender mais.
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: "#232323",
        border: "2px solid #e63946",
        borderRadius: "20px",
        padding: "40px",
        width: "100%",
        maxWidth: "440px",
        boxShadow: "0 30px 80px rgba(230,57,70,0.15)",
      }}>
        {/* Preço */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ color: "#888", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
            PLANO PRO
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "4px" }}>
            <span style={{ color: "#fff", fontSize: "48px", fontWeight: 800, lineHeight: 1 }}>
              {PRECO_MENSAL}
            </span>
            <span style={{ color: "#888", fontSize: "14px", marginBottom: "8px" }}>/mês</span>
          </div>
          <div style={{ color: "#10b981", fontSize: "13px", marginTop: "6px" }}>
            ou {PRECO_ANUAL}/ano (2 meses grátis)
          </div>
        </div>

        {/* Features */}
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px" }}>
          {FEATURES.map(f => (
            <li key={f} style={{
              display: "flex", alignItems: "center", gap: "10px",
              color: "#d1d5db", fontSize: "14px",
              padding: "8px 0",
              borderBottom: "1px solid #333",
            }}>
              <span style={{ color: "#10b981", fontWeight: 700, flexShrink: 0 }}>✓</span>
              {f}
            </li>
          ))}
        </ul>

        {/* CTA WhatsApp */}
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            width: "100%",
            padding: "14px",
            background: "#25d366",
            color: "#fff",
            borderRadius: "12px",
            fontWeight: 700,
            fontSize: "16px",
            textDecoration: "none",
            marginBottom: "12px",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Contratar via WhatsApp
        </a>

        <p style={{ color: "#555", fontSize: "12px", textAlign: "center", margin: 0 }}>
          Pagamento via PIX ou cartão de crédito • Sem taxa de setup
        </p>
      </div>

      {/* Voltar */}
      <a
        href="/dashboard"
        style={{ color: "#555", fontSize: "13px", marginTop: "24px", textDecoration: "none" }}
      >
        ← Voltar ao dashboard
      </a>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense>
      <PricingContent />
    </Suspense>
  );
}
