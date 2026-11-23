import { auditoria } from "./schema";
import type { Executor } from "./client";

export type EventoAuditoria = {
  acao: string;
  usuarioId?: string | null;
  entidade?: string | null;
  entidadeId?: string | null;
  /** Nunca colocar dados de pacientes aqui. */
  detalhes?: Record<string, unknown> | null;
  ip?: string | null;
};

/** Grava um evento na trilha de auditoria (só inclusão; o banco recusa alteração). */
export async function registrarAuditoria(db: Executor, evento: EventoAuditoria): Promise<void> {
  await db.insert(auditoria).values({
    acao: evento.acao,
    usuarioId: evento.usuarioId ?? null,
    entidade: evento.entidade ?? null,
    entidadeId: evento.entidadeId ?? null,
    detalhes: evento.detalhes ?? null,
    ip: evento.ip ?? null,
  });
}
