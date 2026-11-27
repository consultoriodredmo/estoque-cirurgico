"use server";
import { revalidatePath } from "next/cache";
import { campo, campoInteiro, executarAcao, type Resultado } from "@/lib/acao";
import {
  atualizarCirurgia,
  cancelarCirurgia,
  criarCirurgia,
  criarProcedimento,
  definirAtivoProcedimento,
  reativarCirurgia,
} from "@/lib/cirurgias";

function dados(form: FormData) {
  return {
    paciente: campo(form, "paciente") ?? "",
    data: campo(form, "data") ?? "",
    hora: campo(form, "hora"),
    procedimentos: form.getAll("procedimentos").filter((v): v is string => typeof v === "string"),
    chineloVarianteId: campoInteiro(form, "chinelo"),
    observacao: campo(form, "observacao"),
  };
}

function revalidar(id?: number) {
  revalidatePath("/cirurgias");
  if (id) revalidatePath(`/cirurgias/${id}`);
}

export async function acaoCriarCirurgia(_: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("cirurgias:editar", async (db, ator) => {
    const id = await criarCirurgia(db, ator, dados(form));
    return { ok: true, mensagem: "Cirurgia cadastrada.", id };
  });
  revalidar(r.id);
  return r;
}

export async function acaoSalvarCirurgia(id: number, _: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("cirurgias:editar", async (db, ator) => {
    await atualizarCirurgia(db, ator, id, dados(form));
    return { ok: true, mensagem: "Cirurgia salva." };
  });
  revalidar(id);
  return r;
}

export async function acaoCancelarCirurgia(id: number, _: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("cirurgias:editar", async (db, ator) => {
    await cancelarCirurgia(db, ator, id, { motivo: campo(form, "motivo") ?? "" });
    return { ok: true, mensagem: "Cirurgia cancelada." };
  });
  revalidar(id);
  return r;
}

export async function acaoReativarCirurgia(id: number): Promise<Resultado> {
  const r = await executarAcao("cirurgias:editar", async (db, ator) => {
    await reativarCirurgia(db, ator, id);
    return { ok: true, mensagem: "Cirurgia reativada." };
  });
  revalidar(id);
  return r;
}

export async function acaoCriarProcedimento(_: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("regras:editar", async (db, ator) => {
    await criarProcedimento(db, ator, { nome: campo(form, "nome") ?? "", tipo: campo(form, "tipo") });
    return { ok: true, mensagem: "Procedimento cadastrado." };
  });
  revalidatePath("/cirurgias/procedimentos");
  return r;
}

export async function acaoAtivoProcedimento(codigo: string, ativo: boolean): Promise<Resultado> {
  const r = await executarAcao("regras:editar", async (db, ator) => {
    await definirAtivoProcedimento(db, ator, codigo, ativo);
    return { ok: true, mensagem: ativo ? "Reativado." : "Desativado." };
  });
  revalidatePath("/cirurgias/procedimentos");
  return r;
}
