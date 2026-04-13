"use client";
import { useState, useEffect, useCallback } from "react";

type Vehicle = {
  id: string; brand: string; model: string; year?: number; plate?: string;
  price?: number; price_fipe?: number; color?: string; km?: number;
  fuel?: string; transmission?: string; body_type?: string; doors?: number;
  end_plate?: string; renavam?: string; chassis?: string;
  ipva_paid?: boolean; single_owner?: boolean; has_manual?: boolean; has_key?: boolean;
  optional_items?: string[]; description?: string; status: string; created_at?: string;
};

const OPTIONALS = [
  "Ar Condicionado","Direcao Hidraulica","Vidros Eletricos","Trava Eletrica",
  "Airbag","ABS","Sensor de Re","Camera de Re","Central Multimidia",
  "Bluetooth","GPS","Teto Solar","Rodas de Liga","Bancos em Couro",
  "Alarme","Farol de Milha","Piloto Automatico","Park Assist",
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  disponivel: { label: "Disponivel", color: "#10b981", bg: "#dcfce7" },
  reservado:  { label: "Reservado",  color: "#f59e0b", bg: "#fef9c3" },
  vendido:    { label: "Vendido",    color: "#6366f1", bg: "#ede9fe" },
};

const BRANDS = ["Toyota","Honda","Volkswagen","Chevrolet","Ford","Fiat","Hyundai","Nissan","Jeep","Renault","Mitsubishi","BMW","Mercedes-Benz","Audi","Outros"];

const EMPTY: Omit<Vehicle,"id"|"created_at"> = {
  brand:"",model:"",year: new Date().getFullYear(),plate:"",price:undefined,price_fipe:undefined,
  color:"",km:undefined,fuel:"",transmission:"",body_type:"",doors:undefined,end_plate:"",
  renavam:"",chassis:"",ipva_paid:false,single_owner:false,has_manual:false,has_key:false,
  optional_items:[],description:"",status:"disponivel",
};

