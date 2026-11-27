import Link from "next/link";
import { NOME_LOCAL, Pagina } from "@/components/pagina";
import { formatarReais, plural } from "@/lib/dinheiro";
import { LOCAIS, listarSaldos, type LinhaSaldo, type Local } from "@/lib/estoque";
import { pode } from "@/lib/permissoes";
import { comAuth, exigirPermissao } from "@/lib/sessao";

const CURTO: Record<Local, string> = { consultorio: "Cons.", farmacia: "Farm.", armario: "Arm." };

function agrupar(linhas: LinhaSaldo[]) {
  const grupos = new Map<number, LinhaSaldo[]>();
  for (const l of linhas) grupos.set(l.produtoId, [...(grupos.get(l.produtoId) ?? []), l]);
  return [...grupos.values()];
}

export default async function Estoque({ searchParams }: { searchParams: Promise<{ local?: string }> }) {
  const usuario = await exigirPermissao("estoque:ver");
  const ator = { id: usuario.id, perfil: usuario.perfil };
  const { local: bruto } = await searchParams;
  const local = LOCAIS.includes(bruto as Local) ? (bruto as Local) : undefined;
  const { linhas, veValores } = await comAuth((_, db) => listarSaldos(db, ator));
  const colunas = local ? [local] : [...LOCAIS];
  const grupos = agrupar(linhas);
  const qtd = (l: LinhaSaldo) => (local ? l.porLocal[local] : l.total);
  const valorTotal = veValores && !local ? linhas.reduce((s, l) => s + (l.valor ?? 0), 0) : null;
  const semCusto = veValores ? linhas.filter((l) => l.total > 0 && l.custoMedio == null).length : 0;
  const ajusta = pode(usuario.perfil, "ajuste:fazer");

  return (
    <Pagina
      usuario={usuario}
      titulo="Estoque por local"
      voltar={{ href: "/", rotulo: "Início" }}
      acoes={
        <div className="flex gap-2 text-sm">
          <Link href="/estoque/historico" className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-semibold">
            Histórico
          </Link>
          {ajusta && (
            <Link href={`/estoque/contagem${local ? `?local=${local}` : ""}`} className="rounded-lg bg-neutral-900 px-3 py-2 font-semibold text-white">
              Contagem / carga
            </Link>
          )}
        </div>
      }
    >
      <nav className="flex flex-wrap gap-2 text-sm">
        {[undefined, ...LOCAIS].map((l) => (
          <Link
            key={l ?? "todos"}
            href={l ? `/estoque?local=${l}` : "/estoque"}
            className={`rounded-full border px-3 py-1 ${l === local ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}
          >
            {l ? NOME_LOCAL[l] : "Todos os locais"}
          </Link>
        ))}
      </nav>

      {valorTotal != null && (
        <p className="text-sm text-neutral-600">
          Valor em estoque (custo médio): <strong className="text-neutral-900">{formatarReais(valorTotal)}</strong>
          {semCusto > 0 && <span className="text-amber-800"> · {semCusto} {semCusto === 1 ? "tamanho" : "tamanhos"} com saldo ainda sem custo</span>}
        </p>
      )}
      {linhas.every((l) => l.total === 0) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Nenhum saldo lançado ainda. {ajusta ? "Comece pela carga inicial em “Contagem / carga”, um local por vez." : ""}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {grupos.map((g) => {
          const p = g[0];
          const totalProduto = g.reduce((s, l) => s + qtd(l), 0);
          return (
            <li key={p.produtoId} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <Link href={`/produtos/${p.produtoId}`} className="font-semibold hover:underline">
                  {p.produto}
                </Link>
                <span className="shrink-0 whitespace-nowrap text-sm text-neutral-600">
                  {totalProduto} {totalProduto === 1 ? p.unidade : plural(p.unidade)}
                </span>
              </div>
              <table className="mt-2 w-full text-sm tabular-nums">
                <thead className="text-xs text-neutral-500">
                  <tr>
                    <th className="py-1 text-left font-medium">Tamanho</th>
                    {colunas.map((c) => (
                      <th key={c} className="py-1 text-right font-medium">
                        {local ? "Saldo" : CURTO[c]}
                      </th>
                    ))}
                    {!local && <th className="py-1 text-right font-medium">Total</th>}
                    {veValores && <th className="py-1 text-right font-medium">Custo méd.</th>}
                  </tr>
                </thead>
                <tbody>
                  {g.map((l) => (
                    <tr key={l.varianteId} className="border-t border-neutral-100">
                      <td className="py-1.5">{l.tamanho}</td>
                      {colunas.map((c) => (
                        <td key={c} className={`py-1.5 text-right ${l.porLocal[c] === 0 ? "text-neutral-300" : ""}`}>
                          {l.porLocal[c]}
                        </td>
                      ))}
                      {!local && <td className="py-1.5 text-right font-semibold">{l.total}</td>}
                      {veValores && <td className="py-1.5 text-right text-neutral-600">{formatarReais(l.custoMedio == null ? null : Math.round(l.custoMedio))}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          );
        })}
      </ul>
    </Pagina>
  );
}
