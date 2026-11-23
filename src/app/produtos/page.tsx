import Link from "next/link";
import { NOME_LOCAL, Pagina, Selo, SeloEsteril } from "@/components/pagina";
import { listarProdutos } from "@/lib/catalogo";
import { pode } from "@/lib/permissoes";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { NovoProduto } from "./novo-produto";

export default async function Produtos({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; inativos?: string }>;
}) {
  const usuario = await exigirPermissao("produtos:ver");
  const { busca, inativos } = await searchParams;
  const lista = await comAuth((_, db) => listarProdutos(db, { busca, incluirInativos: inativos === "1" }));
  const podeEditar = pode(usuario.perfil, "produtos:editar");

  return (
    <Pagina
      usuario={usuario}
      titulo="Produtos"
      voltar={{ href: "/", rotulo: "Início" }}
      acoes={
        pode(usuario.perfil, "fornecedores:editar") && (
          <Link href="/fornecedores" className="text-sm font-medium underline">
            Fornecedores
          </Link>
        )
      }
    >
      <form className="flex flex-wrap items-center gap-2" role="search">
        <input
          name="busca"
          defaultValue={busca ?? ""}
          placeholder="Buscar por nome, código, fabricante…"
          aria-label="Buscar produtos"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:w-auto sm:flex-1"
        />
        <label className="flex items-center gap-1 text-sm text-neutral-600">
          <input type="checkbox" name="inativos" value="1" defaultChecked={inativos === "1"} /> Mostrar desativados
        </label>
        <button className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium">Buscar</button>
      </form>

      {lista.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum produto encontrado.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((p) => (
            <li key={p.id}>
              <Link
                href={`/produtos/${p.id}`}
                className={`flex flex-col gap-1 rounded-xl border bg-white p-4 hover:border-neutral-900 ${p.ativo ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-60"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{p.nome}</span>
                  <span className="text-xs text-neutral-400">{p.codigo}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-600">
                  {p.categoria && <Selo>{p.categoria}</Selo>}
                  <SeloEsteril esteril={p.esteril} />
                  {p.localPadrao && <span className="text-xs">{NOME_LOCAL[p.localPadrao]}</span>}
                  {!p.ativo && <Selo cor="vermelho">Desativado</Selo>}
                </div>
                <div className="text-xs text-neutral-500">
                  {p.fabricante ?? "Fabricante não informado"} ·{" "}
                  {p.tamanhos.length === 1 && p.tamanhos[0] === "Único" ? "sem tamanhos" : `Tamanhos: ${p.tamanhos.join(", ")}`}
                  {podeEditar && ` · ${p.fornecedores} fornecedor${p.fornecedores === 1 ? "" : "es"}`}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {podeEditar && <NovoProduto />}
    </Pagina>
  );
}
