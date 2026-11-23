import { notFound } from "next/navigation";
import { NOME_LOCAL, Pagina, Selo, SeloEsteril } from "@/components/pagina";
import { ErroCatalogo, esterilParaOpcao, listarFornecedores, obterProduto } from "@/lib/catalogo";
import { formatarReais } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { BotaoAtivoProduto, EditarProduto, Fornecedores, Tamanhos } from "./componentes";

export default async function Produto({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirPermissao("produtos:ver");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const ator = { id: usuario.id, perfil: usuario.perfil };
  const dados = await comAuth(async (_, db) => {
    try {
      const detalhe = await obterProduto(db, id, ator);
      const todosFornecedores = pode(usuario.perfil, "fornecedores:editar") ? await listarFornecedores(db) : [];
      return { detalhe, todosFornecedores };
    } catch (e) {
      if (e instanceof ErroCatalogo) return null;
      throw e;
    }
  });
  if (!dados) notFound();
  const { produto, tamanhos, fornecedores, veValores } = dados.detalhe;
  const podeEditar = pode(usuario.perfil, "produtos:editar");
  const podeFornecedores = pode(usuario.perfil, "fornecedores:editar");

  return (
    <Pagina
      usuario={usuario}
      titulo={produto.nome}
      voltar={{ href: "/produtos", rotulo: "Produtos" }}
      acoes={podeEditar && <BotaoAtivoProduto id={produto.id} ativo={produto.ativo} />}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Selo>{produto.codigo}</Selo>
        {produto.categoria && <Selo>{produto.categoria}</Selo>}
        <SeloEsteril esteril={produto.esteril} />
        {produto.localPadrao && <Selo>{NOME_LOCAL[produto.localPadrao]}</Selo>}
        {!produto.ativo && <Selo cor="vermelho">Desativado</Selo>}
      </div>

      {podeEditar ? (
        <EditarProduto
          id={produto.id}
          valores={{ ...produto, esteril: esterilParaOpcao(produto.esteril) }}
        />
      ) : (
        <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-neutral-200 bg-white p-5 text-sm sm:grid-cols-2">
          {[
            ["Fabricante", produto.fabricante],
            ["Referência", produto.referencia],
            ["Unidade", produto.unidade],
            ["Observação", produto.observacao],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-neutral-500">{k}</dt>
              <dd>{v || "—"}</dd>
            </div>
          ))}
        </dl>
      )}

      <Tamanhos
        produtoId={produto.id}
        podeEditar={podeEditar}
        tamanhos={tamanhos.map((t) => ({ id: t.id, nome: t.nome, codigoBarras: t.codigoBarras, ativo: t.ativo }))}
      />

      {podeFornecedores ? (
        <Fornecedores
          produtoId={produto.id}
          unidade={produto.unidade}
          vinculos={fornecedores}
          todos={dados.todosFornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
        />
      ) : (
        <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="font-semibold">Fornecedores</h2>
          {fornecedores.filter((f) => f.ativo).length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhum fornecedor cadastrado.</p>
          ) : (
            <ul className="text-sm">
              {fornecedores
                .filter((f) => f.ativo)
                .map((f) => (
                  <li key={f.id}>
                    {f.fornecedor}
                    {veValores && f.precoCentavos != null && ` · ${formatarReais(f.precoCentavos)}`}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </Pagina>
  );
}
