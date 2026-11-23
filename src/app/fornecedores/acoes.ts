"use server";
import { revalidatePath } from "next/cache";
import { campo, executarAcao, type Resultado } from "@/lib/acao";
import { atualizarFornecedor, criarFornecedor, definirAtivoFornecedor } from "@/lib/catalogo";

function dados(form: FormData) {
  return {
    nome: campo(form, "nome") ?? "",
    cnpj: campo(form, "cnpj"),
    contato: campo(form, "contato"),
    telefone: campo(form, "telefone"),
    email: campo(form, "email"),
    observacao: campo(form, "observacao"),
  };
}

export async function acaoCriarFornecedor(_: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("fornecedores:editar", async (db, ator) => {
    const id = await criarFornecedor(db, ator, dados(form));
    return { ok: true, mensagem: "Fornecedor cadastrado.", id };
  });
  revalidatePath("/fornecedores");
  return r;
}

export async function acaoSalvarFornecedor(id: number, _: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("fornecedores:editar", async (db, ator) => {
    await atualizarFornecedor(db, ator, id, dados(form));
    return { ok: true, mensagem: "Fornecedor salvo." };
  });
  revalidatePath("/fornecedores");
  return r;
}

export async function acaoAtivoFornecedor(id: number, ativo: boolean): Promise<Resultado> {
  const r = await executarAcao("fornecedores:editar", async (db, ator) => {
    await definirAtivoFornecedor(db, ator, id, ativo);
    return { ok: true, mensagem: ativo ? "Fornecedor reativado." : "Fornecedor desativado." };
  });
  revalidatePath("/fornecedores");
  return r;
}
