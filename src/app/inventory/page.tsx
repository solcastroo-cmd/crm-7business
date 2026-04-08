"use client";

/**
 * 🚗 Estoque — Cadastro e gestão de veículos
 *
 * - Lista todos os veículos com status (disponível/vendido/reservado)
 * - Adiciona/edita/remove veículos
 * - IA PAULO usa esse estoque para responder leads no WhatsApp
 */

import { useEffect, useState, useCallback } from "react";

type Vehicle = {
  id:           string;
  brand:        string;
  model:        string;
  year:         string | null;
  plate:        string | null;
  price:        number | null;
  color:        string | null;
  km:           number | null;
  fuel:         string | null;
  transmission: string | null;
  description:  string | null;
  status:       "disponivel" | "vendido" | "reservado";
  created_at:   string;
};

type VehicleForm = Omit<Vehicle, "id" | "created_at" | "price" | "km"> & {
  price: string;
  km:    string;
};

const EMPTY_FORM: VehicleForm = {
  brand: "", model: "", year: "", plate: "", price: "",
  color: "", km: "", fuel: "", transmission: "", description: "", status: "disponivel",
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  disponivel: { label: "Disponível", color: "#22c55e" },
  vendido:    { label: "Vendido",    color: "#888"    },
  reservado:  { label: "Reservado",  color: "#f59e0b" },
};

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 11px", background: "#1a1a1a",
  border: "1px solid #3a3a3a", borderRadius: "8px", color: "#fff",
  fontSize: "13px", outline: "none", boxSizing: "border-box",
};

function fmtPrice(n: number | null) {
  if (!n) return "—";
  return "R$ " + n.toLocaleString("pt-BR");
}

