"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

type Photo = { id: string; url: string; label: string };

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

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ativo:    { label: "Ativo",    color: "#10b981", bg: "#10b98120" },
  vendido:  { label: "Vendido",  color: "#3b82f6", bg: "#3b82f620" },
  retirado: { label: "Retirado", color: "#f59e0b", bg: "#f59e0b20" },
  vencido:  { label: "Vencido",  color: "#ef4444", bg: "#ef444420" },
};

export default function ConsignacaoDetailPage() {
  const router  = useRouter();
  const { id }  = useParams<{ id: string }>();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [err,       setErr]       = useState<string | null>(null);
  const [userId,    setUserId]    = useState<string | null>(null);
  const [photos,    setPhotos]    = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newLabel,  setNewLabel]  = useState("Foto");
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<{ id: string; val: string } | null>(null);
  const [cep,        setCep]        = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [headerTitle,setHeaderTitle]= useState("");

  /* ── campos individuais (mesmo padrão do settings) ── */
  const [proprietarioNome,          setProprietarioNome]          = useState("");
  const [proprietarioTelefone,      setProprietarioTelefone]      = useState("");
  const [proprietarioNacionalidade, setProprietarioNacionalidade] = useState("");
  const [proprietarioEstadoCivil,   setProprietarioEstadoCivil]   = useState("");
  const [proprietarioProfissao,     setProprietarioProfissao]     = useState("");
  const [proprietarioRg,            setProprietarioRg]            = useState("");
  const [proprietarioCpfCnpj,       setProprietarioCpfCnpj]       = useState("");
  const [proprietarioEmail,         setProprietarioEmail]         = useState("");
  const [proprietarioEndereco,      setProprietarioEndereco]      = useState("");

  const [lojaRazaoSocial,  setLojaRazaoSocial]  = useState("");
  const [lojaNomeFantasia, setLojaNomeFantasia]  = useState("");
  const [lojaCnpj,         setLojaCnpj]          = useState("");
  const [lojaResponsavel,  setLojaResponsavel]   = useState("");

  const [veiculoMarca,         setVeiculoMarca]         = useState("");
  const [veiculoModelo,        setVeiculoModelo]        = useState("");
  const [veiculoVersao,        setVeiculoVersao]        = useState("");
  const [veiculoAnoFabricacao, setVeiculoAnoFabricacao] = useState("");
  const [veiculoAnoModelo,     setVeiculoAnoModelo]     = useState("");
  const [veiculoPlaca,         setVeiculoPlaca]         = useState("");
  const [veiculoChassi,        setVeiculoChassi]        = useState("");
  const [veiculoRenavam,       setVeiculoRenavam]       = useState("");
  const [veiculoKmAtual,       setVeiculoKmAtual]       = useState("");
  const [veiculoCor,           setVeiculoCor]           = useState("");
  const [veiculoCombustivel,   setVeiculoCombustivel]   = useState("");

  const [valorMinimoVenda,   setValorMinimoVenda]   = useState("");
  const [percentualComissao, setPercentualComissao] = useState("");

  const [dataInicio,   setDataInicio]   = useState("");
  const [dataFinal,    setDataFinal]    = useState("");
  const [taxaRetirada, setTaxaRetirada] = useState("");

  const [vistoriaPintura,    setVistoriaPintura]    = useState("");
  const [vistoriaPneus,      setVistoriaPneus]      = useState("");
  const [vistoriaInterior,   setVistoriaInterior]   = useState("");
  const [observacoesVistoria,setObservacoesVistoria]= useState("");

  const [cidadeForo,     setCidadeForo]     = useState("");
  const [dataAssinatura, setDataAssinatura] = useState("");
  const [status,         setStatus]         = useState("ativo");

  const load = useCallback(async () => {
    const r = await fetch(`/api/consignacao/${id}`);
    const d = await r.json();
    if (!r.ok) { router.push("/consignacao"); return; }

    const { consignment_photos, ...rest } = d;
    const s = (k: string) => rest[k] == null ? "" : String(rest[k]);

    setProprietarioNome(s("proprietario_nome"));
    setProprietarioTelefone(s("proprietario_telefone"));
    setProprietarioNacionalidade(s("proprietario_nacionalidade"));
    setProprietarioEstadoCivil(s("proprietario_estado_civil"));
    setProprietarioProfissao(s("proprietario_profissao"));
    setProprietarioRg(s("proprietario_rg"));
    setProprietarioCpfCnpj(s("proprietario_cpf_cnpj"));
    setProprietarioEmail(s("proprietario_email"));
    setProprietarioEndereco(s("proprietario_endereco"));
    setLojaRazaoSocial(s("loja_razao_social"));
    setLojaNomeFantasia(s("loja_nome_fantasia"));
    setLojaCnpj(s("loja_cnpj"));
    setLojaResponsavel(s("loja_responsavel"));
    setVeiculoMarca(s("veiculo_marca"));
    setVeiculoModelo(s("veiculo_modelo"));
    setVeiculoVersao(s("veiculo_versao"));
    setVeiculoAnoFabricacao(s("veiculo_ano_fabricacao"));
    setVeiculoAnoModelo(s("veiculo_ano_modelo"));
    setVeiculoPlaca(s("veiculo_placa"));
    setVeiculoChassi(s("veiculo_chassi"));
    setVeiculoRenavam(s("veiculo_renavam"));
    setVeiculoKmAtual(s("veiculo_km_atual"));
    setVeiculoCor(s("veiculo_cor"));
    setVeiculoCombustivel(s("veiculo_combustivel"));
    setValorMinimoVenda(s("valor_minimo_venda"));
    setPercentualComissao(s("percentual_comissao"));
    setDataInicio(s("data_inicio"));
    setDataFinal(s("data_final"));
    setTaxaRetirada(s("taxa_retirada"));
    setVistoriaPintura(s("vistoria_pintura"));
    setVistoriaPneus(s("vistoria_pneus"));
    setVistoriaInterior(s("vistoria_interior"));
    setObservacoesVistoria(s("observacoes_vistoria"));
    setCidadeForo(s("cidade_foro"));
    setDataAssinatura(s("data_assinatura"));
    setStatus(s("status") || "ativo");

    setHeaderTitle(`${s("veiculo_marca")} ${s("veiculo_modelo")}`.trim());
    setPhotos(Array.isArray(consignment_photos) ? consignment_photos : []);
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      load();
    });
  }, [router, load]);

  const lookupCep = useCallback(async (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    setCep(digits.replace(/(\d{5})(\d{3})/, "$1-$2"));
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await r.json();
      if (!d.erro) {
        const end = [d.logradouro, d.complemento, d.bairro, `${d.localidade} - ${d.uf}`,
          `CEP: ${digits.replace(/(\d{5})(\d{3})/, "$1-$2")}`].filter(Boolean).join(", ");
        setProprietarioEndereco(end);
      }
    } finally { setCepLoading(false); }
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setSaving(true); setSaved(false);
    try {
      const num = (v: string) => v ? parseFloat(v.replace(/\./g, "").replace(",", ".")) : null;
      const int = (v: string) => v ? parseInt(v) : null;
      const payload = {
        proprietario_nome:          proprietarioNome          || null,
        proprietario_nacionalidade: proprietarioNacionalidade || null,
        proprietario_estado_civil:  proprietarioEstadoCivil   || null,
        proprietario_profissao:     proprietarioProfissao     || null,
        proprietario_rg:            proprietarioRg            || null,
        proprietario_cpf_cnpj:      proprietarioCpfCnpj       || null,
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
        veiculo_ano_fabricacao:     int(veiculoAnoFabricacao),
        veiculo_ano_modelo:         int(veiculoAnoModelo),
        veiculo_placa:              veiculoPlaca              || null,
        veiculo_chassi:             veiculoChassi             || null,
        veiculo_renavam:            veiculoRenavam            || null,
        veiculo_cor:                veiculoCor                || null,
        veiculo_combustivel:        veiculoCombustivel        || null,
        veiculo_km_atual:           int(veiculoKmAtual),
        valor_minimo_venda:         num(valorMinimoVenda),
        percentual_comissao:        num(percentualComissao),
        taxa_retirada:              num(taxaRetirada),
        data_inicio:                dataInicio    || null,
        data_final:                 dataFinal     || null,
        data_assinatura:            dataAssinatura|| null,
        vistoria_pintura:           vistoriaPintura   || null,
        vistoria_pneus:             vistoriaPneus     || null,
        vistoria_interior:          vistoriaInterior  || null,
        observacoes_vistoria:       observacoesVistoria|| null,
        cidade_foro:                cidadeForo    || null,
        status:                     status        || "ativo",
      };
      const r = await fetch(`/api/consignacao/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error ?? "Erro ao salvar"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro inesperado");
    } finally { setSaving(false); }
  }

  async function handleUpload(files: FileList) {
    if (!userId || !files.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file); fd.append("label", newLabel); fd.append("userId", userId);
      const r = await fetch(`/api/consignacao/${id}/photos`, { method: "POST", body: fd });
      const d = await r.json();
      if (r.ok) setPhotos(p => [...p, d]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDeletePhoto(photoId: string) {
    setDeleting(photoId);
    await fetch(`/api/consignacao/${id}/photos/${photoId}`, { method: "DELETE" });
    setPhotos(p => p.filter(ph => ph.id !== photoId));
    setDeleting(null);
  }

  async function handleSaveLabel(photoId: string, label: string) {
    await fetch(`/api/consignacao/${id}/photos/${photoId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }),
    });
    setPhotos(p => p.map(ph => ph.id === photoId ? { ...ph, label } : ph));
    setEditingLabel(null);
  }

  async function handleDelete() {
    if (!confirm("Excluir este contrato permanentemente?")) return;
    await fetch(`/api/consignacao/${id}`, { method: "DELETE" });
    router.push("/consignacao");
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid #dc2626", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const cfg = STATUS_CFG[status] ?? STATUS_CFG.ativo;

  return (
    <div style={{ padding: "28px 24px", maxWidth: 860, margin: "0 auto" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={() => router.push("/consignacao")}
            style={{ background: "transparent", border: "1px solid #333", borderRadius: 8, padding: "6px 14px", color: "#9ca3af", cursor: "pointer", fontSize: 13 }}>
            ← Voltar
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0 }}>
              {headerTitle || "Contrato de Consignação"}
            </h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color }}>
              {cfg.label}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => window.open(`/consignacao/${id}/imprimir`, "_blank")}
            style={{ background: "transparent", border: "1px solid #374151", borderRadius: 8, padding: "6px 14px", color: "#9ca3af", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            🖨 Imprimir
          </button>
          <button type="button" onClick={handleDelete}
            style={{ background: "#7f1d1d20", border: "1px solid #7f1d1d", borderRadius: 8, padding: "6px 14px", color: "#fca5a5", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            🗑 Excluir
          </button>
        </div>
      </div>

      <form onSubmit={handleSave}>

        {/* 1. Proprietário */}
        <div style={sec}>
          <p style={stl}>1. Consignante — Proprietário</p>
          <div style={{ ...g2, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Nome / Razão Social</label>
              <input value={proprietarioNome} onChange={e => setProprietarioNome(e.target.value)} style={inp} />
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
              <input value={proprietarioRg} onChange={e => setProprietarioRg(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>CPF / CNPJ</label>
              <input value={proprietarioCpfCnpj} onChange={e => setProprietarioCpfCnpj(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>E-mail</label>
              <input type="email" value={proprietarioEmail} onChange={e => setProprietarioEmail(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>CEP {cepLoading && <span style={{ color: "#6b7280", fontWeight: 400 }}>buscando...</span>}</label>
            <input value={cep} onChange={e => lookupCep(e.target.value)} maxLength={9} style={inp} placeholder="00000-000" />
          </div>
          <div>
            <label style={lbl}>Endereço completo</label>
            <textarea value={proprietarioEndereco} onChange={e => setProprietarioEndereco(e.target.value)} rows={3}
              style={{ ...inp, resize: "vertical" }} />
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
              <input value={lojaCnpj} onChange={e => setLojaCnpj(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Representante Legal</label>
              <input value={lojaResponsavel} onChange={e => setLojaResponsavel(e.target.value)} style={inp} />
            </div>
          </div>
        </div>

        {/* 3. Veículo */}
        <div style={sec}>
          <p style={stl}>3. Dados do Veículo</p>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Marca</label>
              <input value={veiculoMarca} onChange={e => setVeiculoMarca(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Modelo</label>
              <input value={veiculoModelo} onChange={e => setVeiculoModelo(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Versão</label>
              <input value={veiculoVersao} onChange={e => setVeiculoVersao(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Ano Fabricação</label>
              <input type="number" value={veiculoAnoFabricacao} onChange={e => setVeiculoAnoFabricacao(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Ano Modelo</label>
              <input type="number" value={veiculoAnoModelo} onChange={e => setVeiculoAnoModelo(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Placa</label>
              <input value={veiculoPlaca} onChange={e => setVeiculoPlaca(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Chassi</label>
              <input value={veiculoChassi} onChange={e => setVeiculoChassi(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Renavam</label>
              <input value={veiculoRenavam} onChange={e => setVeiculoRenavam(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Quilometragem</label>
              <input type="number" value={veiculoKmAtual} onChange={e => setVeiculoKmAtual(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={g2}>
            <div>
              <label style={lbl}>Cor</label>
              <input value={veiculoCor} onChange={e => setVeiculoCor(e.target.value)} style={inp} />
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
              <input value={valorMinimoVenda} onChange={e => setValorMinimoVenda(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Comissão da loja (%)</label>
              <input type="number" value={percentualComissao} onChange={e => setPercentualComissao(e.target.value)} style={inp} />
            </div>
          </div>
        </div>

        {/* 5. Prazo */}
        <div style={sec}>
          <p style={stl}>5. Prazo</p>
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
              <label style={lbl}>Taxa retirada antecipada (R$)</label>
              <input value={taxaRetirada} onChange={e => setTaxaRetirada(e.target.value)} style={inp} />
            </div>
          </div>
        </div>

        {/* 6. Vistoria */}
        <div style={sec}>
          <p style={stl}>6. Vistoria</p>
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
          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Observações</label>
            <textarea value={observacoesVistoria} onChange={e => setObservacoesVistoria(e.target.value)} rows={3}
              style={{ ...inp, resize: "vertical" }} placeholder="Detalhes do estado do veículo..." />
          </div>

          {/* Fotos */}
          <div>
            <p style={{ ...stl, marginBottom: 12 }}>Fotos de Vistoria ({photos.length})</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={lbl}>Label para novas fotos</label>
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)} style={inp} placeholder="Ex: Frente, Motor, Interior..." />
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ padding: "10px 18px", borderRadius: 10, border: "1px dashed #555", background: "transparent", color: uploading ? "#555" : "#9ca3af", cursor: uploading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
                {uploading ? "Enviando..." : "📷 Adicionar Fotos"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={e => e.target.files && handleUpload(e.target.files)} />
            </div>
            {photos.length === 0 ? (
              <div style={{ border: "2px dashed #2e2e2e", borderRadius: 12, padding: "32px", textAlign: "center", color: "#4b5563" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
                <p style={{ fontSize: 13 }}>Nenhuma foto adicionada ainda.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                {photos.map(ph => (
                  <div key={ph.id} style={{ background: "#111", borderRadius: 12, overflow: "hidden", border: "1px solid #2e2e2e" }}>
                    <div style={{ position: "relative", height: 120 }}>
                      <img src={ph.url} alt={ph.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button type="button" onClick={() => handleDeletePhoto(ph.id)} disabled={deleting === ph.id}
                        style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", background: "#dc262290", border: "none", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {deleting === ph.id ? "…" : "✕"}
                      </button>
                    </div>
                    <div style={{ padding: "8px 10px" }}>
                      {editingLabel?.id === ph.id ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <input value={editingLabel.val} onChange={e => setEditingLabel({ id: ph.id, val: e.target.value })}
                            style={{ ...inp, fontSize: 11, padding: "4px 8px", flex: 1 }} />
                          <button type="button" onClick={() => handleSaveLabel(ph.id, editingLabel.val)}
                            style={{ background: "#10b981", border: "none", borderRadius: 6, color: "#fff", padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>✓</button>
                        </div>
                      ) : (
                        <p onClick={() => setEditingLabel({ id: ph.id, val: ph.label })}
                          style={{ fontSize: 11, color: "#9ca3af", margin: 0, cursor: "pointer", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}
                          title="Clique para editar">✏ {ph.label}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
          <p style={stl}>Status do Contrato</p>
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

        {err   && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>⚠ {err}</p>}
        {saved && <p style={{ color: "#10b981", fontSize: 13, marginBottom: 12 }}>✓ Contrato salvo com sucesso!</p>}

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => router.push("/consignacao")}
            style={{ padding: "12px 24px", borderRadius: 10, border: "1px solid #333", background: "transparent", color: "#9ca3af", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: saving ? "#444" : "#dc2626", color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>

      </form>
    </div>
  );
}
