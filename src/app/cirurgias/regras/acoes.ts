"use server";
import { revalidatePath } from "next/cache";
import { campo, campoInteiro, executarAcao, type Resultado } from "@/lib/acao";
import { atualizarRegra, criarRegra, definirAtivoRegra } from "@/lib/regras";

function lista(form: FormData, nome: string): string[] {
  return form.getAll(nome).filter((v): v is string => typeof v === "string" && v !== "");
}

function dados(form: FormData) {
  const itens: { produtoId: number; quantidade: number }[] = [];
  for (const [chave, valor] of form.entries()) {
    const m = /^item_(\d+)$/.exec(chave);
    if (m && typeof valor === "string" && valor.trim() !== "") itens.push({ produtoId: Number(m[1]), quantidade: Number(valor.trim()) });
  }
  return {
    grupo: campo(form, "grupo"),
    descricao: campo(form, "descricao") ?? "",
    todos: lista(form, "todos"),
    algum: lista(form, "algum"),
    nenhum: lista(form, "nenhum"),
    somente: form.get("somente") === "on",
    prioridade: campoInteiro(form, "prioridade") ?? 10,
    provisoria: form.get("provisoria") === "on",
    itens,
  };
}

function revalidar() {
  revalidatePath("/cirurgias", "layout");
}

export async function acaoCriarRegra(_: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("regras:editar", async (db, ator) => {
    const id = await criarRegra(db, ator, dados(form));
    return { ok: true, mensagem: "Regra cadastrada.", id };
  });
  revalidar();
  return r;
}

export async function acaoSalvarRegra(id: number, _: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("regras:editar", async (db, ator) => {
    await atualizarRegra(db, ator, id, dados(form));
    return { ok: true, mensagem: "Regra salva." };
  });
  revalidar();
  return r;
}

export async function acaoAtivoRegra(id: number, ativo: boolean): Promise<Resultado> {
  const r = await executarAcao("regras:editar", async (db, ator) => {
    await definirAtivoRegra(db, ator, id, ativo);
    return { ok: true, mensagem: ativo ? "Regra reativada." : "Regra desativada." };
  });
  revalidar();
  return r;
}
