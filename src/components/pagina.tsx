import Link from "next/link";
import type { ReactNode } from "react";
import type { Perfil } from "@/lib/permissoes";
import { Cabecalho } from "./cabecalho";

export function Pagina({
  usuario,
  titulo,
  voltar,
  acoes,
  children,
}: {
  usuario: { nome: string; perfil: Perfil };
  titulo: string;
  voltar?: { href: string; rotulo: string };
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Cabecalho nome={usuario.nome} perfil={usuario.perfil} />
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-6">
        {voltar && (
          <Link href={voltar.href} className="text-sm text-neutral-500 hover:text-neutral-900">
            ← {voltar.rotulo}
          </Link>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{titulo}</h1>
          {acoes}
        </div>
        {children}
      </main>
    </>
  );
}

export function Selo({ children, cor = "neutro" }: { children: ReactNode; cor?: "neutro" | "verde" | "ambar" | "vermelho" | "azul" }) {
  const estilos = {
    neutro: "bg-neutral-100 text-neutral-700",
    verde: "bg-green-100 text-green-800",
    ambar: "bg-amber-100 text-amber-900",
    vermelho: "bg-red-100 text-red-800",
    azul: "bg-sky-100 text-sky-800",
  }[cor];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estilos}`}>{children}</span>;
}

export function SeloEsteril({ esteril }: { esteril: boolean | null }) {
  if (esteril === true) return <Selo cor="azul">Estéril</Selo>;
  if (esteril === false) return <Selo>Não estéril</Selo>;
  return <Selo cor="ambar">Esterilidade a definir</Selo>;
}

export const NOME_LOCAL: Record<string, string> = {
  consultorio: "Consultório",
  farmacia: "Farmácia do hospital",
  armario: "Armário privativo",
};
