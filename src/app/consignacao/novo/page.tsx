"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

const EMPTY = {
  proprietario_nome: "", proprietario_nacionalidade: "Brasileiro(a)",
  proprietario_estado_civil: "", proprietario_profissao: "",
  proprietario_rg: "", proprietario_cpf_cnpj: "",
  proprietario_endereco: "", proprietario_telefone: "", proprietario_email: "",
  loja_razao_social: "PHD Motors", loja_nome_fantasia: "PHD Motors",
  loja_cnpj: "", loja_responsavel: "",
  veiculo_marca: "", veiculo_modelo: "", veiculo_versao: "",
  veiculo_ano_fabricacao: "", veiculo_ano_modelo: "",
  veiculo_placa: "", veiculo_chassi: "", veiculo_renavam: "",
  veiculo_cor: "", veiculo_combustivel: "", veiculo_km_atual: "",
  valor_minimo_venda: "", percentual_comissao: "5",
  data_inicio: "", data_final: "", taxa_retirada: "",
  vistoria_pintura: "", vistoria_pneus: "", vistoria_interior: "",
  observacoes_vistoria: "",
  cidade_foro: "Fortaleza", data_assinatura: "",
  status: "ativo",
};

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "#111",
  border: "1px solid #333", borderRadius: 10, color: "#fff",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};
const lbl: React.CSSProperties = { display: "block", color: "#777", fontSize: 12, fontWeight: 600, marginBottom: 6 };
const section: React.CSSProperties = { background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 16, padding: 24, marginBottom: 16 };
const sTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 };

const COND = ["Ótima", "Boa", "Regular", "Ruim"];
const COMB = ["Gasolina", "Etanol", "Flex", "Diesel", "Elétrico", "Híbrido", "GNV"];

