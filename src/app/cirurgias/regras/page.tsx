import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { ListaPrevisao } from "@/components/previsao";
import { Pagina, Selo } from "@/components/pagina";
import { Cartao } from "@/components/ui";
import { produtos } from "@/db/schema";
import { listarProcedimentos } from "@/lib/cirurgias";
import { plural } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { carregarRegras, GRUPOS, LISTA_GRUPOS, preverMateriais, type RegraCompleta } from "@/lib/regras";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { AlternarRegra, EditorRegra } from "./editor";

function condicao(r: RegraCompleta, nome: (c: string) => string): string {
  const partes: string[] = [];
  if (r.todos.length) partes.push(r.todos.map(nome).join(" + "));
  if (r.algum.length) partes.push(`${r.algum.length > 1 ? "qualquer um de: " : ""}${r.algum.map(nome).join(", ")}`);
  if (r.nenhum.length) partes.push(`sem ${r.nenhum.map(nome).join(", ")}`);
  if (r.somente) partes.push("isolada");
  return partes.length ? partes.join(" · ") : "toda cirurgia";
}

export default async function Regras({ searchParams }: { searchParams: Promise<{ p?: string | string[] }> }) {
  const usuario = await exigirPermissao("cirurgias:ver");
  const edita = pode(usuario.perfil, "regras:editar");
  const sp = await searchParams;
  const simulados = (Array.isArray(sp.p) ? sp.p : sp.p ? [sp.p] : []).filter(Boolean);

  const { regras, procs, prods, simulacao } = await comAuth(async (_, db) => {
    const regras = await carregarRegras(db);
    const procs = await listarProcedimentos(db, true);
    const prods = edita
      ? await db.select({ id: produtos.id, nome: produtos.nome, unidade: produtos.unidade }).from(produtos).where(eq(produtos.ativo, true)).orderBy(asc(produtos.nome))
      : [];
    const marcados = procs.filter((p) => simulados.includes(p.codigo)).map((p) => ({ codigo: p.codigo, tipo: p.tipo }));
    const simulacao = marcados.length ? await preverMateriais(db, marcados, { regras: regras.filter((r) => r.ativo) }) : null;
    return { regras, procs, prods, simulacao };
  });
  const nome = (c: string) => procs.find((p) => p.codigo === c)?.nome ?? c;
  const ativos = procs.filter((p) => p.ativo);
  const opcoes = {
    grupos: LISTA_GRUPOS.map((g) => ({ codigo: g, nome: GRUPOS[g].nome })),
    procedimentos: ativos.map(({ codigo, nome, tipo }) => ({ codigo, nome, tipo })),
    produtos: prods,
  };

  return (
    <Pagina
      usuario={usuario}
      titulo="Regras de kit"
      voltar={{ href: "/cirurgias", rotulo: "Cirurgias" }}
      acoes={
        edita && (
          <Link href="/cirurgias/procedimentos" className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold">
            Procedimentos
          </Link>
        )
      }
    >
      <Cartao className="flex flex-col gap-3">
        <p className="font-semibold">Simular uma cirurgia</p>
        <form className="flex flex-col gap-3">
          <div className="grid gap-1.5 text-sm sm:grid-cols-2">
            {ativos.map((p) => (
              <label key={p.codigo} className="flex items-center gap-2">
                <input type="checkbox" name="p" value={p.codigo} defaultChecked={simulados.includes(p.codigo)} className="size-4" />
                {p.nome}
              </label>
            ))}
          </div>
          <button type="submit" className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
            Ver materiais previstos
          </button>
        </form>
        {simulacao && <ListaPrevisao previsao={simulacao} />}
      </Cartao>

      {LISTA_GRUPOS.map((g) => {
        const doGrupo = regras.filter((r) => r.grupo === g);
        return (
          <section key={g} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-neutral-600">
              {GRUPOS[g].nome}
              {GRUPOS[g].semRegra === "pendente" && <span className="ml-2 font-normal text-neutral-400">sem regra = pendência</span>}
            </h2>
            {doGrupo.length === 0 && <p className="text-sm text-neutral-400">Nenhuma regra.</p>}
            <ul className="flex flex-col gap-2">
              {doGrupo.map((r) => (
                <li key={r.id} className={`flex flex-col gap-1.5 rounded-xl border bg-white p-3 text-sm ${r.ativo ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-60"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.descricao}</span>
                    {r.provisoria && <Selo cor="ambar">a confirmar</Selo>}
                    {!r.ativo && <Selo cor="vermelho">Desativada</Selo>}
                  </div>
                  <p className="text-xs text-neutral-500">
                    Quando: {condicao(r, nome)} · prioridade {r.prioridade}
                  </p>
                  <p className="text-neutral-700">
                    {r.itens.length
                      ? r.itens.map((i) => `${i.quantidade} ${i.quantidade === 1 ? i.unidade : plural(i.unidade)} de ${i.produto}`).join(" · ")
                      : "Não usa"}
                  </p>
                  {edita && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <AlternarRegra id={r.id} ativo={r.ativo} />
                      </div>
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-neutral-600">Editar</summary>
                        <div className="mt-3">
                          <EditorRegra opcoes={opcoes} regra={r} />
                        </div>
                      </details>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {edita && (
        <details className="rounded-xl border border-neutral-200 bg-white p-5">
          <summary className="cursor-pointer font-semibold">Nova regra</summary>
          <div className="mt-4">
            <EditorRegra opcoes={opcoes} />
          </div>
        </details>
      )}
    </Pagina>
  );
}
