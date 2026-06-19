"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

const INIT = {
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
const sec: React.CSSProperties = { background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 16, padding: 24, marginBottom: 16 };
const stl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 };
const g2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const g3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 };

const COND = ["Ótima", "Boa", "Regular", "Ruim"];
const COMB = ["Gasolina", "Etanol", "Flex", "Diesel", "Elétrico", "Híbrido", "GNV"];
const EC   = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"];

export default function NovoConsignacaoPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [cep, setCep]       = useState("");
  const [cepLoading, setCepLoading] = useState(false);

  // Estado do formulário — mesmo padrão do settings/page.tsx
  const [form, setForm] = useState({ ...INIT });

  const set = (field: keyof typeof INIT) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) { router.push("/login"); return; }
      setUserId(data.user.id);
    });
  }, [router]);

  const lookupCep = useCallback(async (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    setCep(digits.replace(/(\d{5})(\d{3})/, "$1-$2"));
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await r.json();
      if (!d.erro) {
        const end = [d.logradouro, d.complemento, d.bairro, `${d.localidade} - ${d.uf}`, `CEP: ${digits.replace(/(\d{5})(\d{3})/, "$1-$2")}`].filter(Boolean).join(", ");
        setForm(prev => ({ ...prev, proprietario_endereco: end }));
      }
    } finally { setCepLoading(false); }
  }, []);

  async function handleSave() {
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const f = form;
      const payload = {
        userId, ...f,
        veiculo_ano_fabricacao: f.veiculo_ano_fabricacao ? parseInt(f.veiculo_ano_fabricacao) : null,
        veiculo_ano_modelo:     f.veiculo_ano_modelo     ? parseInt(f.veiculo_ano_modelo)     : null,
        veiculo_km_atual:       f.veiculo_km_atual       ? parseInt(f.veiculo_km_atual)       : null,
        valor_minimo_venda:     f.valor_minimo_venda     ? parseFloat(f.valor_minimo_venda.replace(/\./g, "").replace(",", "."))  : null,
        percentual_comissao:    f.percentual_comissao    ? parseFloat(f.percentual_comissao)  : null,
        taxa_retirada:          f.taxa_retirada          ? parseFloat(f.taxa_retirada.replace(/\./g, "").replace(",", "."))       : null,
        data_inicio:     f.data_inicio     || null,
        data_final:      f.data_final      || null,
        data_assinatura: f.data_assinatura || null,
      };
      const r = await fetch("/api/consignacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Erro ao salvar"); return; }
      router.push(`/consignacao/${d.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro de conexão");
    } finally { setSaving(false); }
  }

  const sel = (field: keyof typeof INIT, options: string[]) => (
    <select value={form[field]} onChange={set(field)} style={{ ...inp, appearance: "none" }}>
      <option value="">— Selecione —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div style={{ padding: "28px 24px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.push("/consignacao")}
          style={{ background: "transparent", border: "1px solid #333", borderRadius: 8, padding: "6px 14px", color: "#9ca3af", cursor: "pointer", fontSize: 13 }}>
          ← Voltar
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>Novo Contrato de Consignação</h1>
      </div>

      {/* 1. Proprietário */}
      <div style={sec}>
        <p style={stl}>1. Consignante — Proprietário do Veículo</p>
        <div style={{ ...g2, marginBottom: 12 }}>
          <div><label style={lbl}>Nome / Razão Social *</label><input value={form.proprietario_nome} onChange={set("proprietario_nome")} style={inp} placeholder="Nome completo" /></div>
          <div><label style={lbl}>Telefone</label><input value={form.proprietario_telefone} onChange={set("proprietario_telefone")} style={inp} placeholder="(00) 00000-0000" /></div>
        </div>
        <div style={{ ...g3, marginBottom: 12 }}>
          <div><label style={lbl}>Nacionalidade</label><input value={form.proprietario_nacionalidade} onChange={set("proprietario_nacionalidade")} style={inp} /></div>
          <div><label style={lbl}>Estado Civil</label>{sel("proprietario_estado_civil", EC)}</div>
          <div><label style={lbl}>Profissão</label><input value={form.proprietario_profissao} onChange={set("proprietario_profissao")} style={inp} /></div>
        </div>
        <div style={{ ...g3, marginBottom: 12 }}>
          <div><label style={lbl}>RG</label><input value={form.proprietario_rg} onChange={set("proprietario_rg")} style={inp} placeholder="0000000" /></div>
          <div><label style={lbl}>CPF / CNPJ</label><input value={form.proprietario_cpf_cnpj} onChange={set("proprietario_cpf_cnpj")} style={inp} placeholder="000.000.000-00" /></div>
          <div><label style={lbl}>E-mail</label><input type="email" value={form.proprietario_email} onChange={set("proprietario_email")} style={inp} placeholder="email@exemplo.com" /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>CEP {cepLoading && <span style={{ color: "#6b7280", fontWeight: 400 }}>buscando...</span>}</label>
          <input value={cep} onChange={e => lookupCep(e.target.value)} maxLength={9} style={inp} placeholder="00000-000" />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={lbl}>Endereço completo</label>
          <textarea value={form.proprietario_endereco} onChange={set("proprietario_endereco")} rows={3} style={{ ...inp, resize: "vertical" }} placeholder="Rua, nº, bairro, cidade - UF" />
        </div>
      </div>

      {/* 2. Loja */}
      <div style={sec}>
        <p style={stl}>2. Consignatária — Loja</p>
        <div style={{ ...g2, marginBottom: 12 }}>
          <div><label style={lbl}>Razão Social</label><input value={form.loja_razao_social} onChange={set("loja_razao_social")} style={inp} /></div>
          <div><label style={lbl}>Nome Fantasia</label><input value={form.loja_nome_fantasia} onChange={set("loja_nome_fantasia")} style={inp} /></div>
        </div>
        <div style={g2}>
          <div><label style={lbl}>CNPJ</label><input value={form.loja_cnpj} onChange={set("loja_cnpj")} style={inp} placeholder="00.000.000/0001-00" /></div>
          <div><label style={lbl}>Representante Legal</label><input value={form.loja_responsavel} onChange={set("loja_responsavel")} style={inp} placeholder="Nome do responsável" /></div>
        </div>
      </div>

      {/* 3. Veículo */}
      <div style={sec}>
        <p style={stl}>3. Dados do Veículo</p>
        <div style={{ ...g3, marginBottom: 12 }}>
          <div><label style={lbl}>Marca</label><input value={form.veiculo_marca} onChange={set("veiculo_marca")} style={inp} placeholder="Ex: Toyota" /></div>
          <div><label style={lbl}>Modelo</label><input value={form.veiculo_modelo} onChange={set("veiculo_modelo")} style={inp} placeholder="Ex: Corolla" /></div>
          <div><label style={lbl}>Versão</label><input value={form.veiculo_versao} onChange={set("veiculo_versao")} style={inp} placeholder="Ex: XEI 2.0" /></div>
        </div>
        <div style={{ ...g3, marginBottom: 12 }}>
          <div><label style={lbl}>Ano Fabricação</label><input type="number" value={form.veiculo_ano_fabricacao} onChange={set("veiculo_ano_fabricacao")} style={inp} placeholder="2020" /></div>
          <div><label style={lbl}>Ano Modelo</label><input type="number" value={form.veiculo_ano_modelo} onChange={set("veiculo_ano_modelo")} style={inp} placeholder="2021" /></div>
          <div><label style={lbl}>Placa</label><input value={form.veiculo_placa} onChange={set("veiculo_placa")} style={inp} placeholder="ABC-1234" /></div>
        </div>
        <div style={{ ...g3, marginBottom: 12 }}>
          <div><label style={lbl}>Chassi</label><input value={form.veiculo_chassi} onChange={set("veiculo_chassi")} style={inp} placeholder="9BWZZZ377VT004251" /></div>
          <div><label style={lbl}>Renavam</label><input value={form.veiculo_renavam} onChange={set("veiculo_renavam")} style={inp} placeholder="00000000000" /></div>
          <div><label style={lbl}>Quilometragem</label><input type="number" value={form.veiculo_km_atual} onChange={set("veiculo_km_atual")} style={inp} placeholder="45000" /></div>
        </div>
        <div style={g2}>
          <div><label style={lbl}>Cor</label><input value={form.veiculo_cor} onChange={set("veiculo_cor")} style={inp} placeholder="Prata" /></div>
          <div><label style={lbl}>Combustível</label>{sel("veiculo_combustivel", COMB)}</div>
        </div>
      </div>

      {/* 4. Valor */}
      <div style={sec}>
        <p style={stl}>4. Valor e Comissão</p>
        <div style={g2}>
          <div><label style={lbl}>Valor mínimo de venda (R$)</label><input value={form.valor_minimo_venda} onChange={set("valor_minimo_venda")} style={inp} placeholder="50.000,00" /></div>
          <div><label style={lbl}>Comissão da loja (%)</label><input type="number" value={form.percentual_comissao} onChange={set("percentual_comissao")} style={inp} placeholder="5" /></div>
        </div>
      </div>

      {/* 5. Prazo */}
      <div style={sec}>
        <p style={stl}>5. Prazo do Contrato</p>
        <div style={g3}>
          <div><label style={lbl}>Data de início</label><input type="date" value={form.data_inicio} onChange={set("data_inicio")} style={inp} /></div>
          <div><label style={lbl}>Data final</label><input type="date" value={form.data_final} onChange={set("data_final")} style={inp} /></div>
          <div><label style={lbl}>Taxa de retirada antecipada (R$)</label><input value={form.taxa_retirada} onChange={set("taxa_retirada")} style={inp} placeholder="500,00" /></div>
        </div>
      </div>

      {/* 6. Vistoria */}
      <div style={sec}>
        <p style={stl}>6. Vistoria do Veículo</p>
        <div style={{ ...g3, marginBottom: 12 }}>
          <div><label style={lbl}>Pintura</label>{sel("vistoria_pintura", COND)}</div>
          <div><label style={lbl}>Pneus</label>{sel("vistoria_pneus", COND)}</div>
          <div><label style={lbl}>Interior</label>{sel("vistoria_interior", COND)}</div>
        </div>
        <div>
          <label style={lbl}>Observações da vistoria</label>
          <textarea value={form.observacoes_vistoria} onChange={set("observacoes_vistoria")} rows={3} style={{ ...inp, resize: "vertical", gridColumn: "1/-1" }} placeholder="Detalhes sobre o estado do veículo, avarias, acessórios etc." />
        </div>
        <p style={{ color: "#6b7280", fontSize: 12, marginTop: 12 }}>📸 Fotos de vistoria podem ser adicionadas após salvar o contrato.</p>
      </div>

      {/* 7. Foro */}
      <div style={sec}>
        <p style={stl}>7. Foro e Assinatura</p>
        <div style={g2}>
          <div><label style={lbl}>Cidade do Foro</label><input value={form.cidade_foro} onChange={set("cidade_foro")} style={inp} /></div>
          <div><label style={lbl}>Data de assinatura</label><input type="date" value={form.data_assinatura} onChange={set("data_assinatura")} style={inp} /></div>
        </div>
      </div>

      {/* Status */}
      <div style={sec}>
        <p style={stl}>Status</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["ativo", "vendido", "retirado", "vencido"].map(s => (
            <button key={s} onClick={() => setForm(prev => ({ ...prev, status: s }))}
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
