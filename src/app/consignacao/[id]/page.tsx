"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

type Photo = { id: string; url: string; label: string };
type Contract = Record<string, string | number | null | Photo[]> & {
  id: string; status: string; consignment_photos: Photo[];
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

  const [userId, setUserId]     = useState<string | null>(null);
  const [form, setForm]         = useState<Record<string, string>>({});
  const [photos, setPhotos]     = useState<Photo[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [saved, setSaved]       = useState(false);
  const [newLabel, setNewLabel] = useState("Foto");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<{ id: string; val: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/consignacao/${id}`);
    const d = await r.json();
    if (!r.ok) { router.push("/consignacao"); return; }
    const { consignment_photos, ...rest } = d as Contract;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) {
      flat[k] = v == null ? "" : String(v);
    }
    setForm(flat);
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

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const F = ({ label, name, type = "text", placeholder = "", full = false, as = "input", options = [] as string[] }) => (
    <div style={full ? { gridColumn: "1/-1" } : {}}>
      <label style={lbl}>{label}</label>
      {as === "select" ? (
        <select value={form[name] ?? ""} onChange={e => set(name, e.target.value)} style={{ ...inp, appearance: "none" }}>
          <option value="">— Selecione —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : as === "textarea" ? (
        <textarea value={form[name] ?? ""} onChange={e => set(name, e.target.value)}
          rows={3} style={{ ...inp, resize: "vertical" }} placeholder={placeholder} />
      ) : (
        <input type={type} value={form[name] ?? ""} onChange={e => set(name, e.target.value)}
          style={inp} placeholder={placeholder} />
      )}
    </div>
  );

  async function handleSave() {
    setErr(null); setSaving(true); setSaved(false);
    const payload = {
      ...form,
      veiculo_ano_fabricacao: form.veiculo_ano_fabricacao ? parseInt(form.veiculo_ano_fabricacao) : null,
      veiculo_ano_modelo:     form.veiculo_ano_modelo     ? parseInt(form.veiculo_ano_modelo)     : null,
      veiculo_km_atual:       form.veiculo_km_atual       ? parseInt(form.veiculo_km_atual)       : null,
      valor_minimo_venda:     form.valor_minimo_venda     ? parseFloat(form.valor_minimo_venda.replace(/\./g,"").replace(",",".")) : null,
      percentual_comissao:    form.percentual_comissao    ? parseFloat(form.percentual_comissao)  : null,
      taxa_retirada:          form.taxa_retirada          ? parseFloat(form.taxa_retirada.replace(/\./g,"").replace(",",".")) : null,
      data_inicio:     form.data_inicio     || null,
      data_final:      form.data_final      || null,
      data_assinatura: form.data_assinatura || null,
    };
    delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.user_id;
    const r = await fetch(`/api/consignacao/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) { setErr(d.error ?? "Erro ao salvar"); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleUpload(files: FileList) {
    if (!userId || !files.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", newLabel);
      fd.append("userId", userId);
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

  const cfg = STATUS_CFG[form.status] ?? STATUS_CFG.ativo;

  return (
    <div style={{ padding: "28px 24px", maxWidth: 860, margin: "0 auto" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.push("/consignacao")}
            style={{ background: "transparent", border: "1px solid #333", borderRadius: 8, padding: "6px 14px", color: "#9ca3af", cursor: "pointer", fontSize: 13 }}>
            ← Voltar
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0 }}>
              {form.veiculo_marca} {form.veiculo_modelo} {form.veiculo_placa ? `— ${form.veiculo_placa}` : ""}
            </h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color }}>
              {cfg.label}
            </span>
          </div>
        </div>
        <button onClick={handleDelete}
          style={{ background: "#7f1d1d20", border: "1px solid #7f1d1d", borderRadius: 8, padding: "6px 14px", color: "#fca5a5", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          🗑 Excluir
        </button>
      </div>

      {/* 1. Consignante */}
      <div style={section}>
        <p style={sTitle}>1. Consignante — Proprietário</p>
        <div style={{ ...grid2, marginBottom: 12 }}>
          <F label="Nome / Razão Social" name="proprietario_nome" />
          <F label="Telefone" name="proprietario_telefone" placeholder="(00) 00000-0000" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="Nacionalidade" name="proprietario_nacionalidade" />
          <F label="Estado Civil" name="proprietario_estado_civil" as="select" options={["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União Estável"]} />
          <F label="Profissão" name="proprietario_profissao" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="RG" name="proprietario_rg" />
          <F label="CPF / CNPJ" name="proprietario_cpf_cnpj" />
          <F label="E-mail" name="proprietario_email" type="email" />
        </div>
        <F label="Endereço" name="proprietario_endereco" full />
      </div>

      {/* 2. Consignatária */}
      <div style={section}>
        <p style={sTitle}>2. Consignatária — Loja</p>
        <div style={{ ...grid2, marginBottom: 12 }}>
          <F label="Razão Social" name="loja_razao_social" />
          <F label="Nome Fantasia" name="loja_nome_fantasia" />
        </div>
        <div style={grid2}>
          <F label="CNPJ" name="loja_cnpj" />
          <F label="Representante Legal" name="loja_responsavel" />
        </div>
      </div>

      {/* 3. Veículo */}
      <div style={section}>
        <p style={sTitle}>3. Dados do Veículo</p>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="Marca" name="veiculo_marca" />
          <F label="Modelo" name="veiculo_modelo" />
          <F label="Versão" name="veiculo_versao" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="Ano Fabricação" name="veiculo_ano_fabricacao" type="number" />
          <F label="Ano Modelo" name="veiculo_ano_modelo" type="number" />
          <F label="Placa" name="veiculo_placa" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="Chassi" name="veiculo_chassi" />
          <F label="Renavam" name="veiculo_renavam" />
          <F label="Quilometragem" name="veiculo_km_atual" type="number" />
        </div>
        <div style={grid2}>
          <F label="Cor" name="veiculo_cor" />
          <F label="Combustível" name="veiculo_combustivel" as="select" options={COMB} />
        </div>
      </div>

      {/* 4. Valor */}
      <div style={section}>
        <p style={sTitle}>4. Valor e Comissão</p>
        <div style={grid2}>
          <F label="Valor mínimo de venda (R$)" name="valor_minimo_venda" />
          <F label="Comissão da loja (%)" name="percentual_comissao" type="number" />
        </div>
        {form.valor_minimo_venda && form.percentual_comissao && (
          <p style={{ color: "#10b981", fontSize: 13, marginTop: 10 }}>
            💰 Comissão estimada: R$ {(parseFloat(form.valor_minimo_venda.replace(/\./g,"").replace(",",".") || "0") * parseFloat(form.percentual_comissao) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>

      {/* 5. Prazo */}
      <div style={section}>
        <p style={sTitle}>5. Prazo</p>
        <div style={grid3}>
          <F label="Data de início" name="data_inicio" type="date" />
          <F label="Data final" name="data_final" type="date" />
          <F label="Taxa retirada antecipada (R$)" name="taxa_retirada" />
        </div>
      </div>

      {/* 6. Vistoria + Fotos */}
      <div style={section}>
        <p style={sTitle}>6. Vistoria</p>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <F label="Pintura" name="vistoria_pintura" as="select" options={COND} />
          <F label="Pneus" name="vistoria_pneus" as="select" options={COND} />
          <F label="Interior" name="vistoria_interior" as="select" options={COND} />
        </div>
        <F label="Observações" name="observacoes_vistoria" as="textarea" full placeholder="Detalhes do estado do veículo..." />

        {/* Upload de fotos */}
        <div style={{ marginTop: 24 }}>
          <p style={{ ...sTitle, marginBottom: 12 }}>Fotos de Vistoria ({photos.length})</p>

          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={lbl}>Label para novas fotos</label>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                style={{ ...inp }} placeholder="Ex: Frente, Motor, Interior..." />
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ padding: "10px 18px", borderRadius: 10, border: "1px dashed #555", background: "transparent", color: uploading ? "#555" : "#9ca3af", cursor: uploading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
              {uploading ? "Enviando..." : "📷 Adicionar Fotos"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={e => e.target.files && handleUpload(e.target.files)} />
          </div>

          {/* Grid de fotos */}
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
                    <button
                      onClick={() => handleDeletePhoto(ph.id)}
                      disabled={deleting === ph.id}
                      style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", background: "#dc262290", border: "none", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {deleting === ph.id ? "…" : "✕"}
                    </button>
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    {editingLabel?.id === ph.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input value={editingLabel.val} onChange={e => setEditingLabel({ id: ph.id, val: e.target.value })}
                          style={{ ...inp, fontSize: 11, padding: "4px 8px", flex: 1 }} />
                        <button onClick={() => handleSaveLabel(ph.id, editingLabel.val)}
                          style={{ background: "#10b981", border: "none", borderRadius: 6, color: "#fff", padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>✓</button>
                      </div>
                    ) : (
                      <p onClick={() => setEditingLabel({ id: ph.id, val: ph.label })}
                        style={{ fontSize: 11, color: "#9ca3af", margin: 0, cursor: "pointer", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}
                        title="Clique para editar">
                        ✏ {ph.label}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
        <p style={sTitle}>Status do Contrato</p>
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

      {err   && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>⚠ {err}</p>}
      {saved && <p style={{ color: "#10b981", fontSize: 13, marginBottom: 12 }}>✓ Contrato salvo com sucesso!</p>}

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button onClick={() => router.push("/consignacao")}
          style={{ padding: "12px 24px", borderRadius: 10, border: "1px solid #333", background: "transparent", color: "#9ca3af", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: saving ? "#444" : "#dc2626", color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>
    </div>
  );
}
