import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { TrialBanner } from "@/components/TrialBanner";
import { AppShell } from "@/components/AppShell";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <AppShell
          sidebar={<Sidebar />}
          banner={<TrialBanner />}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
