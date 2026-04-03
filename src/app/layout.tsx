import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM 7Business",
  description: "CRM para lojas de veículos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
