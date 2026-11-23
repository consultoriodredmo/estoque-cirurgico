import { Pagina } from "@/components/pagina";
import { listarFornecedores } from "@/lib/catalogo";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { CartaoFornecedor, NovoFornecedor } from "./componentes";

export default async function Fornecedores() {
  const usuario = await exigirPermissao("fornecedores:editar");
  const lista = await comAuth((_, db) => listarFornecedores(db, true));
  return (
    <Pagina usuario={usuario} titulo="Fornecedores" voltar={{ href: "/produtos", rotulo: "Produtos" }}>
      <p className="text-sm text-neutral-600">
        Preços, prazos e embalagens ficam em cada produto, em “Fornecedores e preços”.
      </p>
      {lista.length === 0 && <p className="text-sm text-neutral-500">Nenhum fornecedor cadastrado ainda.</p>}
      <ul className="flex flex-col gap-2">
        {lista.map((f) => (
          <CartaoFornecedor key={f.id} f={f} />
        ))}
      </ul>
      <NovoFornecedor />
    </Pagina>
  );
}
