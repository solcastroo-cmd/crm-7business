import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
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
        {/* Flex horizontal: Sidebar fixa à esquerda + conteúdo principal */}
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
