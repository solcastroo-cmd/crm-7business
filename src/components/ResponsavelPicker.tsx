"use client";

/* Quem lança / edita registros financeiros — seleção por clique no nome */
export const RESPONSAVEIS = ["Eduardo Maia", "Paulo Henrique", "Barbara Maia", "Soraya de Castro"];

export function ResponsavelPicker({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>{label} *</label>
      <div className="flex flex-wrap gap-2">
        {RESPONSAVEIS.map(nome => {
          const active = value === nome;
          return (
            <button key={nome} type="button" onClick={() => onChange(nome)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
              style={{
                background: active ? "#e63946" : "#1f2937",
                color: active ? "#fff" : "#9ca3af",
                border: `1px solid ${active ? "#e63946" : "#374151"}`,
              }}>
              {nome}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LancadoPor({ lancado, editado }: { lancado?: string | null; editado?: string | null }) {
  if (!lancado && !editado) return null;
  return (
    <p className="text-[10px] mt-0.5" style={{ color: "#9ca3af" }}>
      {lancado && <>👤 Lançado por <b>{lancado}</b></>}
      {lancado && editado && " · "}
      {editado && <>✏️ Editado por <b>{editado}</b></>}
    </p>
  );
}
