"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type User = {
  id: string;
  email: string | null;
  business_name: string | null;
  plan: string | null;
  plan_status: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  is_admin: boolean;
  created_at: string;
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  active:         { bg: "#022c22", color: "#10b981", label: "Ativo" },
  trial:          { bg: "#1e1b4b", color: "#818cf8", label: "Trial" },
  expired:        { bg: "#2a0a0a", color: "#f87171", label: "Expirado" },
  canceled:       { bg: "#1c1917", color: "#f59e0b", label: "Cancelado" },
  payment_failed: { bg: "#2a1500", color: "#fb923c", label: "Pgto Falhou" },
};

function statusStyle(status: string | null) {
  return STATUS_STYLE[status ?? ""] ?? { bg: "#1f2937", color: "#9ca3af", label: status ?? "—" };
}

function planBadge(plan: string | null) {
  if (plan === "pro") return { bg: "#e63946", label: "PRO" };
  return { bg: "#374151", label: (plan ?? "—").toUpperCase() };
}

function daysLeft(trialEndsAt: string | null): string {
  if (!trialEndsAt) return "—";
  const d = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000);
  if (d <= 0) return "Expirado";
  return `${d}d`;
}

export default function AdminPage() {
  const router = useRouter();
  const [userId, setUserId]   = useState<string | null>(null);
  const [users, setUsers]     = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<string>("all");
  const [search, setSearch]   = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      const r = await fetch(`/api/admin/users?userId=${data.user.id}`);
      if (r.status === 403) { router.push("/"); return; }
      if (r.ok) {
        const d = await r.json();
        setUsers(d.users ?? []);
      }
      setLoading(false);
    });
  }, [router]);

  // Métricas
  const total    = users.length;
  const active   = users.filter(u => u.plan === "pro" && u.plan_status === "active").length;
  const trial    = users.filter(u => u.plan_status === "trial" || (!u.plan_status && u.trial_ends_at && new Date(u.trial_ends_at) > new Date())).length;
  const canceled = users.filter(u => u.plan_status === "canceled").length;
  const failed   = users.filter(u => u.plan_status === "payment_failed").length;
  const MRR      = active * 197;

  const filtered = users.filter(u => {
    const matchFilter =
      filter === "all"      ? true :
      filter === "active"   ? (u.plan === "pro" && u.plan_status === "active") :
      filter === "trial"    ? (u.plan_status === "trial" || (!u.plan_status && !!u.trial_ends_at)) :
      filter === "canceled" ? u.plan_status === "canceled" :
      filter === "failed"   ? u.plan_status === "payment_failed" : true;

    const q = search.toLowerCase();
    const matchSearch = !q
      || (u.email ?? "").toLowerCase().includes(q)
      || (u.business_name ?? "").toLowerCase().includes(q);

    return matchFilter && matchSearch;
  });

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#111827", display: "flex",
        alignItems: "center", justifyContent: "center", color: "#fff" }}>
        Carregando...
      </div>
    );
  }

  const cards = [
    { label: "Total de lojas",    value: total,            icon: "🏪", color: "#6366f1" },
    { label: "Assinantes Pro",    value: active,           icon: "✅", color: "#10b981" },
    { label: "Em Trial",          value: trial,            icon: "⏳", color: "#818cf8" },
    { label: "Cancelados",        value: canceled + failed, icon: "❌", color: "#f87171" },
    { label: "MRR",               value: `R$ ${MRR.toLocaleString("pt-BR")}`, icon: "💰", color: "#f59e0b" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#111827", padding: "32px 24px",
      fontFamily: "Segoe UI, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>👑</span>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 800, margin: 0 }}>
            Admin — CRM 7Business
          </h1>
        </div>
        <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
          Visão geral de todos os clientes da plataforma
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 16, marginBottom: 32 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: "#1f2937", borderRadius: 14,
            padding: "20px 16px", border: `1px solid ${c.color}22` }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ color: c.color, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
              {c.value}
            </div>
            <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros e busca */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap",
        alignItems: "center" }}>
        {[
          ["all",      "Todos"],
          ["active",   "Ativos"],
          ["trial",    "Trial"],
          ["canceled", "Cancelados"],
          ["failed",   "Pgto Falhou"],
        ].map(([val, lbl]) => (
          <button key={val} onClick={() => setFilter(val)}
            style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: "pointer", border: "1px solid",
              background: filter === val ? "#e63946" : "transparent",
              borderColor: filter === val ? "#e63946" : "#374151",
              color: filter === val ? "#fff" : "#9ca3af" }}>
            {lbl}
          </button>
        ))}

        <input
          placeholder="Buscar por email ou loja..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 8, fontSize: 13,
            background: "#1f2937", border: "1px solid #374151", color: "#fff",
            outline: "none", minWidth: 240 }}
        />
      </div>

      {/* Tabela */}
      <div style={{ background: "#1f2937", borderRadius: 16, border: "1px solid #374151",
        overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#111827" }}>
              {["Loja / Email", "Plano", "Status", "Trial restante", "Stripe ID", "Cadastro"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11,
                  fontWeight: 700, color: "#6b7280", textTransform: "uppercase",
                  letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 32, color: "#4b5563" }}>
                  Nenhum resultado encontrado
                </td>
              </tr>
            )}
            {filtered.map((u, i) => {
              const ss = statusStyle(u.plan_status);
              const pb = planBadge(u.plan);
              return (
                <tr key={u.id}
                  style={{ borderTop: i === 0 ? "none" : "1px solid #374151",
                    transition: "background .15s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 14 }}>
                      {u.business_name ?? <span style={{ color: "#4b5563" }}>Sem nome</span>}
                      {u.is_admin && <span style={{ marginLeft: 6, fontSize: 11,
                        background: "#7c3aed", color: "#fff", borderRadius: 4,
                        padding: "1px 5px" }}>admin</span>}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>
                      {u.email ?? u.id.slice(0, 8) + "..."}
                    </div>
                  </td>

                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ background: pb.bg, color: "#fff", borderRadius: 6,
                      padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                      {pb.label}
                    </span>
                  </td>

                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ background: ss.bg, color: ss.color, borderRadius: 6,
                      padding: "3px 8px", fontSize: 12, fontWeight: 600 }}>
                      {ss.label}
                    </span>
                  </td>

                  <td style={{ padding: "14px 16px", color: "#9ca3af", fontSize: 13 }}>
                    {daysLeft(u.trial_ends_at)}
                  </td>

                  <td style={{ padding: "14px 16px" }}>
                    {u.stripe_customer_id ? (
                      <a href={`https://dashboard.stripe.com/customers/${u.stripe_customer_id}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ color: "#6366f1", fontSize: 12, textDecoration: "none",
                          fontFamily: "monospace" }}>
                        {u.stripe_customer_id.slice(0, 14)}…
                      </a>
                    ) : (
                      <span style={{ color: "#374151", fontSize: 12 }}>—</span>
                    )}
                  </td>

                  <td style={{ padding: "14px 16px", color: "#6b7280", fontSize: 12,
                    whiteSpace: "nowrap" }}>
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ color: "#374151", fontSize: 12, marginTop: 16, textAlign: "center" }}>
        {filtered.length} de {total} lojas
      </p>
    </div>
  );
}
