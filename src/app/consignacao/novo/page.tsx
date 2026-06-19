"use client";
import { useState, useEffect, useRef, useCallback, memo, forwardRef, useImperativeHandle, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

const EMPTY: Record<string, string> = {
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

type FProps = {
  label: string; name: string; type?: string; placeholder?: string;
  full?: boolean; as?: string; options?: string[];
  initialValue: string; onChangeRef: React.MutableRefObject<(k: string, v: string) => void>;
};

export type FieldHandle = { setValue: (v: string) => void };

// Não-controlado (defaultValue) — imune a IME mobile e re-renders do pai
// React nunca toca no value do input após o mount
const Field = memo(forwardRef<FieldHandle, FProps>(function Field(
  { label, name, type = "text", placeholder = "", full = false, as: as_ = "input", options = [], initialValue, onChangeRef },
  ref
) {
  const domRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  // Expõe setValue para atualizações externas (ex: CEP lookup)
  useImperativeHandle(ref, () => ({
    setValue: (v: string) => {
      if (domRef.current) domRef.current.value = v;
      onChangeRef.current(name, v);
    }
  }), [name, onChangeRef]);

  const handle = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    onChangeRef.current(name, e.target.value);
  }, [name, onChangeRef]);

  return (
    <div style={full ? { gridColumn: "1/-1" } : {}}>
      <label style={lbl}>{label}</label>
      {as_ === "select" ? (
        <select
          ref={domRef as React.RefObject<HTMLSelectElement>}
          defaultValue={initialValue}
          onChange={handle}
          style={{ ...inp, appearance: "none" }}
          autoComplete="off">
          <option value="">— Selecione —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : as_ === "textarea" ? (
        <textarea
          ref={domRef as React.RefObject<HTMLTextAreaElement>}
          defaultValue={initialValue}
          onChange={handle}
          rows={3} style={{ ...inp, resize: "vertical" }} placeholder={placeholder}
          autoComplete="off" spellCheck={false} />
      ) : (
        <input
          ref={domRef as React.RefObject<HTMLInputElement>}
          type={type}
          defaultValue={initialValue}
          onChange={handle}
          style={inp} placeholder={placeholder}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
      )}
    </div>
  );
}));

export default function NovoConsignacaoPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState<string | null>(null);
  const [cep, setCep]               = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [status, setStatus]         = useState("ativo");

  const formRef = useRef<Record<string, string>>({ ...EMPTY });
  const enderecoFieldRef = useRef<FieldHandle | null>(null);

  // Ref estável para o handler — Field nunca re-renderiza por causa do pai
  const handleChangeImpl = useCallback((k: string, v: string) => {
    formRef.current[k] = v;
    if (k === "status") setStatus(v);
  }, []);
  const onChangeRef = useRef(handleChangeImpl);
  onChangeRef.current = handleChangeImpl;

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
        formRef.current.proprietario_endereco = end;
        enderecoFieldRef.current?.setValue(end);
      }
    } finally {
      setCepLoading(false);
    }
  }, []);

  const fv = (name: string) => ({ initialValue: formRef.current[name] ?? "", onChangeRef });

  async function handleSave() {
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const f = formRef.current;
      const payload = {
        userId,
        ...f,
        status,
        veiculo_ano_fabricacao: f.veiculo_ano_fabricacao ? parseInt(f.veiculo_ano_fabricacao) : null,
        veiculo_ano_modelo:     f.veiculo_ano_modelo     ? parseInt(f.veiculo_ano_modelo)     : null,
        veiculo_km_atual:       f.veiculo_km_atual       ? parseInt(f.veiculo_km_atual)       : null,
        valor_minimo_venda:     f.valor_minimo_venda     ? parseFloat(f.valor_minimo_venda.replace(/\./g, "").replace(",", ".")) : null,
        percentual_comissao:    f.percentual_comissao    ? parseFloat(f.percentual_comissao)  : null,
        taxa_retirada:          f.taxa_retirada          ? parseFloat(f.taxa_retirada.replace(/\./g, "").replace(",", ".")) : null,
        data_inicio:     f.data_inicio     || null,
        data_final:      f.data_final      || null,
        data_assinatura: f.data_assinatura || null,
      };
      const r = await fetch("/api/consignacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Erro ao salvar"); return; }
      router.push(`/consignacao/${d.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro de conexão ao salvar");
    } finally {
      setSaving(false);
    }
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
          <Field {...fv("proprietario_nome")} label="Nome / Razão Social *" name="proprietario_nome" placeholder="Nome completo" />
          <Field {...fv("proprietario_telefone")} label="Telefone" name="proprietario_telefone" placeholder="(00) 00000-0000" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("proprietario_nacionalidade")} label="Nacionalidade" name="proprietario_nacionalidade" />
          <Field {...fv("proprietario_estado_civil")} label="Estado Civil" name="proprietario_estado_civil" as="select" options={["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União Estável"]} />
          <Field {...fv("proprietario_profissao")} label="Profissão" name="proprietario_profissao" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("proprietario_rg")} label="RG" name="proprietario_rg" placeholder="0000000" />
          <Field {...fv("proprietario_cpf_cnpj")} label="CPF / CNPJ" name="proprietario_cpf_cnpj" placeholder="000.000.000-00" />
          <Field {...fv("proprietario_email")} label="E-mail" name="proprietario_email" type="email" placeholder="email@exemplo.com" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>CEP {cepLoading && <span style={{ color: "#6b7280", fontWeight: 400 }}>buscando...</span>}</label>
          <input value={cep} onChange={e => lookupCep(e.target.value)} maxLength={9}
            style={inp} placeholder="00000-000" autoComplete="off" />
        </div>
        <Field {...fv("proprietario_endereco")} label="Endereço completo" name="proprietario_endereco" placeholder="Rua, nº, bairro, cidade - UF" full as="textarea" ref={enderecoFieldRef} />
      </div>

      {/* 2. Consignatária */}
      <div style={section}>
        <p style={sTitle}>2. Consignatária — Loja</p>
        <div style={{ ...grid2, marginBottom: 12 }}>
          <Field {...fv("loja_razao_social")} label="Razão Social" name="loja_razao_social" />
          <Field {...fv("loja_nome_fantasia")} label="Nome Fantasia" name="loja_nome_fantasia" />
        </div>
        <div style={grid2}>
          <Field {...fv("loja_cnpj")} label="CNPJ" name="loja_cnpj" placeholder="00.000.000/0001-00" />
          <Field {...fv("loja_responsavel")} label="Representante Legal" name="loja_responsavel" placeholder="Nome do responsável" />
        </div>
      </div>

      {/* 3. Veículo */}
      <div style={section}>
        <p style={sTitle}>3. Dados do Veículo</p>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("veiculo_marca")} label="Marca" name="veiculo_marca" placeholder="Ex: Toyota" />
          <Field {...fv("veiculo_modelo")} label="Modelo" name="veiculo_modelo" placeholder="Ex: Corolla" />
          <Field {...fv("veiculo_versao")} label="Versão" name="veiculo_versao" placeholder="Ex: XEI 2.0" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("veiculo_ano_fabricacao")} label="Ano Fabricação" name="veiculo_ano_fabricacao" type="number" placeholder="2020" />
          <Field {...fv("veiculo_ano_modelo")} label="Ano Modelo" name="veiculo_ano_modelo" type="number" placeholder="2021" />
          <Field {...fv("veiculo_placa")} label="Placa" name="veiculo_placa" placeholder="ABC-1234" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("veiculo_chassi")} label="Chassi" name="veiculo_chassi" placeholder="9BWZZZ377VT004251" />
          <Field {...fv("veiculo_renavam")} label="Renavam" name="veiculo_renavam" placeholder="00000000000" />
          <Field {...fv("veiculo_km_atual")} label="Quilometragem" name="veiculo_km_atual" type="number" placeholder="45000" />
        </div>
        <div style={grid2}>
          <Field {...fv("veiculo_cor")} label="Cor" name="veiculo_cor" placeholder="Prata" />
          <Field {...fv("veiculo_combustivel")} label="Combustível" name="veiculo_combustivel" as="select" options={COMB} />
        </div>
      </div>

      {/* 4. Valor e Comissão */}
      <div style={section}>
        <p style={sTitle}>4. Valor e Comissão</p>
        <div style={grid2}>
          <Field {...fv("valor_minimo_venda")} label="Valor mínimo de venda (R$)" name="valor_minimo_venda" placeholder="50.000,00" />
          <Field {...fv("percentual_comissao")} label="Comissão da loja (%)" name="percentual_comissao" type="number" placeholder="5" />
        </div>
      </div>

      {/* 5. Prazo */}
      <div style={section}>
        <p style={sTitle}>5. Prazo do Contrato</p>
        <div style={grid3}>
          <Field {...fv("data_inicio")} label="Data de início" name="data_inicio" type="date" />
          <Field {...fv("data_final")} label="Data final" name="data_final" type="date" />
          <Field {...fv("taxa_retirada")} label="Taxa de retirada antecipada (R$)" name="taxa_retirada" placeholder="500,00" />
        </div>
      </div>

      {/* 6. Vistoria */}
      <div style={section}>
        <p style={sTitle}>6. Vistoria do Veículo</p>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("vistoria_pintura")} label="Pintura" name="vistoria_pintura" as="select" options={COND} />
          <Field {...fv("vistoria_pneus")} label="Pneus" name="vistoria_pneus" as="select" options={COND} />
          <Field {...fv("vistoria_interior")} label="Interior" name="vistoria_interior" as="select" options={COND} />
        </div>
        <Field {...fv("observacoes_vistoria")} label="Observações da vistoria" name="observacoes_vistoria" as="textarea" full placeholder="Detalhes sobre o estado do veículo, avarias, acessórios etc." />
        <p style={{ color: "#6b7280", fontSize: 12, marginTop: 12 }}>
          📸 Fotos de vistoria podem ser adicionadas após salvar o contrato.
        </p>
      </div>

      {/* 7. Foro */}
      <div style={section}>
        <p style={sTitle}>7. Foro e Assinatura</p>
        <div style={grid2}>
          <Field {...fv("cidade_foro")} label="Cidade do Foro" name="cidade_foro" />
          <Field {...fv("data_assinatura")} label="Data de assinatura" name="data_assinatura" type="date" />
        </div>
      </div>

      {/* Status */}
      <div style={section}>
        <p style={sTitle}>Status</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["ativo","vendido","retirado","vencido"].map(s => (
            <button key={s} onClick={() => { formRef.current.status = s; setStatus(s); }}
              style={{
                padding: "8px 18px", borderRadius: 20, border: "1px solid",
                borderColor: status === s ? "#dc2626" : "#2e2e2e",
                background: status === s ? "#dc262620" : "transparent",
                color: status === s ? "#f87171" : "#9ca3af",
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
