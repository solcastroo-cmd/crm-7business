"use client";

/**
 * 🧭 Sidebar — Navegação lateral do CRM 7Business
 *
 * - Oculta automaticamente na rota /login
 * - Item ativo destacado em vermelho #e63946
 * - Mobile: oculta por padrão, toggle via botão ☰ no header
 * - Logout via Supabase Auth
 */

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV = [
  { href: "/",             icon: "🏠", label: "Kanban"        },
  { href: "/integrations", icon: "⚡", label: "Integrações"   },
  { href: "/settings",     icon: "⚙️", label: "Configurações" },
];

export function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [open, setOpen] = useState(false);

  // Fecha o menu mobile ao trocar de rota
  useEffect(() => { setOpen(false); }, [pathname]);

  // Não renderiza na tela de login
  if (pathname === "/login") return null;

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const SidebarContent = () => (
    <div className="flex flex-col h-full" style={{ background: "#1a1a1a", borderRight: "1px solid #2e2e2e" }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: "#2e2e2e" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-sm flex-shrink-0"
          style={{ background: "#e63946" }}>7</div>
        <div>
          <p className="text-sm font-bold text-white leading-none">7Business</p>
          <p className="text-[10px] text-gray-600 mt-0.5">CRM Pro</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, icon, label }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? "#e63946" : "transparent",
                color:      active ? "#fff"    : "#888",
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "#2a2a2a"; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span className="text-base leading-none">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Rodapé — Logout */}
      <div className="px-3 py-4 border-t" style={{ borderColor: "#2e2e2e" }}>
        <button onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left"
          style={{ color: "#666" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#2a2a2a"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#666"; }}
        >
          <span className="text-base leading-none">🚪</span>
          <span>Sair</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop: sidebar fixa ─────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* ── Mobile: botão ☰ + drawer ──────────────────────────────── */}
      <div className="lg:hidden">
        <button onClick={() => setOpen(true)}
          className="fixed top-4 left-4 z-50 w-9 h-9 rounded-lg flex items-center justify-center text-white"
          style={{ background: "#e63946" }}>
          ☰
        </button>

        {/* Backdrop */}
        {open && (
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setOpen(false)} />
        )}

        {/* Drawer */}
        <aside className={`fixed top-0 left-0 h-full w-56 z-50 flex flex-col transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}>
          <SidebarContent />
        </aside>
      </div>
    </>
  );
}
