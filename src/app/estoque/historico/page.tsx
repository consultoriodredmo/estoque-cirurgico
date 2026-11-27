import Link from "next/link";
import { NOME_LOCAL, Pagina, Selo } from "@/components/pagina";
import { formatarReais } from "@/lib/dinheiro";
import { LOCAIS, listarLancamentos, NOME_TIPO, type Local } from "@/lib/estoque";
import { pode } from "@/lib/permissoes";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { BotaoEstornar } from "./estornar";

const DATA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function Historico({ searchParams }: { searchParams: Promise<{ local?: string }> }) {
  const usuario = await exigirPermissao("estoque:ver");
  const ator = { id: usuario.id, perfil: usuario.perfil };
  const { local: bruto } = await searchParams;
  const local = LOCAIS.includes(bruto as Local) ? (bruto as Local) : undefined;
  const lista = await comAuth((_, db) => listarLancamentos(db, ator, { local, limite: 100 }));
  const ajusta = pode(usuario.perfil, "ajuste:fazer");

  return (
    <Pagina usuario={usuario} titulo="Histórico de movimentações" voltar={{ href: "/estoque", rotulo: "Estoque" }}>
      <nav className="flex flex-wrap gap-2 text-sm">
        {[undefined, ...LOCAIS].map((l) => (
          <Link
            key={l ?? "todos"}
            href={l ? `/estoque/historico?local=${l}` : "/estoque/historico"}
            className={`rounded-full border px-3 py-1 ${l === local ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}
          >
            {l ? NOME_LOCAL[l] : "Todos"}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-neutral-500">
        Nada aqui pode ser apagado ou editado. Um erro se corrige com estorno ou com novo ajuste — e os dois ficam registrados.
      </p>
      {lista.length === 0 && <p className="text-sm text-neutral-500">Nenhuma movimentação ainda.</p>}
      <ul className="flex flex-col gap-3">
        {lista.map((l) => (
          <li key={l.id} className={`rounded-xl border bg-white p-4 text-sm ${l.estornadoPor ? "border-dashed border-neutral-300 opacity-75" : "border-neutral-200"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Selo cor={l.tipo === "estorno" ? "vermelho" : l.tipo === "implantacao" ? "azul" : "neutro"}>{NOME_TIPO[l.tipo] ?? l.tipo}</Selo>
                {l.local && <span className="font-medium">{NOME_LOCAL[l.local]}</span>}
                {l.estornadoPor && <Selo cor="ambar">Estornado</Selo>}
              </div>
              <span className="text-xs text-neutral-500">
                {DATA.format(l.em)} · {l.usuario}
              </span>
            </div>
            <p className="mt-1 text-neutral-700">{l.motivo}</p>
            <ul className="mt-2 divide-y divide-neutral-100 tabular-nums">
              {l.itens.map((i, n) => (
                <li key={n} className="flex justify-between gap-2 py-1">
                  <span>
                    {i.produto} <span className="text-neutral-500">({i.tamanho})</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-right">
                    <strong className={i.quantidade > 0 ? "text-green-700" : "text-red-700"}>{i.quantidade > 0 ? `+${i.quantidade}` : i.quantidade}</strong>
                    <span className="text-neutral-500"> → {i.saldoApos}</span>
                    {i.custoUnitario != null && <span className="block text-xs text-neutral-500">{formatarReais(Math.round(i.custoUnitario))}/un.</span>}
                  </span>
                </li>
              ))}
            </ul>
            {ajusta && l.tipo !== "estorno" && !l.estornadoPor && <BotaoEstornar lancamentoId={l.id} />}
          </li>
        ))}
      </ul>
    </Pagina>
  );
}
