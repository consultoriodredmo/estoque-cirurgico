import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { Pagina } from "@/components/pagina";
import { obterCirurgia } from "@/lib/cirurgias";
import { materiaisParaConsumo } from "@/lib/consumo";
import { previsaoDaCirurgia } from "@/lib/regras";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { FormularioConsumo, type LinhaInicial } from "./formulario";

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export default async function ConfirmarConsumo({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirPermissao("consumo:confirmar");
  const ator = { id: usuario.id, perfil: usuario.perfil };
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [c, previsao, materiais] = await comAuth((_, db) => Promise.all([obterCirurgia(db, ator, id), previsaoDaCirurgia(db, ator, id), materiaisParaConsumo(db)]));
  if (!c) notFound();
  if (c.situacao !== "agendada") redirect(`/cirurgias/${id}`);

  const iniciais: LinhaInicial[] = previsao.linhas
    .filter((l) => materiais.some((m) => m.id === l.produtoId))
    .map((l) => {
      const m = materiais.find((x) => x.id === l.produtoId)!;
      const informado = c.chinelo ? m.tamanhos.find((t) => t.nome === c.chinelo && l.tamanho === c.chinelo) : undefined;
      return {
        produtoId: l.produtoId,
        varianteId: m.tamanhos.length === 1 ? m.tamanhos[0].id : (informado?.id ?? null),
        quantidade: l.quantidade,
        previsto: true,
        dica: l.provisoria ? "Quantidade prevista a confirmar" : undefined,
      };
    });
  // Fita kinesio: controle por rolo. Só entra se um rolo novo foi aberto nesta cirurgia.
  const kinesio = materiais.find((m) => /kinesio/i.test(m.nome));
  if (kinesio && !iniciais.some((l) => l.produtoId === kinesio.id)) {
    iniciais.push({ produtoId: kinesio.id, varianteId: kinesio.tamanhos[0]?.id ?? null, quantidade: 0, previsto: true, dica: "Só se abriu um rolo novo nesta cirurgia" });
  }

  return (
    <Pagina usuario={usuario} titulo="Confirmar consumo" voltar={{ href: `/cirurgias/${id}`, rotulo: "Cirurgia" }}>
      <p className="text-sm text-neutral-600">
        <strong className="text-neutral-900">{c.paciente}</strong> · {DATA.format(new Date(`${c.data}T12:00:00Z`))} · {c.procedimentos.map((p) => p.nome).join(" + ")}
      </p>
      <FormularioConsumo cirurgiaId={id} idInicial={randomUUID()} materiais={materiais} iniciais={iniciais} pendencias={previsao.pendencias.map((p) => p.nomeGrupo)} />
    </Pagina>
  );
}
