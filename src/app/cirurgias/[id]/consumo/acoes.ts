"use server";
import { revalidatePath } from "next/cache";
import { campo, executarAcao, type Resultado } from "@/lib/acao";
import { ErroCatalogo } from "@/lib/catalogo";
import { desfazerConsumo, registrarConsumo } from "@/lib/consumo";

function lerLinhas(form: FormData): unknown {
  try {
    return JSON.parse(campo(form, "linhas") ?? "[]");
  } catch {
    throw new ErroCatalogo("Formulário inválido. Recarregue a página.");
  }
}

function revalidar(id: number) {
  revalidatePath(`/cirurgias/${id}`);
  revalidatePath("/cirurgias");
  revalidatePath("/estoque");
  revalidatePath("/estoque/historico");
}

export async function acaoConfirmarConsumo(cirurgiaId: number, _: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("consumo:confirmar", async (db, ator) => {
    const res = await registrarConsumo(db, ator, {
      id: campo(form, "id"),
      cirurgiaId,
      observacao: campo(form, "observacao"),
      linhas: lerLinhas(form),
    });
    if (res.repetido) return { ok: true, mensagem: "Este consumo já tinha sido registrado." };
    const extra = res.excecoes.length ? ` Atenção: ${res.excecoes.length} item(ns) ficaram com saldo negativo no sistema.` : "";
    return { ok: true, mensagem: `Consumo confirmado.${extra}` };
  });
  revalidar(cirurgiaId);
  return r;
}

export async function acaoDesfazerConsumo(cirurgiaId: number, _: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("cirurgias:ver", async (db, ator) => {
    await desfazerConsumo(db, ator, { id: campo(form, "id"), cirurgiaId, motivo: campo(form, "motivo") ?? "" });
    return { ok: true, mensagem: "Confirmação desfeita. O estoque voltou e a cirurgia pode ser confirmada de novo." };
  });
  revalidar(cirurgiaId);
  return r;
}
