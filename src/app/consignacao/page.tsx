"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

type Photo = { id: string; url: string; label: string };
type Contract = {
  id: string;
  proprietario_nome: string;
  veiculo_marca: string;
  veiculo_modelo: string;
  veiculo_placa: string;
  veiculo_ano_modelo: number;
  valor_minimo_venda: number;
  percentual_comissao: number;
  data_inicio: string;
  data_final: string;
  status: string;
  created_at: string;
  consignment_photos: Photo[];
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ativo:    { label: "Ativo",    color: "#10b981", bg: "#10b98120" },
  vendido:  { label: "Vendido",  color: "#3b82f6", bg: "#3b82f620" },
  retirado: { label: "Retirado", color: "#f59e0b", bg: "#f59e0b20" },
  vencido:  { label: "Vencido",  color: "#ef4444", bg: "#ef444420" },
};

const fmt = (v: number) => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function isExpiringSoon(dataFinal: string) {
  if (!dataFinal) return false;
  const diff = (new Date(dataFinal).getTime() - Date.now()) / 86400000;
  return diff >= 0 && diff <= 7;
}

export default function ConsignacaoPage() {
  const router = useRouter();
  const [userId, setUserId]       = useState<string | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("todos");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      fetch(`/api/consignacao?userId=${data.user.id}`)
        .then(r => r.json())
        .then(d => { setContracts(Array.isArray(d) ? d : []); setLoading(false); });
    });
  }, [router]);

  const filtered = filter === "todos"
    ? contracts
    : contracts.filter(c => c.status === filter);

  const ativos = contracts.filter(c => c.status === "ativo").length;

  const card: React.CSSProperties = {
    background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 16,
    overflow: "hidden", cursor: "pointer", transition: "border-color .2s",
    display: "flex", flexDirection: "column",
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid #dc2626", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#fff", margin: 0 }}>Consignação</h1>
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
            {ativos} contrato{ativos !== 1 ? "s" : ""} ativo{ativos !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => router.push("/consignacao/novo")}
          style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          + Novo Contrato
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {["todos", "ativo", "vendido", "retirado", "vencido"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: "6px 16px", borderRadius: 20, border: "1px solid",
              borderColor: filter === f ? "#dc2626" : "#2e2e2e",
              background: filter === f ? "#dc262620" : "transparent",
              color: filter === f ? "#f87171" : "#9ca3af",
              fontSize: 13, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
            }}>
            {f === "todos" ? "Todos" : STATUS_CFG[f]?.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#4b5563" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#6b7280" }}>Nenhum contrato encontrado</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Clique em "Novo Contrato" para cadastrar o primeiro.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {filtered.map(c => {
            const foto = c.consignment_photos?.[0]?.url;
            const cfg  = STATUS_CFG[c.status] ?? STATUS_CFG.ativo;
            const expiring = c.status === "ativo" && isExpiringSoon(c.data_final);
            return (
              <div key={c.id} style={card}
                onClick={() => router.push(`/consignacao/${c.id}`)}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "#dc2626"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "#2e2e2e"}>

                {/* Foto */}
                <div style={{ height: 160, background: "#111", position: "relative", overflow: "hidden" }}>
                  {foto
                    ? <img src={foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 40, color: "#333" }}>🚗</div>
                  }
                  <div style={{ position: "absolute", top: 8, right: 8, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                  </div>
                  {expiring && (
                    <div style={{ position: "absolute", top: 8, left: 8, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#f59e0b20", color: "#f59e0b" }}>
                      ⚠ Vence em breve
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "#fff", margin: 0 }}>
                    {c.veiculo_marca} {c.veiculo_modelo} {c.veiculo_ano_modelo ? `(${c.veiculo_ano_modelo})` : ""}
                  </p>
                  {c.veiculo_placa && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", background: "#222", border: "1px solid #333", borderRadius: 6, padding: "2px 8px", display: "inline-block", width: "fit-content" }}>
                      {c.veiculo_placa}
                    </span>
                  )}
                  <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                    👤 {c.proprietario_nome || "Proprietário não informado"}
                  </p>
                  {c.valor_minimo_venda && (
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#10b981", margin: 0 }}>
                      {fmt(c.valor_minimo_venda)}
                      {c.percentual_comissao ? <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}> · {c.percentual_comissao}% comissão</span> : null}
                    </p>
                  )}
                  {c.data_final && (
                    <p style={{ fontSize: 11, color: expiring ? "#f59e0b" : "#6b7280", margin: 0 }}>
                      Vence: {new Date(c.data_final + "T12:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: "#4b5563", margin: "4px 0 0" }}>
                    📸 {c.consignment_photos?.length ?? 0} foto{(c.consignment_photos?.length ?? 0) !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
