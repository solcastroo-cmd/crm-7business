"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useUserId } from "@/hooks/useUserId";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Cliente = {
  id: string;
  name: string | null;
  phone: string;
  seller: string | null;
  source: string | null;
  updated_at: string;
  budget: string | null;
  notes: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function waLink(phone: string) {
  const clean = phone.replace(/\D/g, "");
  return `https://wa.me/${clean.startsWith("55") ? clean : "55" + clean}`;
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const { userId } = useUserId();

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("leads")
      .select("id,name,phone,seller,source,updated_at,budget,notes")
      .eq("store_id", userId)
      .eq("stage", "VENDIDO!")
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setClientes((data as Cliente[]) ?? []);
        setLoading(false);
      });
  }, [userId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return clientes;
    const q = search.toLowerCase();
    return clientes.filter(c =>
      (c.name ?? "").toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.seller ?? "").toLowerCase().includes(q)
    );
  }, [clientes, search]);

  return (
    <main style={{ minHeight: "100vh", background: "#1a1a1a", padding: "28px 24px", fontFamily: "Segoe UI, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: 800, margin: 0 }}>👥 Clientes</h1>
        <p style={{ color: "#6b7280", fontSize: "13px", marginTop: "4px" }}>
          Leads fechados — {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: "20px", maxWidth: "420px" }}>
        <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: "13px" }}>🔍</span>
        <input
          type="text"
          placeholder="Buscar por nome, telefone ou vendedor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", padding: "9px 12px 9px 36px", boxSizing: "border-box",
            background: "#232323", border: "1px solid #333", borderRadius: "10px",
            color: "#fff", fontSize: "13px", outline: "none",
          }}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ color: "#555", fontSize: "14px", textAlign: "center", paddingTop: "60px" }}>
          Carregando clientes...
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", paddingTop: "60px" }}>
          <p style={{ color: "#555", fontSize: "14px" }}>
            {search ? "Nenhum cliente encontrado." : "Nenhum lead marcado como VENDIDO! ainda."}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div style={{ background: "#232323", borderRadius: "14px", border: "1px solid #2a2a2a", overflow: "hidden" }}>
          {/* Head */}
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1.4fr 1.2fr 1fr 120px",
            padding: "10px 20px", background: "#1e1e1e",
            borderBottom: "1px solid #2a2a2a",
          }}>
            {["Cliente", "Telefone", "Vendedor", "Data", ""].map(h => (
              <span key={h} style={{ color: "#555", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1.4fr 1.2fr 1fr 120px",
                padding: "14px 20px", alignItems: "center",
                borderBottom: i < filtered.length - 1 ? "1px solid #2a2a2a" : "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#282828")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div>
                <span style={{ color: "#fff", fontSize: "14px", fontWeight: 600 }}>{c.name || "Sem nome"}</span>
                {c.source && (
                  <span style={{ marginLeft: "8px", fontSize: "10px", color: "#555", background: "#2a2a2a", padding: "1px 6px", borderRadius: "999px" }}>
                    {c.source}
                  </span>
                )}
              </div>
              <span style={{ color: "#9ca3af", fontSize: "13px" }}>{c.phone}</span>
              <span style={{ color: "#9ca3af", fontSize: "13px" }}>{c.seller || "—"}</span>
              <span style={{ color: "#6b7280", fontSize: "12px" }}>{fmtDate(c.updated_at)}</span>
              <a
                href={waLink(c.phone)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "5px",
                  background: "#25d366", color: "#fff",
                  padding: "5px 12px", borderRadius: "8px",
                  fontSize: "12px", fontWeight: 700, textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                💬 WhatsApp
              </a>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
