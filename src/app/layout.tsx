import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { lerAmbiente } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estoque Cirúrgico",
  description: "Gestão de estoque de materiais cirúrgicos da clínica",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Lido a cada requisição, para a faixa refletir a configuração do servidor.
  await connection();
  const ambiente = lerAmbiente(process.env.APP_ENV);

  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-white text-neutral-900 antialiased">
        {ambiente === "teste" && (
          <div
            role="status"
            className="sticky top-0 z-50 bg-amber-400 px-4 py-2 text-center text-sm font-semibold tracking-wide text-amber-950"
          >
            AMBIENTE DE TESTE — dados fictícios
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
