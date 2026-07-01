"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

type Photo = { id: string; url: string; label: string };
type Data  = Record<string, string>;

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

/* select com defaultValue — definido fora do componente para não remontar a cada render */
function Sel({ name, options, dv }: { name: string; options: string[]; dv: string }) {
  return (
    <select name={name} defaultValue={dv} style={{ ...inp, appearance: "none" }}>
      <option value="">— Selecione —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

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
  const enderecoRef = useRef<HTMLTextAreaElement>(null);

  const [d,         setD]         = useState<Data | null>(null);
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
  const [cepLoading,   setCepLoading]   = useState(false);
  const [status,    setStatus]    = useState("ativo");

  const load = useCallback(async () => {
    const r = await fetch(`/api/consignacao/${id}`);
    const json = await r.json();
    if (!r.ok) { router.push("/consignacao"); return; }
    const { consignment_photos, ...rest } = json;
    const flat: Data = {};
    for (const [k, v] of Object.entries(rest)) flat[k] = v == null ? "" : String(v);
    setD(flat);
    setStatus(flat.status || "ativo");
    setPhotos(Array.isArray(consignment_photos) ? consignment_photos : []);
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: Awaited<ReturnType<typeof supabase.auth.getUser>>) => {
      if (!data?.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      load();
    });
  }, [router, load]);

  const lookupCep = useCallback(async (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const json = await r.json();
      if (!json.erro && enderecoRef.current) {
        enderecoRef.current.value = [
          json.logradouro, json.complemento, json.bairro,
          `${json.localidade} - ${json.uf}`,
          `CEP: ${digits.replace(/(\d{5})(\d{3})/, "$1-$2")}`,
        ].filter(Boolean).join(", ");
      }
    } finally { setCepLoading(false); }
  }, []);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setSaving(true); setSaved(false);
    try {
      const fd = new FormData(e.currentTarget);
      const g = (k: string) => (fd.get(k) as string | null) ?? "";
      const num = (v: string) => v ? parseFloat(v.replace(/\./g, "").replace(",", ".")) : null;
      const int = (v: string) => v ? parseInt(v) : null;

      const payload = {
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
        data_inicio:                g("data_inicio")     || null,
        data_final:                 g("data_final")      || null,
        data_assinatura:            g("data_assinatura") || null,
        vistoria_pintura:           g("vistoria_pintura")    || null,
        vistoria_pneus:             g("vistoria_pneus")      || null,
        vistoria_interior:          g("vistoria_interior")   || null,
        observacoes_vistoria:       g("observacoes_vistoria")|| null,
        cidade_foro:                g("cidade_foro")     || null,
        status,
      };

      const r = await fetch(`/api/consignacao/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error ?? "Erro ao salvar"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Erro inesperado");
    } finally { setSaving(false); }
  }

  async function handleUpload(files: FileList) {
    if (!userId || !files.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file); fd.append("label", newLabel); fd.append("userId", userId);
      const r = await fetch(`/api/consignacao/${id}/photos`, { method: "POST", body: fd });
      const json = await r.json();
      if (r.ok) setPhotos(p => [...p, json]);
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

  if (loading || !d) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid #dc2626", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const cfg = STATUS_CFG[status] ?? STATUS_CFG.ativo;
  const headerTitle = `${d.veiculo_marca ?? ""} ${d.veiculo_modelo ?? ""}`.trim() || "Contrato de Consignação";

  return (
    <div style={{ padding: "28px 24px", maxWidth: 860, margin: "0 auto" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={() => router.push("/consignacao")}
            style={{ background: "transparent", border: "1px solid #333", borderRadius: 8, padding: "6px 14px", color: "#9ca3af", cursor: "pointer", fontSize: 13 }}>
            ← Voltar
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0 }}>{headerTitle}</h1>
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
            <div><label style={lbl}>Nome / Razão Social</label>
              <input name="proprietario_nome" defaultValue={d.proprietario_nome} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Telefone</label>
              <input name="proprietario_telefone" defaultValue={d.proprietario_telefone} style={inp} autoComplete="off" /></div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div><label style={lbl}>Nacionalidade</label>
              <input name="proprietario_nacionalidade" defaultValue={d.proprietario_nacionalidade} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Estado Civil</label>
              <Sel name="proprietario_estado_civil" options={EC} dv={d.proprietario_estado_civil} /></div>
            <div><label style={lbl}>Profissão</label>
              <input name="proprietario_profissao" defaultValue={d.proprietario_profissao} style={inp} autoComplete="off" /></div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div><label style={lbl}>RG</label>
              <input name="proprietario_rg" defaultValue={d.proprietario_rg} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>CPF / CNPJ</label>
              <input name="proprietario_cpf_cnpj" defaultValue={d.proprietario_cpf_cnpj} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>E-mail</label>
              <input type="email" name="proprietario_email" defaultValue={d.proprietario_email} style={inp} autoComplete="off" /></div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>CEP {cepLoading && <span style={{ color: "#6b7280", fontWeight: 400 }}>buscando...</span>}</label>
            <input style={inp} placeholder="00000-000" maxLength={9} autoComplete="off"
              onBlur={e => lookupCep(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Endereço completo</label>
            <textarea ref={enderecoRef} name="proprietario_endereco" defaultValue={d.proprietario_endereco}
              rows={3} style={{ ...inp, resize: "vertical" }} />
          </div>
        </div>

        {/* 2. Loja */}
        <div style={sec}>
          <p style={stl}>2. Consignatária — Loja</p>
          <div style={{ ...g2, marginBottom: 12 }}>
            <div><label style={lbl}>Razão Social</label>
              <input name="loja_razao_social" defaultValue={d.loja_razao_social} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Nome Fantasia</label>
              <input name="loja_nome_fantasia" defaultValue={d.loja_nome_fantasia} style={inp} autoComplete="off" /></div>
          </div>
          <div style={g2}>
            <div><label style={lbl}>CNPJ</label>
              <input name="loja_cnpj" defaultValue={d.loja_cnpj} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Representante Legal</label>
              <input name="loja_responsavel" defaultValue={d.loja_responsavel} style={inp} autoComplete="off" /></div>
          </div>
        </div>

        {/* 3. Veículo */}
        <div style={sec}>
          <p style={stl}>3. Dados do Veículo</p>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div><label style={lbl}>Marca</label><input name="veiculo_marca" defaultValue={d.veiculo_marca} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Modelo</label><input name="veiculo_modelo" defaultValue={d.veiculo_modelo} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Versão</label><input name="veiculo_versao" defaultValue={d.veiculo_versao} style={inp} autoComplete="off" /></div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div><label style={lbl}>Ano Fabricação</label><input type="number" name="veiculo_ano_fabricacao" defaultValue={d.veiculo_ano_fabricacao} style={inp} /></div>
            <div><label style={lbl}>Ano Modelo</label><input type="number" name="veiculo_ano_modelo" defaultValue={d.veiculo_ano_modelo} style={inp} /></div>
            <div><label style={lbl}>Placa</label><input name="veiculo_placa" defaultValue={d.veiculo_placa} style={inp} autoComplete="off" /></div>
          </div>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div><label style={lbl}>Chassi</label><input name="veiculo_chassi" defaultValue={d.veiculo_chassi} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Renavam</label><input name="veiculo_renavam" defaultValue={d.veiculo_renavam} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Quilometragem</label><input type="number" name="veiculo_km_atual" defaultValue={d.veiculo_km_atual} style={inp} /></div>
          </div>
          <div style={g2}>
            <div><label style={lbl}>Cor</label><input name="veiculo_cor" defaultValue={d.veiculo_cor} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Combustível</label><Sel name="veiculo_combustivel" options={COMB} dv={d.veiculo_combustivel} /></div>
          </div>
        </div>

        {/* 4. Valor */}
        <div style={sec}>
          <p style={stl}>4. Valor e Comissão</p>
          <div style={g2}>
            <div><label style={lbl}>Valor mínimo de venda (R$)</label>
              <input name="valor_minimo_venda" defaultValue={d.valor_minimo_venda} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Comissão da loja (%)</label>
              <input type="number" name="percentual_comissao" defaultValue={d.percentual_comissao} style={inp} /></div>
          </div>
        </div>

        {/* 5. Prazo */}
        <div style={sec}>
          <p style={stl}>5. Prazo</p>
          <div style={g3}>
            <div><label style={lbl}>Data de início</label><input type="date" name="data_inicio" defaultValue={d.data_inicio} style={inp} /></div>
            <div><label style={lbl}>Data final</label><input type="date" name="data_final" defaultValue={d.data_final} style={inp} /></div>
            <div><label style={lbl}>Taxa retirada antecipada (R$)</label><input name="taxa_retirada" defaultValue={d.taxa_retirada} style={inp} autoComplete="off" /></div>
          </div>
        </div>

        {/* 6. Vistoria */}
        <div style={sec}>
          <p style={stl}>6. Vistoria</p>
          <div style={{ ...g3, marginBottom: 12 }}>
            <div><label style={lbl}>Pintura</label><Sel name="vistoria_pintura" options={COND} dv={d.vistoria_pintura} /></div>
            <div><label style={lbl}>Pneus</label><Sel name="vistoria_pneus" options={COND} dv={d.vistoria_pneus} /></div>
            <div><label style={lbl}>Interior</label><Sel name="vistoria_interior" options={COND} dv={d.vistoria_interior} /></div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Observações</label>
            <textarea name="observacoes_vistoria" defaultValue={d.observacoes_vistoria}
              rows={3} style={{ ...inp, resize: "vertical" }} />
          </div>

          {/* Fotos */}
          <div>
            <p style={{ ...stl, marginBottom: 12 }}>Fotos de Vistoria ({photos.length})</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={lbl}>Label para novas fotos</label>
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  style={inp} placeholder="Ex: Frente, Motor..." autoComplete="off" />
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
                            style={{ ...inp, fontSize: 11, padding: "4px 8px", flex: 1 }} autoComplete="off" />
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
            <div><label style={lbl}>Cidade do Foro</label>
              <input name="cidade_foro" defaultValue={d.cidade_foro} style={inp} autoComplete="off" /></div>
            <div><label style={lbl}>Data de assinatura</label>
              <input type="date" name="data_assinatura" defaultValue={d.data_assinatura} style={inp} /></div>
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
                  background:  status === s ? "#dc262620" : "transparent",
                  color:       status === s ? "#f87171" : "#9ca3af",
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
