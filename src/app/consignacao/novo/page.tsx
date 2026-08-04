"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

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
  const router  = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [userId,     setUserId]     = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [status,     setStatus]     = useState("ativo");
  const enderecoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: Awaited<ReturnType<typeof supabase.auth.getUser>>) => {
      if (!data?.user) { router.push("/login"); return; }
      setUserId(data.user.id);
    });
  }, [router]);

  const lookupCep = useCallback(async (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await r.json();
      if (!d.erro && enderecoRef.current) {
        enderecoRef.current.value = [
          d.logradouro, d.complemento, d.bairro,
          `${d.localidade} - ${d.uf}`,
          `CEP: ${digits.replace(/(\d{5})(\d{3})/, "$1-$2")}`,
        ].filter(Boolean).join(", ");
      }
    } finally { setCepLoading(false); }
  }, []);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const fd = new FormData(e.currentTarget);
      const g = (k: string) => (fd.get(k) as string | null) ?? "";
      const num = (v: string) => v ? parseFloat(v.replace(/\./g, "").replace(",", ".")) : null;
      const int = (v: string) => v ? parseInt(v) : null;

      const payload = {
        userId,
        proprietario_nome:          g("proprietario_nome")          || null,
        proprietario_nacionalidade: g("proprietario_nacionalidade") || null,
        proprietario_estado_civil:  g("proprietario_estado_civil")  || null,
        proprietario_profissao:     g("proprietario_profissao")     || null,
        proprietario_rg:            g("proprietario_rg")            || null,
        proprietario_cpf_cnpj:      g("proprietario_cpf_cnpj")      || null,
        proprietario_endereco:      g("proprietario_endereco")      || null,
        proprietario_telefone:      g("proprietario_telefone")      || null,
        proprietario_email:         g("proprietario_email")         || null,
        loja_razao_social:          g("loja_razao_social")          || null,
        loja_nome_fantasia:         g("loja_nome_fantasia")         || null,
        loja_cnpj:                  g("loja_cnpj")                  || null,
        loja_responsavel:           g("loja_responsavel")           || null,
        veiculo_marca:              g("veiculo_marca")              || null,
        veiculo_modelo:             g("veiculo_modelo")             || null,
        veiculo_versao:             g("veiculo_versao")             || null,
        veiculo_ano_fabricacao:     int(g("veiculo_ano_fabricacao")),
        veiculo_ano_modelo:         int(g("veiculo_ano_modelo")),
        veiculo_placa:              g("veiculo_placa")              || null,
        veiculo_chassi:             g("veiculo_chassi")             || null,
        veiculo_renavam:            g("veiculo_renavam")            || null,
        veiculo_cor:                g("veiculo_cor")                || null,
        veiculo_combustivel:        g("veiculo_combustivel")        || null,
        veiculo_km_atual:           int(g("veiculo_km_atual")),
        valor_minimo_venda:         num(g("valor_minimo_venda")),
        percentual_comissao:        num(g("percentual_comissao")),
        taxa_retirada:              num(g("taxa_retirada")),
        data_inicio:                g("data_inicio")    || null,
        data_final:                 g("data_final")     || null,
        data_assinatura:            g("data_assinatura")|| null,
        vistoria_pintura:           g("vistoria_pintura")  || null,
        vistoria_pneus:             g("vistoria_pneus")    || null,
        vistoria_interior:          g("vistoria_interior") || null,
        observacoes_vistoria:       g("observacoes_vistoria") || null,
        cidade_foro:                g("cidade_foro")    || null,
        status,
      };

      const r = await fetch("/api/consignacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Erro ao salvar"); return; }
      router.push(`/consignacao/${d.id}`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Erro de conexão");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: "28px 24px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button type="button" onClick={() => router.push("/consignacao")}
          style={{ background: "transparent", border: "1px solid #333", borderRadius: 8, padding: "6px 14px", color: "#9ca3af", cursor: "pointer", fontSize: 13 }}>
          ← Voltar
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>Novo Contrato de Consignação</h1>
      </div>

      <form ref={formRef} onSubmit={handleSave}>

        {/* 1. Proprietário */}
        <div style={sec}>
          <p style={stl}>1. Consignante — Proprietário do Veículo</p>
          <div style={{ ...g2, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Nome / Razão Social *</label>
              <input name="proprietario_nome" style={inp} placeholder="Nome completo" autoComplete="off" />
            </div>
            <div>
              <label style={lbl}>Telefone</label>
              <input name="proprietario_telefone" style={inp} placeholder="(00) 00000-0000" autoComplete="off" />
            </div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Nacionalidade</label>
              <input name="proprietario_nacionalidade" defaultValue="Brasileiro(a)" style={inp} autoComplete="off" />
            </div>
            <div>
              <label style={lbl}>Estado Civil</label>
              <select name="proprietario_estado_civil" style={{ ...inp, appearance: "none" }}>
                <option value="">— Selecione —</option>
                {EC.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Profissão</label>
              <input name="proprietario_profissao" style={inp} autoComplete="off" />
            </div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>RG</label>
              <input name="proprietario_rg" style={inp} placeholder="0000000" autoComplete="off" />
            </div>
            <div>
              <label style={lbl}>CPF / CNPJ</label>
              <input name="proprietario_cpf_cnpj" style={inp} placeholder="000.000.000-00" autoComplete="off" />
            </div>
            <div>
              <label style={lbl}>E-mail</label>
              <input type="email" name="proprietario_email" style={inp} placeholder="email@exemplo.com" autoComplete="off" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>CEP {cepLoading && <span style={{ color: "#6b7280", fontWeight: 400 }}>buscando...</span>}</label>
            <input
              style={inp} placeholder="00000-000" maxLength={9} autoComplete="off"
              onBlur={e => lookupCep(e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>Endereço completo</label>
            <textarea ref={enderecoRef} name="proprietario_endereco" rows={3}
              style={{ ...inp, resize: "vertical" }} placeholder="Rua, nº, bairro, cidade - UF" />
          </div>
        </div>

        {/* 2. Loja */}
        <div style={sec}>
          <p style={stl}>2. Consignatária — Loja</p>
          <div style={{ ...g2, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Razão Social</label>
              <input name="loja_razao_social" defaultValue="PHD Motors" style={inp} autoComplete="off" />
            </div>
            <div>
              <label style={lbl}>Nome Fantasia</label>
              <input name="loja_nome_fantasia" defaultValue="PHD Motors" style={inp} autoComplete="off" />
            </div>
          </div>
          <div style={g2}>
            <div>
              <label style={lbl}>CNPJ</label>
              <input name="loja_cnpj" defaultValue="67.579.100/0001-95" style={inp} placeholder="00.000.000/0001-00" autoComplete="off" />
            </div>
            <div>
              <label style={lbl}>Representante Legal</label>
              <input name="loja_responsavel" style={inp} placeholder="Nome do responsável" autoComplete="off" />
            </div>
          </div>
        </div>

        {/* 3. Veículo */}
        <div style={sec}>
          <p style={stl}>3. Dados do Veículo</p>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div><label style={lbl}>Marca</label><input name="veiculo_marca" style={inp} placeholder="Ex: Toyota" autoComplete="off" /></div>
            <div><label style={lbl}>Modelo</label><input name="veiculo_modelo" style={inp} placeholder="Ex: Corolla" autoComplete="off" /></div>
            <div><label style={lbl}>Versão</label><input name="veiculo_versao" style={inp} placeholder="Ex: XEI 2.0" autoComplete="off" /></div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div><label style={lbl}>Ano Fabricação</label><input type="number" name="veiculo_ano_fabricacao" style={inp} placeholder="2020" /></div>
            <div><label style={lbl}>Ano Modelo</label><input type="number" name="veiculo_ano_modelo" style={inp} placeholder="2021" /></div>
            <div><label style={lbl}>Placa</label><input name="veiculo_placa" style={inp} placeholder="ABC-1234" autoComplete="off" /></div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div><label style={lbl}>Chassi</label><input name="veiculo_chassi" style={inp} placeholder="9BWZZZ377VT004251" autoComplete="off" /></div>
            <div><label style={lbl}>Renavam</label><input name="veiculo_renavam" style={inp} placeholder="00000000000" autoComplete="off" /></div>
            <div><label style={lbl}>Quilometragem</label><input type="number" name="veiculo_km_atual" style={inp} placeholder="45000" /></div>
          </div>
          <div style={g2}>
            <div><label style={lbl}>Cor</label><input name="veiculo_cor" style={inp} placeholder="Prata" autoComplete="off" /></div>
            <div>
              <label style={lbl}>Combustível</label>
              <select name="veiculo_combustivel" style={{ ...inp, appearance: "none" }}>
                <option value="">— Selecione —</option>
                {COMB.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 4. Valor */}
        <div style={sec}>
          <p style={stl}>4. Valor e Comissão</p>
          <div style={g2}>
            <div><label style={lbl}>Valor mínimo de venda (R$)</label><input name="valor_minimo_venda" style={inp} placeholder="50.000,00" autoComplete="off" /></div>
            <div><label style={lbl}>Comissão da loja (%)</label><input type="number" name="percentual_comissao" defaultValue="5" style={inp} /></div>
          </div>
        </div>

        {/* 5. Prazo */}
        <div style={sec}>
          <p style={stl}>5. Prazo do Contrato</p>
          <div style={g3}>
            <div><label style={lbl}>Data de início</label><input type="date" name="data_inicio" style={inp} /></div>
            <div><label style={lbl}>Data final</label><input type="date" name="data_final" style={inp} /></div>
            <div><label style={lbl}>Taxa de retirada antecipada (R$)</label><input name="taxa_retirada" style={inp} placeholder="500,00" autoComplete="off" /></div>
          </div>
        </div>

        {/* 6. Vistoria */}
        <div style={sec}>
          <p style={stl}>6. Vistoria do Veículo</p>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Pintura</label>
              <select name="vistoria_pintura" style={{ ...inp, appearance: "none" }}>
                <option value="">— Selecione —</option>
                {COND.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Pneus</label>
              <select name="vistoria_pneus" style={{ ...inp, appearance: "none" }}>
                <option value="">— Selecione —</option>
                {COND.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Interior</label>
              <select name="vistoria_interior" style={{ ...inp, appearance: "none" }}>
                <option value="">— Selecione —</option>
                {COND.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Observações da vistoria</label>
            <textarea name="observacoes_vistoria" rows={3}
              style={{ ...inp, resize: "vertical" }} placeholder="Detalhes sobre o estado do veículo, avarias, acessórios etc." />
          </div>
          <p style={{ color: "#6b7280", fontSize: 12, marginTop: 12 }}>📸 Fotos podem ser adicionadas após salvar.</p>
        </div>

        {/* 7. Foro */}
        <div style={sec}>
          <p style={stl}>7. Foro e Assinatura</p>
          <div style={g2}>
            <div><label style={lbl}>Cidade do Foro</label><input name="cidade_foro" defaultValue="Fortaleza" style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Data de assinatura</label><input type="date" name="data_assinatura" style={inp} /></div>
          </div>
        </div>

        {/* Status */}
        <div style={sec}>
          <p style={stl}>Status</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {["ativo", "vendido", "retirado", "vencido"].map(s => (
              <button type="button" key={s} onClick={() => setStatus(s)}
                style={{
                  padding: "8px 18px", borderRadius: 20, border: "1px solid",
                  borderColor: status === s ? "#dc2626" : "#2e2e2e",
                  background:  status === s ? "#dc262620" : "transparent",
                  color:       status === s ? "#f87171" : "#9ca3af",
                  fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "capitalize",
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {err && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>⚠ {err}</p>}

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => router.push("/consignacao")}
            style={{ padding: "12px 24px", borderRadius: 10, border: "1px solid #333", background: "transparent", color: "#9ca3af", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: saving ? "#444" : "#dc2626", color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Salvando..." : "Salvar Contrato"}
          </button>
        </div>

      </form>
    </div>
  );
}
