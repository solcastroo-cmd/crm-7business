"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV = [
  { href: "/",             icon: "⚡", label: "Funil de Leads" },
  { href: "/dashboard",    icon: "📊", label: "Dashboard"      },
  { href: "/inventory",    icon: "🚗", label: "Estoque"        },
  { href: "/integrations", icon: "🔗", label: "Integracoes"    },
  { href: "/settings",     icon: "⚙️", label: "Configuracoes"  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen]           = useState(false);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserEmail(data.user.email ?? null);
      fetch(`/api/settings?userId=${data.user.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.business_name) setStoreName(d.business_name); })
        .catch(() => {});
    });
  }, []);

  if (pathname === "/login") return null;

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const Content = () => (
    <div className="flex flex-col h-full" style={{ background: "#111827", borderRight: "1px solid #1f2937" }}>
      <div className="px-5 py-5" style={{ borderBottom: "1px solid #1f2937" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-base flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#e63946 0%,#c1121f 100%)", boxShadow: "0 2px 8px rgba(230,57,70,0.4)" }}>
            7
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white leading-tight truncate">{storeName ?? "7Business"}</p>
            <p className="text-[10px] font-medium" style={{ color: "#6b7280" }}>CRM Veiculos Pro</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon, label }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: active ? "rgba(230,57,70,0.15)" : "transparent",
                color:      active ? "#f87171" : "#9ca3af",
                borderLeft: active ? "3px solid #e63946" : "3px solid transparent",
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.color = "#e5e7eb"; } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#9ca3af"; } }}
            >
              <span className="text-base w-5 flex-shrink-0 text-center leading-none">{icon}</span>
              <span className="leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 mx-3 mb-3 rounded-xl" style={{ background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.15)" }}>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#25D366" }}>WhatsApp</p>
        <Link href="/integrations" className="text-xs font-medium transition-colors" style={{ color: "#6b7280" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#25D366"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#6b7280"}>
          Gerenciar integracoes
        </Link>
      </div>

      <div className="px-3 py-4" style={{ borderTop: "1px solid #1f2937" }}>
        {userEmail && <p className="text-[10px] text-gray-600 truncate px-3 mb-2">{userEmail}</p>}
        <button onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
          style={{ color: "#6b7280" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(230,57,70,0.1)"; (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}>
          <span className="text-base leading-none w-5 text-center flex-shrink-0">🚪</span>
          <span>Sair</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 sticky top-0 h-screen">
        <Content />
      </aside>

      <div className="lg:hidden">
        <button onClick={() => setOpen(true)}
          className="fixed top-4 left-4 z-50 w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg"
          style={{ background: "#e63946" }}>
          ☰
        </button>
        {open && <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setOpen(false)} />}
        <aside className={`fixed top-0 left-0 h-full w-56 z-50 flex flex-col transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}>
          <Content />
        </aside>
      </div>
    </>
  );
}
