import { NextResponse } from "next/server";
import { lerEnvServidor } from "@/lib/env";
import { verificarSaude } from "@/lib/saude";

export const dynamic = "force-dynamic";

export async function GET() {
  let env;
  try {
    env = lerEnvServidor();
  } catch {
    return NextResponse.json({ ok: false, banco: "nao_configurado" }, { status: 503 });
  }
  const saude = await verificarSaude(env);
  return NextResponse.json(saude, {
    status: saude.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
