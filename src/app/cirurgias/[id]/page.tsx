import { notFound } from "next/navigation";
import { Aviso, Cartao } from "@/components/ui";
import { NOME_LOCAL, Pagina, Selo } from "@/components/pagina";
import { consumoDaCirurgia } from "@/lib/consumo";
import { formatarReais } from "@/lib/dinheiro";
import {
  listarProcedimentos,
  NOME_SITUACAO,
  obterCirurgia,
  tamanhosDeChinelo,
} from "@/lib/cirurgias";
import { pode } from "@/lib/permissoes";
import { previsaoDaCirurgia } from "@/lib/regras";
import { ListaPrevisao } from "@/components/previsao";
import Link from "next/link";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { FormularioCirurgia } from "../formulario";
import { DesfazerConsumo } from "./consumo-registrado";
import { CancelarOuReativar } from "./situacao";

const QUANDO = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const DATA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default async function DetalheCirurgia({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ consumo?: string }>;
}) {
  const usuario = await exigirPermissao("cirurgias:ver");
  const ator = { id: usuario.id, perfil: usuario.perfil };
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const edita = pode(usuario.perfil, "cirurgias:editar");
  const [c, procedimentos, chinelos] = await comAuth((_, db) =>
    Promise.all([
      obterCirurgia(db, ator, id),
      edita ? listarProcedimentos(db) : [],
      edita ? tamanhosDeChinelo(db) : [],
    ]),
  );
  if (!c) notFound();
  const confirmado = c.situacao === "consumo_confirmado";
  const [previsao, consumo] = await comAuth((_, db) =>
    Promise.all([
      confirmado ? null : previsaoDaCirurgia(db, ator, id),
      confirmado ? consumoDaCirurgia(db, ator, id) : null,
    ]),
  );
  const editavel = edita && c.situacao === "agendada";
  const confirma = pode(usuario.perfil, "consumo:confirmar");
  const corrige = confirma || pode(usuario.perfil, "ajuste:fazer");
  const { consumo: aviso } = await searchParams;
  const custoTotal = consumo?.itens.every((i) => i.custoUnitario == null)
    ? null
    : consumo?.itens.reduce(
        (s, i) => s + (i.custoUnitario ?? 0) * i.quantidade,
        0,
      );

  return (
    <Pagina
      usuario={usuario}
      titulo={c.paciente}
      voltar={{ href: `/cirurgias?semana=${c.data}`, rotulo: "Cirurgias" }}
    >
      <Cartao className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold first-letter:uppercase">
            {DATA.format(new Date(`${c.data}T12:00:00Z`))}
          </span>
          {c.hora && (
            <span className="tabular-nums text-neutral-600">às {c.hora}</span>
          )}
          <Selo
            cor={
              c.situacao === "cancelada"
                ? "vermelho"
                : c.situacao === "agendada"
                  ? "neutro"
                  : "verde"
            }
          >
            {NOME_SITUACAO[c.situacao]}
          </Selo>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.procedimentos.map((p) => (
            <Selo
              key={p.codigo}
              cor={p.tipo === "tecnologia" ? "azul" : "neutro"}
            >
              {p.nome}
            </Selo>
          ))}
        </div>
        {c.chinelo && <p className="text-neutral-600">Chinelo: {c.chinelo}</p>}
        {c.observacao && <p className="text-neutral-600">{c.observacao}</p>}
      </Cartao>

      {aviso === "ok" && confirmado && (
        <Aviso tipo="ok">Consumo confirmado.</Aviso>
      )}

      {consumo && (
        <Cartao className="flex flex-col gap-2 text-sm">
          <p className="font-semibold">Consumo registrado</p>
          <p className="text-xs text-neutral-500">
            {consumo.usuario} · {QUANDO.format(consumo.em)}
          </p>
          <ul className="divide-y divide-neutral-100">
            {consumo.itens.map((i, n) => (
              <li
                key={n}
                className="flex items-start justify-between gap-3 py-2"
              >
                <span>
                  {i.produto}
                  {i.tamanho !== "Único" && (
                    <span className="text-neutral-500"> · {i.tamanho}</span>
                  )}
                  <span className="block text-xs text-neutral-500">
                    {NOME_LOCAL[i.local]}
                  </span>
                  {i.saldoApos < 0 && (
                    <span className="block text-xs text-amber-800">
                      Saldo ficou negativo ({i.saldoApos}): conferir na contagem
                    </span>
                  )}
                </span>
                <strong className="tabular-nums">{i.quantidade}</strong>
              </li>
            ))}
          </ul>
          {custoTotal != null && (
            <p className="text-neutral-600">
              Custo dos materiais (custo médio):{" "}
              {formatarReais(Math.round(custoTotal))}
            </p>
          )}
          {corrige && <DesfazerConsumo cirurgiaId={c.id} />}
        </Cartao>
      )}

      {c.situacao === "agendada" && confirma && (
        <Link
          href={`/cirurgias/${c.id}/consumo`}
          className="rounded-xl bg-neutral-900 px-4 py-3.5 text-center font-semibold text-white"
        >
          Confirmar consumo
        </Link>
      )}

      {previsao && (
        <Cartao className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">Materiais previstos</p>
            <Link
              href="/cirurgias/regras"
              className="text-xs text-neutral-500 underline"
            >
              Ver regras
            </Link>
          </div>
          <ListaPrevisao previsao={previsao} />
          <p className="text-xs text-neutral-500">
            Previsão não baixa estoque. Quantidades e tamanhos reais entram na
            confirmação do consumo.
          </p>
        </Cartao>
      )}

      {editavel && (
        <details className="rounded-xl border border-neutral-200 bg-white p-5">
          <summary className="cursor-pointer font-semibold">
            Editar cirurgia
          </summary>
          <div className="mt-4">
            <FormularioCirurgia
              opcoes={{ procedimentos, chinelos }}
              cirurgia={c}
            />
          </div>
        </details>
      )}
      {edita && c.situacao !== "consumo_confirmado" && (
        <CancelarOuReativar id={c.id} cancelada={c.situacao === "cancelada"} />
      )}
    </Pagina>
  );
}
