"use client";
import { useState, useEffect, useRef, useCallback, memo, forwardRef, useImperativeHandle } from "react";
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

type FProps = {
  label: string; name: string; type?: string; placeholder?: string;
  full?: boolean; as?: string; options?: string[];
  initialValue: string; onChangeRef: React.MutableRefObject<(k: string, v: string) => void>;
};

type FieldHandle = { setValue: (v: string) => void };

// Não-controlado (defaultValue) — imune a IME mobile e re-renders do pai
const Field = memo(forwardRef<FieldHandle, FProps>(function Field(
  { label, name, type = "text", placeholder = "", full = false, as: as_ = "input", options = [], initialValue, onChangeRef },
  ref
) {
  const domRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

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
  const enderecoFieldRef = useRef<FieldHandle | null>(null);

  const formRef = useRef<Record<string, string>>({});

  const [userId, setUserId]     = useState<string | null>(null);
  const [photos, setPhotos]     = useState<Photo[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [saved, setSaved]       = useState(false);
  const [newLabel, setNewLabel] = useState("Foto");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<{ id: string; val: string } | null>(null);
  const [cep, setCep]               = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [status, setStatus]     = useState("ativo");
  const [headerTitle, setHeaderTitle] = useState("");

  // Ref estável para o handler — Field nunca re-renderiza por causa do pai
  const handleChangeImpl = useCallback((k: string, v: string) => {
    formRef.current[k] = v;
    if (k === "status") setStatus(v);
  }, []);
  const onChangeRef = useRef(handleChangeImpl);
  onChangeRef.current = handleChangeImpl;

  const load = useCallback(async () => {
    const r = await fetch(`/api/consignacao/${id}`);
    const d = await r.json();
    if (!r.ok) { router.push("/consignacao"); return; }
    const { consignment_photos, ...rest } = d as Contract;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) {
      flat[k] = v == null ? "" : String(v);
    }
    formRef.current = flat;
    setStatus(flat.status ?? "ativo");
    setHeaderTitle(`${flat.veiculo_marca ?? ""} ${flat.veiculo_modelo ?? ""}`.trim());
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
    setErr(null); setSaving(true); setSaved(false);
    try {
      const f = formRef.current;
      const num = (v: string) => v ? parseFloat(v.replace(/\./g, "").replace(",", ".")) : null;
      const int = (v: string) => v ? parseInt(v) : null;
      const dt  = (v: string) => v || null;
      const payload = {
        proprietario_nome:         f.proprietario_nome         || null,
        proprietario_nacionalidade:f.proprietario_nacionalidade|| null,
        proprietario_estado_civil: f.proprietario_estado_civil || null,
        proprietario_profissao:    f.proprietario_profissao    || null,
        proprietario_rg:           f.proprietario_rg           || null,
        proprietario_cpf_cnpj:     f.proprietario_cpf_cnpj    || null,
        proprietario_endereco:     f.proprietario_endereco     || null,
        proprietario_telefone:     f.proprietario_telefone     || null,
        proprietario_email:        f.proprietario_email        || null,
        loja_razao_social:         f.loja_razao_social         || null,
        loja_nome_fantasia:        f.loja_nome_fantasia        || null,
        loja_cnpj:                 f.loja_cnpj                 || null,
        loja_responsavel:          f.loja_responsavel          || null,
        veiculo_marca:             f.veiculo_marca             || null,
        veiculo_modelo:            f.veiculo_modelo            || null,
        veiculo_versao:            f.veiculo_versao            || null,
        veiculo_ano_fabricacao:    int(f.veiculo_ano_fabricacao),
        veiculo_ano_modelo:        int(f.veiculo_ano_modelo),
        veiculo_placa:             f.veiculo_placa             || null,
        veiculo_chassi:            f.veiculo_chassi            || null,
        veiculo_renavam:           f.veiculo_renavam           || null,
        veiculo_cor:               f.veiculo_cor               || null,
        veiculo_combustivel:       f.veiculo_combustivel       || null,
        veiculo_km_atual:          int(f.veiculo_km_atual),
        valor_minimo_venda:        num(f.valor_minimo_venda),
        percentual_comissao:       num(f.percentual_comissao),
        taxa_retirada:             num(f.taxa_retirada),
        data_inicio:               dt(f.data_inicio),
        data_final:                dt(f.data_final),
        data_assinatura:           dt(f.data_assinatura),
        vistoria_pintura:          f.vistoria_pintura          || null,
        vistoria_pneus:            f.vistoria_pneus            || null,
        vistoria_interior:         f.vistoria_interior         || null,
        observacoes_vistoria:      f.observacoes_vistoria      || null,
        cidade_foro:               f.cidade_foro               || null,
        status:                    status                      || "ativo",
      };
      const r = await fetch(`/api/consignacao/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error ?? "Erro ao salvar"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro inesperado ao salvar");
    } finally {
      setSaving(false);
    }
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

  const cfg = STATUS_CFG[status] ?? STATUS_CFG.ativo;

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
              {headerTitle || "Contrato de Consignação"}
            </h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color }}>
              {cfg.label}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => window.open(`/consignacao/${id}/imprimir`, "_blank")}
            style={{ background: "transparent", border: "1px solid #374151", borderRadius: 8, padding: "6px 14px", color: "#9ca3af", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            🖨 Imprimir
          </button>
          <button onClick={handleDelete}
            style={{ background: "#7f1d1d20", border: "1px solid #7f1d1d", borderRadius: 8, padding: "6px 14px", color: "#fca5a5", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            🗑 Excluir
          </button>
        </div>
      </div>

      {/* 1. Consignante */}
      <div style={section}>
        <p style={sTitle}>1. Consignante — Proprietário</p>
        <div style={{ ...grid2, marginBottom: 12 }}>
          <Field {...fv("proprietario_nome")} label="Nome / Razão Social" name="proprietario_nome" />
          <Field {...fv("proprietario_telefone")} label="Telefone" name="proprietario_telefone" placeholder="(00) 00000-0000" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("proprietario_nacionalidade")} label="Nacionalidade" name="proprietario_nacionalidade" />
          <Field {...fv("proprietario_estado_civil")} label="Estado Civil" name="proprietario_estado_civil" as="select" options={["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União Estável"]} />
          <Field {...fv("proprietario_profissao")} label="Profissão" name="proprietario_profissao" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("proprietario_rg")} label="RG" name="proprietario_rg" />
          <Field {...fv("proprietario_cpf_cnpj")} label="CPF / CNPJ" name="proprietario_cpf_cnpj" />
          <Field {...fv("proprietario_email")} label="E-mail" name="proprietario_email" type="email" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>CEP {cepLoading && <span style={{ color: "#6b7280", fontWeight: 400 }}>buscando...</span>}</label>
          <input value={cep} onChange={e => lookupCep(e.target.value)} maxLength={9}
            style={inp} placeholder="00000-000" autoComplete="off" />
        </div>
        <Field {...fv("proprietario_endereco")} label="Endereço completo" name="proprietario_endereco" full as="textarea" ref={enderecoFieldRef} />
      </div>

      {/* 2. Consignatária */}
      <div style={section}>
        <p style={sTitle}>2. Consignatária — Loja</p>
        <div style={{ ...grid2, marginBottom: 12 }}>
          <Field {...fv("loja_razao_social")} label="Razão Social" name="loja_razao_social" />
          <Field {...fv("loja_nome_fantasia")} label="Nome Fantasia" name="loja_nome_fantasia" />
        </div>
        <div style={grid2}>
          <Field {...fv("loja_cnpj")} label="CNPJ" name="loja_cnpj" />
          <Field {...fv("loja_responsavel")} label="Representante Legal" name="loja_responsavel" />
        </div>
      </div>

      {/* 3. Veículo */}
      <div style={section}>
        <p style={sTitle}>3. Dados do Veículo</p>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("veiculo_marca")} label="Marca" name="veiculo_marca" />
          <Field {...fv("veiculo_modelo")} label="Modelo" name="veiculo_modelo" />
          <Field {...fv("veiculo_versao")} label="Versão" name="veiculo_versao" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("veiculo_ano_fabricacao")} label="Ano Fabricação" name="veiculo_ano_fabricacao" type="number" />
          <Field {...fv("veiculo_ano_modelo")} label="Ano Modelo" name="veiculo_ano_modelo" type="number" />
          <Field {...fv("veiculo_placa")} label="Placa" name="veiculo_placa" />
        </div>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("veiculo_chassi")} label="Chassi" name="veiculo_chassi" />
          <Field {...fv("veiculo_renavam")} label="Renavam" name="veiculo_renavam" />
          <Field {...fv("veiculo_km_atual")} label="Quilometragem" name="veiculo_km_atual" type="number" />
        </div>
        <div style={grid2}>
          <Field {...fv("veiculo_cor")} label="Cor" name="veiculo_cor" />
          <Field {...fv("veiculo_combustivel")} label="Combustível" name="veiculo_combustivel" as="select" options={COMB} />
        </div>
      </div>

      {/* 4. Valor */}
      <div style={section}>
        <p style={sTitle}>4. Valor e Comissão</p>
        <div style={grid2}>
          <Field {...fv("valor_minimo_venda")} label="Valor mínimo de venda (R$)" name="valor_minimo_venda" />
          <Field {...fv("percentual_comissao")} label="Comissão da loja (%)" name="percentual_comissao" type="number" />
        </div>
      </div>

      {/* 5. Prazo */}
      <div style={section}>
        <p style={sTitle}>5. Prazo</p>
        <div style={grid3}>
          <Field {...fv("data_inicio")} label="Data de início" name="data_inicio" type="date" />
          <Field {...fv("data_final")} label="Data final" name="data_final" type="date" />
          <Field {...fv("taxa_retirada")} label="Taxa retirada antecipada (R$)" name="taxa_retirada" />
        </div>
      </div>

      {/* 6. Vistoria + Fotos */}
      <div style={section}>
        <p style={sTitle}>6. Vistoria</p>
        <div style={{ ...grid3, marginBottom: 12 }}>
          <Field {...fv("vistoria_pintura")} label="Pintura" name="vistoria_pintura" as="select" options={COND} />
          <Field {...fv("vistoria_pneus")} label="Pneus" name="vistoria_pneus" as="select" options={COND} />
          <Field {...fv("vistoria_interior")} label="Interior" name="vistoria_interior" as="select" options={COND} />
        </div>
        <Field {...fv("observacoes_vistoria")} label="Observações" name="observacoes_vistoria" as="textarea" full placeholder="Detalhes do estado do veículo..." />

        <div style={{ marginTop: 24 }}>
          <p style={{ ...sTitle, marginBottom: 12 }}>Fotos de Vistoria ({photos.length})</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={lbl}>Label para novas fotos</label>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                style={{ ...inp }} placeholder="Ex: Frente, Motor, Interior..."
                autoComplete="off" />
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
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
                    <button onClick={() => handleDeletePhoto(ph.id)} disabled={deleting === ph.id}
                      style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", background: "#dc262290", border: "none", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {deleting === ph.id ? "…" : "✕"}
                    </button>
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    {editingLabel?.id === ph.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input value={editingLabel.val} onChange={e => setEditingLabel({ id: ph.id, val: e.target.value })}
                          style={{ ...inp, fontSize: 11, padding: "4px 8px", flex: 1 }} autoComplete="off" />
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
          <Field {...fv("cidade_foro")} label="Cidade do Foro" name="cidade_foro" />
          <Field {...fv("data_assinatura")} label="Data de assinatura" name="data_assinatura" type="date" />
        </div>
      </div>

      {/* Status */}
      <div style={section}>
        <p style={sTitle}>Status do Contrato</p>
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
