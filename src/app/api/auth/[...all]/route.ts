import { comAuth } from "@/lib/sessao";

export const dynamic = "force-dynamic";

async function tratar(request: Request): Promise<Response> {
  return comAuth(async (auth) => {
    const resposta = await auth.handler(request);
    // Lê o corpo antes de fechar a conexão com o banco.
    const corpo = await resposta.arrayBuffer();
    return new Response(corpo, { status: resposta.status, headers: resposta.headers });
  });
}

export const GET = tratar;
export const POST = tratar;
