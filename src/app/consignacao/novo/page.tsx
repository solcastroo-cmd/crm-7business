"use client";
import { useState, useEffect, useCallback } from "react";
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
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [cep, setCep]       = useState("");
  const [cepLoading, setCepLoading] = useState(false);

  /* ── campos individuais (mesmo padrão do settings) ── */
  const [proprietarioNome,         setProprietarioNome]         = useState("");
  const [proprietarioTelefone,     setProprietarioTelefone]     = useState("");
  const [proprietarioNacionalidade,setProprietarioNacionalidade]= useState("Brasileiro(a)");
  const [proprietarioEstadoCivil,  setProprietarioEstadoCivil]  = useState("");
  const [proprietarioProfissao,    setProprietarioProfissao]    = useState("");
  const [proprietarioRg,           setProprietarioRg]           = useState("");
  const [proprietarioCpfCnpj,      setProprietarioCpfCnpj]      = useState("");
  const [proprietarioEmail,        setProprietarioEmail]        = useState("");
  const [proprietarioEndereco,     setProprietarioEndereco]     = useState("");

  const [lojaRazaoSocial,  setLojaRazaoSocial]  = useState("PHD Motors");
  const [lojaNomeFantasia, setLojaNomeFantasia] = useState("PHD Motors");
  const [lojaCnpj,         setLojaCnpj]         = useState("");
  const [lojaResponsavel,  setLojaResponsavel]  = useState("");

  const [veiculoMarca,          setVeiculoMarca]          = useState("");
  const [veiculoModelo,         setVeiculoModelo]         = useState("");
  const [veiculoVersao,         setVeiculoVersao]         = useState("");
  const [veiculoAnoFabricacao,  setVeiculoAnoFabricacao]  = useState("");
  const [veiculoAnoModelo,      setVeiculoAnoModelo]      = useState("");
  const [veiculoPlaca,          setVeiculoPlaca]          = useState("");
  const [veiculoChassi,         setVeiculoChassi]         = useState("");
  const [veiculoRenavam,        setVeiculoRenavam]        = useState("");
  const [veiculoKmAtual,        setVeiculoKmAtual]        = useState("");
  const [veiculoCor,            setVeiculoCor]            = useState("");
  const [veiculoCombustivel,    setVeiculoCombustivel]    = useState("");

  const [valorMinimoVenda,   setValorMinimoVenda]   = useState("");
  const [percentualComissao, setPercentualComissao] = useState("5");

  const [dataInicio,    setDataInicio]    = useState("");
  const [dataFinal,     setDataFinal]     = useState("");
  const [taxaRetirada,  setTaxaRetirada]  = useState("");

  const [vistoriaPintura,   setVistoriaPintura]   = useState("");
  const [vistoriaPneus,     setVistoriaPneus]     = useState("");
  const [vistoriaInterior,  setVistoriaInterior]  = useState("");
  const [observacoesVistoria,setObservacoesVistoria]=useState("");

  const [cidadeForo,     setCidadeForo]     = useState("Fortaleza");
  const [dataAssinatura, setDataAssinatura] = useState("");
  const [status,         setStatus]         = useState("ativo");

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
        const end = [d.logradouro, d.complemento, d.bairro, `${d.localidade} - ${d.uf}`, `CEP: ${digits.replace(/(\d{5})(\d{3})/, "$1-$2")}`]
          .filter(Boolean).join(", ");
        setProprietarioEndereco(end);
      }
    } finally { setCepLoading(false); }
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const payload = {
        userId,
        proprietario_nome:          proprietarioNome          || null,
        proprietario_nacionalidade: proprietarioNacionalidade || null,
        proprietario_estado_civil:  proprietarioEstadoCivil  || null,
        proprietario_profissao:     proprietarioProfissao     || null,
        proprietario_rg:            proprietarioRg            || null,
        proprietario_cpf_cnpj:      proprietarioCpfCnpj      || null,
        proprietario_endereco:      proprietarioEndereco      || null,
        proprietario_telefone:      proprietarioTelefone      || null,
        proprietario_email:         proprietarioEmail         || null,
        loja_razao_social:          lojaRazaoSocial           || null,
        loja_nome_fantasia:         lojaNomeFantasia          || null,
        loja_cnpj:                  lojaCnpj                  || null,
        loja_responsavel:           lojaResponsavel           || null,
        veiculo_marca:              veiculoMarca              || null,
        veiculo_modelo:             veiculoModelo             || null,
        veiculo_versao:             veiculoVersao             || null,
        veiculo_ano_fabricacao:     veiculoAnoFabricacao  ? parseInt(veiculoAnoFabricacao)  : null,
        veiculo_ano_modelo:         veiculoAnoModelo      ? parseInt(veiculoAnoModelo)      : null,
        veiculo_placa:              veiculoPlaca              || null,
        veiculo_chassi:             veiculoChassi             || null,
        veiculo_renavam:            veiculoRenavam            || null,
        veiculo_cor:                veiculoCor                || null,
        veiculo_combustivel:        veiculoCombustivel        || null,
        veiculo_km_atual:           veiculoKmAtual        ? parseInt(veiculoKmAtual)        : null,
        valor_minimo_venda:         valorMinimoVenda      ? parseFloat(valorMinimoVenda.replace(/\./g, "").replace(",", "."))  : null,
        percentual_comissao:        percentualComissao    ? parseFloat(percentualComissao)  : null,
        taxa_retirada:              taxaRetirada          ? parseFloat(taxaRetirada.replace(/\./g, "").replace(",", "."))       : null,
        data_inicio:                dataInicio            || null,
        data_final:                 dataFinal             || null,
        data_assinatura:            dataAssinatura        || null,
        vistoria_pintura:           vistoriaPintura       || null,
        vistoria_pneus:             vistoriaPneus         || null,
        vistoria_interior:          vistoriaInterior      || null,
        observacoes_vistoria:       observacoesVistoria   || null,
        cidade_foro:                cidadeForo            || null,
        status,
      };
      const r = await fetch("/api/consignacao", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Erro ao salvar"); return; }
      router.push(`/consignacao/${d.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro de conexão");
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

      <form onSubmit={handleSave}>

        {/* 1. Proprietário */}
        <div style={sec}>
          <p style={stl}>1. Consignante — Proprietário do Veículo</p>
          <div style={{ ...g2, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Nome / Razão Social *</label>
              <input value={proprietarioNome} onChange={e => setProprietarioNome(e.target.value)} style={inp} placeholder="Nome completo" />
            </div>
            <div>
              <label style={lbl}>Telefone</label>
              <input value={proprietarioTelefone} onChange={e => setProprietarioTelefone(e.target.value)} style={inp} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Nacionalidade</label>
              <input value={proprietarioNacionalidade} onChange={e => setProprietarioNacionalidade(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Estado Civil</label>
              <select value={proprietarioEstadoCivil} onChange={e => setProprietarioEstadoCivil(e.target.value)} style={{ ...inp, appearance: "none" }}>
                <option value="">— Selecione —</option>
                {EC.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Profissão</label>
              <input value={proprietarioProfissao} onChange={e => setProprietarioProfissao(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>RG</label>
              <input value={proprietarioRg} onChange={e => setProprietarioRg(e.target.value)} style={inp} placeholder="0000000" />
            </div>
            <div>
              <label style={lbl}>CPF / CNPJ</label>
              <input value={proprietarioCpfCnpj} onChange={e => setProprietarioCpfCnpj(e.target.value)} style={inp} placeholder="000.000.000-00" />
            </div>
            <div>
              <label style={lbl}>E-mail</label>
              <input type="email" value={proprietarioEmail} onChange={e => setProprietarioEmail(e.target.value)} style={inp} placeholder="email@exemplo.com" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>CEP {cepLoading && <span style={{ color: "#6b7280", fontWeight: 400 }}>buscando...</span>}</label>
            <input value={cep} onChange={e => lookupCep(e.target.value)} maxLength={9} style={inp} placeholder="00000-000" />
          </div>
          <div>
            <label style={lbl}>Endereço completo</label>
            <textarea value={proprietarioEndereco} onChange={e => setProprietarioEndereco(e.target.value)} rows={3}
              style={{ ...inp, resize: "vertical" }} placeholder="Rua, nº, bairro, cidade - UF" />
          </div>
        </div>

        {/* 2. Loja */}
        <div style={sec}>
          <p style={stl}>2. Consignatária — Loja</p>
          <div style={{ ...g2, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Razão Social</label>
              <input value={lojaRazaoSocial} onChange={e => setLojaRazaoSocial(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Nome Fantasia</label>
              <input value={lojaNomeFantasia} onChange={e => setLojaNomeFantasia(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={g2}>
            <div>
              <label style={lbl}>CNPJ</label>
              <input value={lojaCnpj} onChange={e => setLojaCnpj(e.target.value)} style={inp} placeholder="00.000.000/0001-00" />
            </div>
            <div>
              <label style={lbl}>Representante Legal</label>
              <input value={lojaResponsavel} onChange={e => setLojaResponsavel(e.target.value)} style={inp} placeholder="Nome do responsável" />
            </div>
          </div>
        </div>

        {/* 3. Veículo */}
        <div style={sec}>
          <p style={stl}>3. Dados do Veículo</p>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Marca</label>
              <input value={veiculoMarca} onChange={e => setVeiculoMarca(e.target.value)} style={inp} placeholder="Ex: Toyota" />
            </div>
            <div>
              <label style={lbl}>Modelo</label>
              <input value={veiculoModelo} onChange={e => setVeiculoModelo(e.target.value)} style={inp} placeholder="Ex: Corolla" />
            </div>
            <div>
              <label style={lbl}>Versão</label>
              <input value={veiculoVersao} onChange={e => setVeiculoVersao(e.target.value)} style={inp} placeholder="Ex: XEI 2.0" />
            </div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Ano Fabricação</label>
              <input type="number" value={veiculoAnoFabricacao} onChange={e => setVeiculoAnoFabricacao(e.target.value)} style={inp} placeholder="2020" />
            </div>
            <div>
              <label style={lbl}>Ano Modelo</label>
              <input type="number" value={veiculoAnoModelo} onChange={e => setVeiculoAnoModelo(e.target.value)} style={inp} placeholder="2021" />
            </div>
            <div>
              <label style={lbl}>Placa</label>
              <input value={veiculoPlaca} onChange={e => setVeiculoPlaca(e.target.value)} style={inp} placeholder="ABC-1234" />
            </div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Chassi</label>
              <input value={veiculoChassi} onChange={e => setVeiculoChassi(e.target.value)} style={inp} placeholder="9BWZZZ377VT004251" />
            </div>
            <div>
              <label style={lbl}>Renavam</label>
              <input value={veiculoRenavam} onChange={e => setVeiculoRenavam(e.target.value)} style={inp} placeholder="00000000000" />
            </div>
            <div>
              <label style={lbl}>Quilometragem</label>
              <input type="number" value={veiculoKmAtual} onChange={e => setVeiculoKmAtual(e.target.value)} style={inp} placeholder="45000" />
            </div>
          </div>
          <div style={g2}>
            <div>
              <label style={lbl}>Cor</label>
              <input value={veiculoCor} onChange={e => setVeiculoCor(e.target.value)} style={inp} placeholder="Prata" />
            </div>
            <div>
              <label style={lbl}>Combustível</label>
              <select value={veiculoCombustivel} onChange={e => setVeiculoCombustivel(e.target.value)} style={{ ...inp, appearance: "none" }}>
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
            <div>
              <label style={lbl}>Valor mínimo de venda (R$)</label>
              <input value={valorMinimoVenda} onChange={e => setValorMinimoVenda(e.target.value)} style={inp} placeholder="50.000,00" />
            </div>
            <div>
              <label style={lbl}>Comissão da loja (%)</label>
              <input type="number" value={percentualComissao} onChange={e => setPercentualComissao(e.target.value)} style={inp} placeholder="5" />
            </div>
          </div>
        </div>

        {/* 5. Prazo */}
        <div style={sec}>
          <p style={stl}>5. Prazo do Contrato</p>
          <div style={g3}>
            <div>
              <label style={lbl}>Data de início</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Data final</label>
              <input type="date" value={dataFinal} onChange={e => setDataFinal(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Taxa de retirada antecipada (R$)</label>
              <input value={taxaRetirada} onChange={e => setTaxaRetirada(e.target.value)} style={inp} placeholder="500,00" />
            </div>
          </div>
        </div>

        {/* 6. Vistoria */}
        <div style={sec}>
          <p style={stl}>6. Vistoria do Veículo</p>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Pintura</label>
              <select value={vistoriaPintura} onChange={e => setVistoriaPintura(e.target.value)} style={{ ...inp, appearance: "none" }}>
                <option value="">— Selecione —</option>
                {COND.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Pneus</label>
              <select value={vistoriaPneus} onChange={e => setVistoriaPneus(e.target.value)} style={{ ...inp, appearance: "none" }}>
                <option value="">— Selecione —</option>
                {COND.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Interior</label>
              <select value={vistoriaInterior} onChange={e => setVistoriaInterior(e.target.value)} style={{ ...inp, appearance: "none" }}>
                <option value="">— Selecione —</option>
                {COND.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Observações da vistoria</label>
            <textarea value={observacoesVistoria} onChange={e => setObservacoesVistoria(e.target.value)} rows={3}
              style={{ ...inp, resize: "vertical" }} placeholder="Detalhes sobre o estado do veículo, avarias, acessórios etc." />
          </div>
          <p style={{ color: "#6b7280", fontSize: 12, marginTop: 12 }}>📸 Fotos de vistoria podem ser adicionadas após salvar o contrato.</p>
        </div>

        {/* 7. Foro */}
        <div style={sec}>
          <p style={stl}>7. Foro e Assinatura</p>
          <div style={g2}>
            <div>
              <label style={lbl}>Cidade do Foro</label>
              <input value={cidadeForo} onChange={e => setCidadeForo(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Data de assinatura</label>
              <input type="date" value={dataAssinatura} onChange={e => setDataAssinatura(e.target.value)} style={inp} />
            </div>
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
