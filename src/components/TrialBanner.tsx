"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TrialInfo = {
  status: "trial" | "active" | "expired";
  days_left: number | null;
};

const WHATSAPP_VENDAS = "5585992041818";

export function TrialBanner() {
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const router = useRouter();

  useEffect(() => {
    const userId = localStorage.getItem("crm_userId");
    if (!userId) return;

    fetch(`/api/trial?userId=${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: TrialInfo | null) => {
        if (!data) return;
        setTrial(data);
        if (data.status === "expired") {
          router.replace("/pricing?expired=1");
        }
      })
      .catch(() => {});
  }, [router]);

  if (!trial || trial.status === "active" || trial.status === "expired") return null;
  if ((trial.days_left ?? 99) > 3) return null;

  const isLastDay = (trial.days_left ?? 0) <= 1;

  return (
    <div style={{
      background: isLastDay ? "#7f1d1d" : "#78350f",
      borderBottom: `1px solid ${isLastDay ? "#ef4444" : "#f59e0b"}`,
      padding: "10px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      flexWrap: "wrap",
    }}>
      <span style={{ color: "#fff", fontSize: "14px", fontWeight: 600 }}>
        {isLastDay
          ? "⚠️ Seu trial expira hoje! Assine agora para não perder o acesso."
          : `⏳ Seu período de teste termina em ${trial.days_left} dias.`}
      </span>
      <div style={{ display: "flex", gap: "8px" }}>
        <a
          href={`https://wa.me/${WHATSAPP_VENDAS}?text=Olá!%20Quero%20assinar%20o%20CRM%207Business.`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: "#25d366",
            color: "#fff",
            padding: "6px 14px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Assinar via WhatsApp
        </a>
        <a
          href="/pricing"
          style={{
            background: "transparent",
            color: "#fff",
            padding: "6px 14px",
            borderRadius: "8px",
            fontSize: "13px",
            border: "1px solid rgba(255,255,255,0.3)",
            textDecoration: "none",
          }}
        >
          Ver planos
        </a>
      </div>
    </div>
  );
}