export default function NovoConsignacaoPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm]     = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) { router.push("/login"); return; }
      setUserId(data.user.id);
    });
  }, [router]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const F = ({ label, name, type = "text", placeholder = "", full = false, as = "input", options = [] as string[] }) => (
    <div style={full ? { gridColumn: "1/-1" } : {}}>
      <label style={lbl}>{label}</label>
      {as === "select" ? (
        <select value={(form as Record<string, string>)[name]} onChange={e => set(name, e.target.value)} style={{ ...inp, appearance: "none" }}>
          <option value="">— Selecione —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : as === "textarea" ? (
        <textarea value={(form as Record<string, string>)[name]} onChange={e => set(name, e.target.value)}
          rows={3} style={{ ...inp, resize: "vertical" }} placeholder={placeholder} />
      ) : (
        <input type={type} value={(form as Record<string, string>)[name]} onChange={e => set(name, e.target.value)}
          style={inp} placeholder={placeholder} />
      )}
    </div>
  );

  async function handleSave() {
    if (!userId) return;
    setErr(null); setSaving(true);
    const payload = {
      userId,
      ...form,
      veiculo_ano_fabricacao: form.veiculo_ano_fabricacao ? parseInt(form.veiculo_ano_fabricacao) : null,
      veiculo_ano_modelo:     form.veiculo_ano_modelo     ? parseInt(form.veiculo_ano_modelo)     : null,
      veiculo_km_atual:       form.veiculo_km_atual       ? parseInt(form.veiculo_km_atual)       : null,
      valor_minimo_venda:     form.valor_minimo_venda     ? parseFloat(form.valor_minimo_venda.replace(/\./g, "").replace(",", ".")) : null,
      percentual_comissao:    form.percentual_comissao    ? parseFloat(form.percentual_comissao)  : null,
      taxa_retirada:          form.taxa_retirada          ? parseFloat(form.taxa_retirada.replace(/\./g, "").replace(",", ".")) : null,
      data_inicio:     form.data_inicio     || null,
      data_final:      form.data_final      || null,
      data_assinatura: form.data_assinatura || null,
    };
    const r = await fetch("/api/consignacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) { setErr(d.error ?? "Erro ao salvar"); return; }
    router.push(`/consignacao/${d.id}`);
  }

  return (
    <div style={{ padding: "28px 24px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.push("/consignacao")}
          style={{ background: "transparent", border: "1px solid #333", borderRadius: 8, padding: "6px 14px", color: "#9ca3af", cursor: "pointer", fontSize: 13 }}>
          ← Voltar
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>Novo Contrato de Consignação</h1>
      </div>

      {/* 1. Consignante */}
      <div style={section}>
        <p style={sTitle}>1. Consignante — Proprietário do Veículo</p>
        <div style={{ ...grid2, marginBottom: 12 }}>
          <F label="Nome / Razão Social *" name="proprietario_nome" placeholder="Nome completo" />
          <F label="Telefone" name="proprietario_telefone" placeholder="(00) 00000-0000" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="Nacionalidade" name="proprietario_nacionalidade" />
          <F label="Estado Civil" name="proprietario_estado_civil" as="select" options={["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União Estável"]} />
          <F label="Profissão" name="proprietario_profissao" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="RG" name="proprietario_rg" placeholder="0000000" />
          <F label="CPF / CNPJ" name="proprietario_cpf_cnpj" placeholder="000.000.000-00" />
          <F label="E-mail" name="proprietario_email" type="email" placeholder="email@exemplo.com" />
        </div>
        <F label="Endereço completo" name="proprietario_endereco" placeholder="Rua, nº, bairro, cidade - UF" full />
      </div>

      {/* 2. Consignatária */}
      <div style={section}>
        <p style={sTitle}>2. Consignatária — Loja</p>
        <div style={{ ...grid2, marginBottom: 12 }}>
          <F label="Razão Social" name="loja_razao_social" />
          <F label="Nome Fantasia" name="loja_nome_fantasia" />
        </div>
        <div style={grid2}>
          <F label="CNPJ" name="loja_cnpj" placeholder="00.000.000/0001-00" />
          <F label="Representante Legal" name="loja_responsavel" placeholder="Nome do responsável" />
        </div>
      </div>

      {/* 3. Veículo */}
      <div style={section}>
        <p style={sTitle}>3. Dados do Veículo</p>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="Marca" name="veiculo_marca" placeholder="Ex: Toyota" />
          <F label="Modelo" name="veiculo_modelo" placeholder="Ex: Corolla" />
          <F label="Versão" name="veiculo_versao" placeholder="Ex: XEI 2.0" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="Ano Fabricação" name="veiculo_ano_fabricacao" type="number" placeholder="2020" />
          <F label="Ano Modelo" name="veiculo_ano_modelo" type="number" placeholder="2021" />
          <F label="Placa" name="veiculo_placa" placeholder="ABC-1234" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="Chassi" name="veiculo_chassi" placeholder="9BWZZZ377VT004251" />
          <F label="Renavam" name="veiculo_renavam" placeholder="00000000000" />
          <F label="Quilometragem" name="veiculo_km_atual" type="number" placeholder="45000" />
        </div>
        <div style={grid2}>
          <F label="Cor" name="veiculo_cor" placeholder="Prata" />
          <F label="Combustível" name="veiculo_combustivel" as="select" options={COMB} />
        </div>
      </div>

      {/* 4. Valor e Comissão */}
      <div style={section}>
        <p style={sTitle}>4. Valor e Comissão</p>
        <div style={grid2}>
          <F label="Valor mínimo de venda (R$)" name="valor_minimo_venda" placeholder="50.000,00" />
          <F label="Comissão da loja (%)" name="percentual_comissao" type="number" placeholder="5" />
        </div>
        {form.valor_minimo_venda && form.percentual_comissao && (
          <p style={{ color: "#10b981", fontSize: 13, marginTop: 10 }}>
            💰 Comissão estimada: R$ {(parseFloat(form.valor_minimo_venda.replace(/\./g,"").replace(",",".") || "0") * parseFloat(form.percentual_comissao) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>

      {/* 5. Prazo */}
      <div style={section}>
        <p style={sTitle}>5. Prazo do Contrato</p>
        <div style={grid3}>
          <F label="Data de início" name="data_inicio" type="date" />
          <F label="Data final" name="data_final" type="date" />
          <F label="Taxa de retirada antecipada (R$)" name="taxa_retirada" placeholder="500,00" />
        </div>
      </div>

      {/* 6. Vistoria */}
      <div style={section}>
        <p style={sTitle}>6. Vistoria do Veículo</p>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="Pintura" name="vistoria_pintura" as="select" options={COND} />
          <F label="Pneus" name="vistoria_pneus" as="select" options={COND} />
          <F label="Interior" name="vistoria_interior" as="select" options={COND} />
        </div>
        <F label="Observações da vistoria" name="observacoes_vistoria" as="textarea" full placeholder="Detalhes sobre o estado do veículo, avarias, acessórios etc." />
        <p style={{ color: "#6b7280", fontSize: 12, marginTop: 12 }}>
          📸 Fotos de vistoria podem ser adicionadas após salvar o contrato.
        </p>
      </div>

      {/* 7. Foro */}
      <div style={section}>
        <p style={sTitle}>7. Foro e Assinatura</p>
        <div style={grid2}>
          <F label="Cidade do Foro" name="cidade_foro" />
          <F label="Data de assinatura" name="data_assinatura" type="date" />
        </div>
      </div>

      {/* Status */}
      <div style={section}>
        <p style={sTitle}>Status</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["ativo","vendido","retirado","vencido"].map(s => (
            <button key={s} onClick={() => set("status", s)}
              style={{
                padding: "8px 18px", borderRadius: 20, border: "1px solid",
                borderColor: form.status === s ? "#dc2626" : "#2e2e2e",
                background: form.status === s ? "#dc262620" : "transparent",
                color: form.status === s ? "#f87171" : "#9ca3af",
                fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "capitalize",
              }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {err && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>⚠ {err}</p>}

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button onClick={() => router.push("/consignacao")}
          style={{ padding: "12px 24px", borderRadius: 10, border: "1px solid #333", background: "transparent", color: "#9ca3af", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: saving ? "#444" : "#dc2626", color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Salvando..." : "Salvar Contrato"}
        </button>
      </div>
    </div>
  );
}
