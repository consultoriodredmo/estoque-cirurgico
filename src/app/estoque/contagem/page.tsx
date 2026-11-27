import { randomUUID } from "node:crypto";
import Link from "next/link";
import { NOME_LOCAL, Pagina } from "@/components/pagina";
import { LOCAIS, listarSaldos, type Local } from "@/lib/estoque";
import { pode } from "@/lib/permissoes";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { FormularioContagem } from "./formulario";

export default async function Contagem({ searchParams }: { searchParams: Promise<{ local?: string }> }) {
  const usuario = await exigirPermissao("ajuste:fazer");
  const ator = { id: usuario.id, perfil: usuario.perfil };
  const { local: bruto } = await searchParams;
  const local = LOCAIS.includes(bruto as Local) ? (bruto as Local) : undefined;

  if (!local) {
    return (
      <Pagina usuario={usuario} titulo="Contagem / carga inicial" voltar={{ href: "/estoque", rotulo: "Estoque" }}>
        <p className="text-sm text-neutral-600">Escolha o local que você está contando agora:</p>
        <ul className="grid gap-3 sm:grid-cols-3">
          {LOCAIS.map((l) => (
            <li key={l}>
              <Link href={`/estoque/contagem?local=${l}`} className="block rounded-xl border border-neutral-300 bg-white p-4 font-semibold hover:border-neutral-900">
                {NOME_LOCAL[l]}
              </Link>
            </li>
          ))}
        </ul>
      </Pagina>
    );
  }

  const { linhas } = await comAuth((_, db) => listarSaldos(db, ator));
  const itens = linhas
    .map((l) => ({
      varianteId: l.varianteId,
      produtoId: l.produtoId,
      produto: l.produto,
      tamanho: l.tamanho,
      unidade: l.unidade,
      doLocal: l.localPadrao === local,
      saldo: l.porLocal[local],
    }))
    // Primeiro o que costuma ficar neste local.
    .sort((a, b) => Number(b.doLocal) - Number(a.doLocal));
  const algumSaldo = itens.some((i) => i.saldo !== 0);

  return (
    <Pagina usuario={usuario} titulo={`Contagem — ${NOME_LOCAL[local]}`} voltar={{ href: `/estoque?local=${local}`, rotulo: "Estoque" }}>
      <FormularioContagem
        idInicial={randomUUID()}
        local={local}
        tipoSugerido={algumSaldo ? "ajuste" : "implantacao"}
        itens={itens}
        editaCusto={pode(usuario.perfil, "custos:editar")}
      />
    </Pagina>
  );
}
