"use server";
import { revalidatePath } from "next/cache";
import { campo, executarAcao, type Resultado } from "@/lib/acao";
import { ErroCatalogo } from "@/lib/catalogo";
import { paraCentavos } from "@/lib/dinheiro";
import { estornarLancamento, registrarContagem } from "@/lib/estoque";

function revalidar() {
  revalidatePath("/estoque");
  revalidatePath("/estoque/historico");
  revalidatePath("/estoque/contagem");
}

/** Lê "contado_<id>" e "custo_<id>"; tamanhos sem quantidade digitada ficam de fora. */
function itensDoFormulario(form: FormData) {
  const itens: { varianteId: number; contado: number; custoUnitario: number | null }[] = [];
  for (const [chave, valor] of form.entries()) {
    const m = /^contado_(\d+)$/.exec(chave);
    if (!m || typeof valor !== "string" || valor.trim() === "") continue;
    const varianteId = Number(m[1]);
    let custoUnitario: number | null = null;
    try {
      custoUnitario = paraCentavos(campo(form, `custo_${varianteId}`));
    } catch {
      throw new ErroCatalogo("Há um custo unitário inválido. Use o formato 12,50.");
    }
    itens.push({ varianteId, contado: Number(valor.trim()), custoUnitario });
  }
  return itens;
}

export async function acaoRegistrarContagem(_: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("ajuste:fazer", async (db, ator) => {
    const res = await registrarContagem(db, ator, {
      id: campo(form, "id"),
      local: campo(form, "local"),
      tipo: campo(form, "tipo"),
      motivo: campo(form, "motivo") ?? "",
      itens: itensDoFormulario(form),
    });
    if (res.repetido) return { ok: true, mensagem: "Este lançamento já tinha sido registrado." };
    return { ok: true, mensagem: `Lançamento registrado: ${res.linhas} ${res.linhas === 1 ? "tamanho alterado" : "tamanhos alterados"}.` };
  });
  revalidar();
  return r;
}

export async function acaoEstornar(lancamentoId: string, _: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("ajuste:fazer", async (db, ator) => {
    const res = await estornarLancamento(db, ator, {
      id: campo(form, "id"),
      lancamentoId,
      motivo: campo(form, "motivo") ?? "",
    });
    return { ok: true, mensagem: res.repetido ? "Este estorno já tinha sido registrado." : "Lançamento estornado." };
  });
  revalidar();
  return r;
}
