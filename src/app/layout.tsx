import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { TrialBanner } from "@/components/TrialBanner";
import { AppShell } from "@/components/AppShell";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRM 7Business",
  description: "CRM para lojas de veículos",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let storeName: string | null = null;
  let logoUrl:   string | null = null;
  let userEmail: string | null = null;
  let isAdmin = false;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userEmail = user.email ?? null;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/settings?userId=${user.id}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const d = await res.json();
        storeName = d?.business_name ?? null;
        logoUrl   = d?.logo_url ?? null;
        isAdmin   = !!d?.is_admin;
      }
    }
  } catch {
    // layout continua sem dados do sidebar
  }

  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <AppShell
          sidebar={<Sidebar storeName={storeName} logoUrl={logoUrl} userEmail={userEmail} isAdmin={isAdmin} />}
          banner={<TrialBanner />}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