export default function InventoryPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid"|"list">("grid");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      setVehicles(Array.isArray(data) ? data : []);
    } catch { setErr("Erro ao carregar estoque."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  const filtered = vehicles.filter(v => {
    if (filterStatus !== "all" && v.status !== filterStatus) return false;
    if (filterBrand && v.brand !== filterBrand) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${v.brand} ${v.model} ${v.plate ?? ""} ${v.year ?? ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setShowForm(true); setErr(null); }
  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({ brand:v.brand,model:v.model,year:v.year,plate:v.plate,price:v.price,price_fipe:v.price_fipe,
      color:v.color,km:v.km,fuel:v.fuel,transmission:v.transmission,body_type:v.body_type,doors:v.doors,
      end_plate:v.end_plate,renavam:v.renavam,chassis:v.chassis,ipva_paid:v.ipva_paid??false,
      single_owner:v.single_owner??false,has_manual:v.has_manual??false,has_key:v.has_key??false,
      optional_items:v.optional_items??[],description:v.description,status:v.status });
    setShowForm(true); setErr(null);
  }

  async function handleSave() {
    if (!form.brand || !form.model) { setErr("Marca e Modelo sao obrigatorios."); return; }
    setSaving(true); setErr(null);
    try {
      const url = editing ? `/api/inventory?id=${editing.id}` : "/api/inventory";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Erro ao salvar."); return; }
      await loadVehicles(); setShowForm(false);
    } catch { setErr("Erro de rede."); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/inventory?id=${id}`, { method: "DELETE" });
      setVehicles(prev => prev.filter(v => v.id !== id));
    } catch { /* ignore */ }
    setConfirmDel(null);
  }

  async function quickStatus(id: string, status: string) {
    try {
      await fetch(`/api/inventory?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      setVehicles(prev => prev.map(v => v.id === id ? { ...v, status } : v));
    } catch { /* ignore */ }
  }

  function toggleOptional(opt: string) {
    setForm(f => ({
      ...f,
      optional_items: f.optional_items?.includes(opt)
        ? f.optional_items.filter(o => o !== opt)
        : [...(f.optional_items ?? []), opt],
    }));
  }

  const f = (label: string, key: keyof typeof EMPTY, type = "text", placeholder = "") => (
    <div>
      <label className="text-xs font-semibold text-gray-400 block mb-1">{label}</label>
      <input type={type} value={form[key] as string ?? ""} onChange={e => setForm(p => ({ ...p, [key]: type === "number" ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl text-sm border focus:outline-none"
        style={{ background: "#1a1a1a", border: "1px solid #3a3a3a", color: "#fff" }} />
    </div>
  );

  const sel = (label: string, key: keyof typeof EMPTY, options: string[]) => (
    <div>
      <label className="text-xs font-semibold text-gray-400 block mb-1">{label}</label>
      <select value={form[key] as string ?? ""} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        className="w-full px-3 py-2 rounded-xl text-sm border focus:outline-none"
        style={{ background: "#1a1a1a", border: "1px solid #3a3a3a", color: "#fff" }}>
        <option value="">Selecione...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <main className="min-h-screen p-6" style={{ background: "#111111" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">Estoque</h1>
          <p className="text-sm text-gray-400 mt-0.5">{vehicles.length} veiculos cadastrados</p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: "#dc2626" }}>
          + Novo Veiculo
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex gap-2">
          {["all","disponivel","reservado","vendido"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: filterStatus===s ? "#dc2626" : "#1a1a1a", color: filterStatus===s ? "#fff" : "#888", border: "1px solid #2e2e2e" }}>
              {s === "all" ? "Todos" : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs border focus:outline-none"
          style={{ background: "#1a1a1a", border: "1px solid #2e2e2e", color: "#888" }}>
          <option value="">Todas marcas</option>
          {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
          className="px-3 py-1.5 rounded-xl text-xs border focus:outline-none flex-1 min-w-32"
          style={{ background: "#1a1a1a", border: "1px solid #2e2e2e", color: "#fff" }} />
        <div className="flex gap-1">
          {(["grid","list"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: view===v ? "#2e2e2e" : "transparent", color: view===v ? "#fff" : "#555" }}>
              {v === "grid" ? "⊞" : "≡"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-20">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🚗</p>
          <p className="text-gray-400 font-semibold">Nenhum veiculo encontrado</p>
          <p className="text-gray-600 text-sm mt-1">Adicione veiculos ao estoque</p>
        </div>
      ) : (
        <div className={view === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-3"}>
          {filtered.map(v => {
            const cfg = STATUS_CONFIG[v.status] ?? { label: v.status, color: "#888", bg: "#222" };
            return (
              <div key={v.id} className="rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-all hover:scale-[1.01]"
                style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}
                onClick={() => openEdit(v)}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-white">{v.brand} {v.model}</p>
                    <p className="text-xs text-gray-500">{v.year} {v.color ? `• ${v.color}` : ""} {v.plate ? `• ${v.plate}` : ""}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                </div>
                {v.price && <p className="text-lg font-black" style={{ color: "#dc2626" }}>R$ {v.price.toLocaleString("pt-BR")}</p>}
                {v.km && <p className="text-xs text-gray-500">{v.km.toLocaleString("pt-BR")} km {v.fuel ? `• ${v.fuel}` : ""}</p>}
                <div className="flex gap-2 mt-1" onClick={e => e.stopPropagation()}>
                  {v.status !== "disponivel" && (
                    <button onClick={() => quickStatus(v.id, "disponivel")}
                      className="flex-1 py-1.5 rounded-xl text-xs font-bold transition-opacity hover:opacity-80"
                      style={{ background: "#dcfce7", color: "#16a34a" }}>Reativar</button>
                  )}
                  {v.status === "disponivel" && (
                    <button onClick={() => quickStatus(v.id, "reservado")}
                      className="flex-1 py-1.5 rounded-xl text-xs font-bold transition-opacity hover:opacity-80"
                      style={{ background: "#fef9c3", color: "#a16207" }}>Reservar</button>
                  )}
                  {v.status !== "vendido" && (
                    <button onClick={() => quickStatus(v.id, "vendido")}
                      className="flex-1 py-1.5 rounded-xl text-xs font-bold transition-opacity hover:opacity-80"
                      style={{ background: "#ede9fe", color: "#7c3aed" }}>Vendido</button>
                  )}
                  <button onClick={() => setConfirmDel(v.id)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-opacity hover:opacity-80"
                    style={{ background: "#2e2e2e", color: "#888" }}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: "rgba(0,0,0,0.8)" }}>
          <div className="rounded-2xl p-6 w-full max-w-2xl my-8" style={{ background: "#1a1a1a", border: "1px solid #3a3a3a" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">{editing ? "Editar Veiculo" : "Novo Veiculo"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            {err && <p className="text-xs text-red-400 mb-4 bg-red-950 px-3 py-2 rounded-xl">{err}</p>}
            <div className="space-y-5">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Identificacao</p>
                <div className="grid grid-cols-2 gap-3">
                  {sel("Marca", "brand", BRANDS)}
                  {f("Modelo", "model", "text", "Ex: Corolla")}
                  {f("Ano", "year", "number", "2024")}
                  {f("Placa", "plate", "text", "ABC1D23")}
                  {f("Cor", "color", "text", "Branco")}
                  {sel("Status", "status", ["disponivel","reservado","vendido"])}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Caracteristicas</p>
                <div className="grid grid-cols-2 gap-3">
                  {f("Quilometragem", "km", "number", "50000")}
                  {sel("Combustivel", "fuel", ["Flex","Gasolina","Diesel","Etanol","Hibrido","Eletrico"])}
                  {sel("Cambio", "transmission", ["Manual","Automatico","CVT","Semi-automatico"])}
                  {sel("Carroceria", "body_type", ["Sedan","Hatch","SUV","Pickup","Minivan","Coupe","Wagon","Conversivel"])}
                  {f("Portas", "doors", "number", "4")}
                  {f("Final de Placa", "end_plate", "text", "3")}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Precos</p>
                <div className="grid grid-cols-2 gap-3">
                  {f("Preco de Venda (R$)", "price", "number", "85000")}
                  {f("Preco FIPE (R$)", "price_fipe", "number", "90000")}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Documentacao</p>
                <div className="grid grid-cols-2 gap-3">
                  {f("RENAVAM", "renavam", "text", "00000000000")}
                  {f("Chassi", "chassis", "text", "9BWZZZ377VT004251")}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {([
                    ["ipva_paid","IPVA Pago"],["single_owner","Unico Dono"],["has_manual","Com Manual"],["has_key","Chave Reserva"],
                  ] as [keyof typeof EMPTY, string][]).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form[key] as boolean ?? false}
                        onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))}
                        className="w-4 h-4 rounded" />
                      <span className="text-sm text-gray-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Opcionais</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {OPTIONALS.map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.optional_items?.includes(opt) ?? false}
                        onChange={() => toggleOptional(opt)} className="w-3.5 h-3.5 rounded" />
                      <span className="text-xs text-gray-400">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Observacoes</label>
                <textarea value={form.description ?? ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="Informacoes adicionais..."
                  className="w-full px-3 py-2 rounded-xl text-sm border focus:outline-none resize-none"
                  style={{ background: "#111", border: "1px solid #3a3a3a", color: "#fff" }} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-400"
                style={{ background: "#2e2e2e" }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "#dc2626" }}>
                {saving ? "Salvando..." : editing ? "Salvar Alteracoes" : "Cadastrar Veiculo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40" onClick={() => setConfirmDel(null)}/>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: "#1a1a1a", border: "1px solid #3a3a3a" }}>
              <p className="text-white font-bold mb-2">Excluir veiculo?</p>
              <p className="text-xs text-gray-400 mb-5">Esta acao nao pode ser desfeita.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDel(null)}
                  className="flex-1 py-2 rounded-xl text-sm font-bold text-gray-400" style={{ background: "#2e2e2e" }}>Cancelar</button>
                <button onClick={() => handleDelete(confirmDel)}
                  className="flex-1 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "#dc2626" }}>Excluir</button>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
