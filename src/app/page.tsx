import Link from "next/link";
import { Cabecalho } from "@/components/cabecalho";
import { Aviso } from "@/components/ui";
import { pode, type Acao } from "@/lib/permissoes";
import { exigirLogin } from "@/lib/sessao";

type Modulo = { titulo: string; descricao: string; acoes: Acao[]; href?: string; quando?: string };

const MODULOS: Modulo[] = [
  { titulo: "Usuários", descricao: "Criar contas, perfis e redefinir acessos", acoes: ["usuarios:gerir"], href: "/usuarios" },
  { titulo: "Produtos e fornecedores", descricao: "Materiais, tamanhos e fornecedores", acoes: ["produtos:ver"], href: "/produtos" },
  { titulo: "Estoque por local", descricao: "Consultório, farmácia e armário", acoes: ["estoque:ver"], href: "/estoque" },
  { titulo: "Cirurgias e consumo", descricao: "Materiais previstos e confirmação", acoes: ["cirurgias:ver"], quando: "Fase 2" },
  {
    titulo: "Segunda-feira",
    descricao: "Conferência e reposição",
    acoes: ["contagem:registrar", "transferencia:aprovar"],
    quando: "Fase 3",
  },
  { titulo: "Compras", descricao: "Pedidos, recebimentos e custos", acoes: ["compras:gerir"], quando: "Fase 4" },
  { titulo: "Relatórios", descricao: "Custos, consumo e auditoria", acoes: ["relatorios:ver"], quando: "Fase 4" },
];

export default async function Painel({ searchParams }: { searchParams: Promise<{ negado?: string }> }) {
  const usuario = await exigirLogin();
  const { negado } = await searchParams;
  const visiveis = MODULOS.filter((m) => m.acoes.some((a) => pode(usuario.perfil, a)));

  return (
    <>
      <Cabecalho nome={usuario.nome} perfil={usuario.perfil} />
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-8">
        <h1 className="text-xl font-semibold">Olá, {usuario.nome.split(" ")[0]}</h1>
        {negado && <Aviso>Você não tem permissão para acessar aquela tela.</Aviso>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {visiveis.map((m) => {
            const conteudo = (
              <>
                <span className="font-semibold">{m.titulo}</span>
                <span className="text-sm text-neutral-600">{m.descricao}</span>
                {m.quando && <span className="mt-1 text-xs text-neutral-400">Chega na {m.quando}</span>}
              </>
            );
            return (
              <li key={m.titulo}>
                {m.href ? (
                  <Link
                    href={m.href}
                    className="flex h-full flex-col gap-1 rounded-xl border border-neutral-300 bg-white p-4 hover:border-neutral-900"
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <div className="flex h-full flex-col gap-1 rounded-xl border border-dashed border-neutral-200 p-4 text-neutral-500">
                    {conteudo}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
