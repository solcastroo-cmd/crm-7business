"use client";

/**
 * 📊 Dashboard — Relatórios e Analytics
 * Placeholder — será expandido com Feature #5 (Relatórios completos)
 */

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-6" style={{ background: "#1a1a1a" }}>
      <header className="mb-6">
        <h1 className="text-xl font-bold text-white">📊 Dashboard</h1>
        <p className="text-xs text-gray-500 mt-1">Relatórios de vendas, leads e performance.</p>
      </header>
      <div className="rounded-xl p-8 flex flex-col items-center justify-center gap-3"
        style={{ background: "#232323", border: "1px solid #2e2e2e", minHeight: 300 }}>
        <span className="text-4xl">📊</span>
        <p className="text-white font-semibold">Dashboard em construção</p>
        <p className="text-xs text-gray-500 text-center max-w-xs">
          Relatórios de vendas, CPL, funil Lead→Venda e performance por vendedor estarão disponíveis em breve.
        </p>
      </div>
    </main>
  );
}
