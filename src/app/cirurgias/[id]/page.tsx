import { notFound } from "next/navigation";
import { Cartao } from "@/components/ui";
import { Pagina, Selo } from "@/components/pagina";
import { listarProcedimentos, NOME_SITUACAO, obterCirurgia, tamanhosDeChinelo } from "@/lib/cirurgias";
import { pode } from "@/lib/permissoes";
import { previsaoDaCirurgia } from "@/lib/regras";
import { ListaPrevisao } from "@/components/previsao";
import Link from "next/link";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { FormularioCirurgia } from "../formulario";
import { CancelarOuReativar } from "./situacao";

const DATA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

export default async function DetalheCirurgia({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirPermissao("cirurgias:ver");
  const ator = { id: usuario.id, perfil: usuario.perfil };
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const edita = pode(usuario.perfil, "cirurgias:editar");
  const [c, procedimentos, chinelos] = await comAuth((_, db) =>
    Promise.all([obterCirurgia(db, ator, id), edita ? listarProcedimentos(db) : [], edita ? tamanhosDeChinelo(db) : []]),
  );
  if (!c) notFound();
  const previsao = await comAuth((_, db) => previsaoDaCirurgia(db, ator, id));
  const editavel = edita && c.situacao === "agendada";

  return (
    <Pagina usuario={usuario} titulo={c.paciente} voltar={{ href: `/cirurgias?semana=${c.data}`, rotulo: "Cirurgias" }}>
      <Cartao className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold first-letter:uppercase">{DATA.format(new Date(`${c.data}T12:00:00Z`))}</span>
          {c.hora && <span className="tabular-nums text-neutral-600">às {c.hora}</span>}
          <Selo cor={c.situacao === "cancelada" ? "vermelho" : c.situacao === "agendada" ? "neutro" : "verde"}>{NOME_SITUACAO[c.situacao]}</Selo>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.procedimentos.map((p) => (
            <Selo key={p.codigo} cor={p.tipo === "tecnologia" ? "azul" : "neutro"}>
              {p.nome}
            </Selo>
          ))}
        </div>
        {c.chinelo && <p className="text-neutral-600">Chinelo: {c.chinelo}</p>}
        {c.observacao && <p className="text-neutral-600">{c.observacao}</p>}
      </Cartao>

      <Cartao className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold">Materiais previstos</p>
          <Link href="/cirurgias/regras" className="text-xs text-neutral-500 underline">
            Ver regras
          </Link>
        </div>
        <ListaPrevisao previsao={previsao} />
        <p className="text-xs text-neutral-500">
          Previsão não baixa estoque. As quantidades e os tamanhos reais são informados na confirmação do consumo (etapa 2.3).
        </p>
      </Cartao>

      {editavel && (
        <details className="rounded-xl border border-neutral-200 bg-white p-5">
          <summary className="cursor-pointer font-semibold">Editar cirurgia</summary>
          <div className="mt-4">
            <FormularioCirurgia opcoes={{ procedimentos, chinelos }} cirurgia={c} />
          </div>
        </details>
      )}
      {edita && c.situacao !== "consumo_confirmado" && <CancelarOuReativar id={c.id} cancelada={c.situacao === "cancelada"} />}
    </Pagina>
  );
}
