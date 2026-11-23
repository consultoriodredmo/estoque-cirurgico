"use server";
import { revalidatePath } from "next/cache";
import { campo, campoInteiro, executarAcao, type Resultado } from "@/lib/acao";
import {
  adicionarTamanho,
  atualizarProduto,
  atualizarTamanho,
  criarProduto,
  definirAtivoProduto,
  definirAtivoTamanho,
  desvincularFornecedor,
  ErroCatalogo,
  salvarCondicoes,
} from "@/lib/catalogo";
import { paraCentavos } from "@/lib/dinheiro";

function dadosProduto(form: FormData) {
  return {
    nome: campo(form, "nome") ?? "",
    categoria: campo(form, "categoria"),
    fabricante: campo(form, "fabricante"),
    referencia: campo(form, "referencia"),
    unidade: campo(form, "unidade") ?? "",
    esteril: campo(form, "esteril") ?? "",
    localPadrao: campo(form, "localPadrao"),
    observacao: campo(form, "observacao"),
  };
}

export async function acaoCriarProduto(_: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("produtos:editar", async (db, ator) => {
    const tamanhos = (campo(form, "tamanhos") ?? "")
      .split(/[,;\n]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const id = await criarProduto(db, ator, { ...dadosProduto(form), tamanhos });
    return { ok: true, mensagem: "Produto criado.", id };
  });
  revalidatePath("/produtos");
  return r;
}

export async function acaoSalvarProduto(id: number, _: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("produtos:editar", async (db, ator) => {
    await atualizarProduto(db, ator, id, dadosProduto(form));
    return { ok: true, mensagem: "Alterações salvas." };
  });
  revalidatePath(`/produtos/${id}`);
  return r;
}

export async function acaoAtivoProduto(id: number, ativo: boolean): Promise<Resultado> {
  const r = await executarAcao("produtos:editar", async (db, ator) => {
    await definirAtivoProduto(db, ator, id, ativo);
    return { ok: true, mensagem: ativo ? "Produto reativado." : "Produto desativado." };
  });
  revalidatePath(`/produtos/${id}`);
  return r;
}

export async function acaoNovoTamanho(produtoId: number, _: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("produtos:editar", async (db, ator) => {
    await adicionarTamanho(db, ator, produtoId, { nome: campo(form, "nome") ?? "", codigoBarras: campo(form, "codigoBarras") });
    return { ok: true, mensagem: "Tamanho adicionado." };
  });
  revalidatePath(`/produtos/${produtoId}`);
  return r;
}

export async function acaoSalvarTamanho(
  produtoId: number,
  varianteId: number,
  _: Resultado | null,
  form: FormData,
): Promise<Resultado> {
  const r = await executarAcao("produtos:editar", async (db, ator) => {
    await atualizarTamanho(db, ator, varianteId, { nome: campo(form, "nome") ?? "", codigoBarras: campo(form, "codigoBarras") });
    return { ok: true, mensagem: "Tamanho salvo." };
  });
  revalidatePath(`/produtos/${produtoId}`);
  return r;
}

export async function acaoAtivoTamanho(produtoId: number, varianteId: number, ativo: boolean): Promise<Resultado> {
  const r = await executarAcao("produtos:editar", async (db, ator) => {
    await definirAtivoTamanho(db, ator, varianteId, ativo);
    return { ok: true, mensagem: ativo ? "Tamanho reativado." : "Tamanho desativado." };
  });
  revalidatePath(`/produtos/${produtoId}`);
  return r;
}

export async function acaoSalvarCondicoes(produtoId: number, _: Resultado | null, form: FormData): Promise<Resultado> {
  const r = await executarAcao("fornecedores:editar", async (db, ator) => {
    let precoCentavos: number | null;
    try {
      precoCentavos = paraCentavos(campo(form, "preco"));
    } catch {
      throw new ErroCatalogo("Preço inválido. Use, por exemplo, 125,90.");
    }
    await salvarCondicoes(db, ator, {
      produtoId,
      fornecedorId: campoInteiro(form, "fornecedorId") ?? 0,
      embalagem: campo(form, "embalagem") ?? "",
      unidadesPorEmbalagem: campoInteiro(form, "unidadesPorEmbalagem") ?? 1,
      precoCentavos,
      prazoDias: campoInteiro(form, "prazoDias"),
      loteMinimo: campoInteiro(form, "loteMinimo"),
      codigoNoFornecedor: campo(form, "codigoNoFornecedor"),
    });
    return { ok: true, mensagem: "Condições do fornecedor salvas." };
  });
  revalidatePath(`/produtos/${produtoId}`);
  return r;
}

export async function acaoDesvincular(produtoId: number, fornecedorProdutoId: number): Promise<Resultado> {
  const r = await executarAcao("fornecedores:editar", async (db, ator) => {
    await desvincularFornecedor(db, ator, fornecedorProdutoId);
    return { ok: true, mensagem: "Fornecedor retirado deste produto." };
  });
  revalidatePath(`/produtos/${produtoId}`);
  return r;
}
