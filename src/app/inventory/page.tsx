"use client";

/**
 * 🚗 Inventário — Cadastro de veículos
 * Placeholder — será expandido com Feature #3 (Estoque + IA)
 */

export default function InventoryPage() {
  return (
    <main className="min-h-screen p-6" style={{ background: "#1a1a1a" }}>
      <header className="mb-6">
        <h1 className="text-xl font-bold text-white">🚗 Estoque</h1>
        <p className="text-xs text-gray-500 mt-1">Gerencie os veículos disponíveis na loja.</p>
      </header>
      <div className="rounded-xl p-8 flex flex-col items-center justify-center gap-3"
        style={{ background: "#232323", border: "1px solid #2e2e2e", minHeight: 300 }}>
        <span className="text-4xl">🚗</span>
        <p className="text-white font-semibold">Estoque em construção</p>
        <p className="text-xs text-gray-500 text-center max-w-xs">
          Cadastro de veículos com marca, modelo, ano, placa e preço — a IA usará esse estoque para responder leads automaticamente.
        </p>
      </div>
    </main>
  );
}