export default function InventoryPage() {
  const [vehicles,    setVehicles]    = useState<Vehicle[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState<Vehicle | null>(null);
  const [form,        setForm]        = useState<VehicleForm>(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [erro,        setErro]        = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory");
    if (res.ok) setVehicles(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErro(null);
    setShowForm(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({
      brand: v.brand, model: v.model, year: v.year ?? "",
      plate: v.plate ?? "", price: v.price ? String(v.price) : "",
      color: v.color ?? "", km: v.km ? String(v.km) : "",
      fuel: v.fuel ?? "", transmission: v.transmission ?? "",
      description: v.description ?? "", status: v.status,
    });
    setErro(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.brand.trim() || !form.model.trim()) {
      setErro("Marca e Modelo são obrigatórios."); return;
    }
    setSaving(true); setErro(null);
    try {
      const method = editing ? "PATCH" : "POST";
      const body   = editing ? { ...form, id: editing.id } : form;
      const res    = await fetch("/api/inventory", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setShowForm(false);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover veículo do estoque?")) return;
    await fetch(`/api/inventory?id=${id}`, { method: "DELETE" });
    setVehicles((prev) => prev.filter((v) => v.id !== id));
  }

  const filtered = vehicles.filter((v) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [v.brand, v.model, v.year, v.plate, v.color]
      .some((f) => f?.toLowerCase().includes(q));
    const matchStatus = filterStatus === "todos" || v.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const Field = ({ label, field, placeholder, type = "text" }: {
    label: string; field: keyof VehicleForm; placeholder?: string; type?: string;
  }) => (
    <div>
      <label className="block text-[11px] text-gray-500 mb-1 uppercase tracking-wider">{label}</label>
      <input type={type} placeholder={placeholder} value={form[field] ?? ""}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
        style={inp}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
        onBlur={(e)  => (e.currentTarget.style.borderColor = "#3a3a3a")} />
    </div>
  );

  return (
    <main className="min-h-screen p-6" style={{ background: "#1a1a1a" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">🚗 Estoque</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {vehicles.filter(v => v.status === "disponivel").length} disponíveis · {vehicles.length} total
          </p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#e63946" }}>
          + Novo Veículo
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input placeholder="Buscar marca, modelo, placa..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px]"
          style={{ ...inp, background: "#232323", border: "1px solid #2e2e2e" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
          onBlur={(e)  => (e.currentTarget.style.borderColor = "#2e2e2e")} />
        {["todos","disponivel","reservado","vendido"].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filterStatus === s ? "#e63946" : "#232323",
              color:      filterStatus === s ? "#fff"    : "#888",
              border:     `1px solid ${filterStatus === s ? "#e63946" : "#2e2e2e"}`,
            }}>
            {s === "todos" ? "Todos" : STATUS_LABEL[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Lista de veículos */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#232323" }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: "#232323", border: "1px solid #2e2e2e" }}>
          <p className="text-4xl mb-3">🚗</p>
          <p className="text-gray-400 font-medium">Nenhum veículo encontrado</p>
          <p className="text-xs text-gray-600 mt-1">Adicione veículos para que a IA possa consultá-los.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => {
            const st = STATUS_LABEL[v.status];
            return (
              <div key={v.id} className="rounded-xl p-4 flex items-center gap-4"
                style={{ background: "#ffffff", borderLeft: `4px solid ${st.color}`, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>

                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>
                      {v.brand} {v.model}
                    </span>
                    {v.year  && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f0f0f0", color: "#555" }}>{v.year}</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: st.color + "20", color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 flex-wrap">
                    {v.plate && <span className="text-xs" style={{ color: "#888" }}>🔖 {v.plate}</span>}
                    {v.color && <span className="text-xs" style={{ color: "#888" }}>🎨 {v.color}</span>}
                    {v.km    && <span className="text-xs" style={{ color: "#888" }}>🛣️ {v.km.toLocaleString("pt-BR")} km</span>}
                    {v.fuel  && <span className="text-xs" style={{ color: "#888" }}>⛽ {v.fuel}</span>}
                  </div>
                  {v.description && (
                    <p className="text-xs mt-1 truncate" style={{ color: "#aaa" }}>{v.description}</p>
                  )}
                </div>

                {/* Preço */}
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-bold" style={{ color: "#e63946" }}>{fmtPrice(v.price)}</p>
                </div>

                {/* Ações */}
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: "#f0f0f0", color: "#333" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#e0e0e0")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#f0f0f0")}>
                    Editar
                  </button>
                  <button onClick={() => handleDelete(v.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: "#fee2e2", color: "#e63946" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#fecaca")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fee2e2")}>
                    Remover
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal de adição/edição ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: "#232323", border: "1px solid #3a3a3a" }}>

            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-white">
                {editing ? "✏️ Editar Veículo" : "🚗 Novo Veículo"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>

            {erro && (
              <div className="mb-4 text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg p-3">{erro}</div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Marca *"    field="brand"    placeholder="Toyota" />
              <Field label="Modelo *"   field="model"    placeholder="Corolla" />
              <Field label="Ano"        field="year"     placeholder="2022" />
              <Field label="Placa"      field="plate"    placeholder="ABC-1234" />
              <Field label="Preço (R$)" field="price"    placeholder="120000" type="number" />
              <Field label="Cor"        field="color"    placeholder="Prata" />
              <Field label="KM"         field="km"       placeholder="45000" type="number" />
              <div>
                <label className="block text-[11px] text-gray-500 mb-1 uppercase tracking-wider">Combustível</label>
                <select value={form.fuel ?? ""}
                  onChange={(e) => setForm({ ...form, fuel: e.target.value })}
                  style={{ ...inp, appearance: "none" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#3a3a3a")}>
                  <option value="">Selecionar</option>
                  {["Flex","Gasolina","Diesel","Elétrico","Híbrido","GNV"].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1 uppercase tracking-wider">Câmbio</label>
                <select value={form.transmission ?? ""}
                  onChange={(e) => setForm({ ...form, transmission: e.target.value })}
                  style={{ ...inp, appearance: "none" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#3a3a3a")}>
                  <option value="">Selecionar</option>
                  {["Manual","Automático","CVT","Semi-automático"].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1 uppercase tracking-wider">Status</label>
                <select value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as VehicleForm["status"] })}
                  style={{ ...inp, appearance: "none" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#3a3a3a")}>
                  <option value="disponivel">Disponível</option>
                  <option value="reservado">Reservado</option>
                  <option value="vendido">Vendido</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-gray-500 mb-1 uppercase tracking-wider">Descrição / Obs.</label>
                <textarea placeholder="Único dono, revisado, IPVA 2025 pago..." value={form.description ?? ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  style={{ ...inp, resize: "vertical" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#3a3a3a")} />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 transition-all"
                style={{ background: "#2a2a2a", border: "1px solid #3a3a3a" }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: saving ? "#555" : "#e63946" }}>
                {saving ? "Salvando..." : (editing ? "Salvar Alterações" : "Adicionar Veículo")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
