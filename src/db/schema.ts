import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Marca gravada no próprio banco dizendo se ele é de TESTE ou de PRODUÇÃO.
 * Tem sempre uma única linha (id = 1).
 *
 * Serve de trava: scripts de dados fictícios e de restauração conferem esta
 * marca e se recusam a rodar num banco de produção.
 */
export const ambienteSistema = pgTable(
  "ambiente_sistema",
  {
    id: integer("id").primaryKey().default(1),
    ambiente: text("ambiente").notNull(),
    definidoEm: timestamp("definido_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ambiente_sistema_linha_unica", sql`${t.id} = 1`),
    check("ambiente_sistema_valor", sql`${t.ambiente} in ('teste', 'producao')`),
  ],
);

/**
 * Trilha de auditoria: login, falhas, ações sobre usuários e, nas próximas
 * etapas, mudanças de preço, regras e configurações. Só inclusão: o banco
 * recusa UPDATE e DELETE. Nunca grava dados de pacientes.
 */
export const auditoria = pgTable(
  "auditoria",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
    usuarioId: text("usuario_id"),
    acao: text("acao").notNull(),
    entidade: text("entidade"),
    entidadeId: text("entidade_id"),
    detalhes: jsonb("detalhes"),
    ip: text("ip"),
  },
  (t) => [index("auditoria_em_idx").on(t.em), index("auditoria_usuario_idx").on(t.usuarioId)],
);

// ---------------------------------------------------------------------------
// Tabelas de login (Better Auth). Geradas pela ferramenta da biblioteca;
// alterações aqui precisam acompanhar a configuração em src/lib/auth.ts.
// ---------------------------------------------------------------------------
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  deveTrocarSenha: boolean("deve_trocar_senha").default(true).notNull(),
}, (t) => [
  check("user_perfil_valido", sql`${t.role} in ('administrador', 'compras', 'hospital')`),
]);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until"),
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId),
  ],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  twoFactors: many(twoFactor),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
    references: [user.id],
  }),
}));

// ---------------------------------------------------------------------------
// Catálogo (etapa 1.3)
// ---------------------------------------------------------------------------

/** Os três locais de estoque. Criados pela migração; não são cadastráveis. */
export const locais = pgTable("locais", {
  codigo: text("codigo").primaryKey(), // consultorio | farmacia | armario
  nome: text("nome").notNull(),
  ordem: integer("ordem").notNull(),
});

export const produtos = pgTable(
  "produtos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    codigo: text("codigo").notNull().unique(),
    nome: text("nome").notNull(),
    categoria: text("categoria"),
    fabricante: text("fabricante"),
    /** Referência do fabricante impressa na embalagem (ex.: AHV12, APYX-27-TP). */
    referencia: text("referencia"),
    /** Unidade de consumo e de estoque: unidade, frasco, par… */
    unidade: text("unidade").notNull(),
    /** true = estéril, false = não estéril, null = a definir pela equipe. */
    esteril: boolean("esteril"),
    localPadrao: text("local_padrao").references(() => locais.codigo),
    observacao: text("observacao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("produtos_nome_idx").on(t.nome)],
);

/**
 * Cada tamanho tem estoque e alertas próprios. Produto sem tamanho tem uma
 * única variante "Único".
 */
export const variantes = pgTable(
  "variantes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    produtoId: bigint("produto_id", { mode: "number" })
      .notNull()
      .references(() => produtos.id),
    nome: text("nome").notNull(),
    codigo: text("codigo"),
    /** Código de barras (EAN) da embalagem deste tamanho, quando houver. */
    codigoBarras: text("codigo_barras"),
    ordem: integer("ordem").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
  },
  (t) => [uniqueIndex("variantes_produto_nome_uq").on(t.produtoId, t.nome)],
);

export const fornecedores = pgTable("fornecedores", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  nome: text("nome").notNull().unique(),
  cnpj: text("cnpj"),
  contato: text("contato"),
  telefone: text("telefone"),
  email: text("email"),
  observacao: text("observacao"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Condições de um fornecedor para um produto. Valores em centavos, por
 * EMBALAGEM de compra; `unidadesPorEmbalagem` converte para a unidade de
 * estoque (ex.: caixa de cola com N frascos).
 */
export const fornecedorProdutos = pgTable(
  "fornecedor_produtos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fornecedorId: bigint("fornecedor_id", { mode: "number" })
      .notNull()
      .references(() => fornecedores.id),
    produtoId: bigint("produto_id", { mode: "number" })
      .notNull()
      .references(() => produtos.id),
    embalagem: text("embalagem").notNull().default("unidade"),
    unidadesPorEmbalagem: integer("unidades_por_embalagem").notNull().default(1),
    precoCentavos: integer("preco_centavos"),
    prazoDias: integer("prazo_dias"),
    loteMinimo: integer("lote_minimo"),
    codigoNoFornecedor: text("codigo_no_fornecedor"),
    ativo: boolean("ativo").notNull().default(true),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fornecedor_produto_uq").on(t.fornecedorId, t.produtoId),
    check("fp_unidades_positivas", sql`${t.unidadesPorEmbalagem} > 0`),
    check("fp_preco_nao_negativo", sql`${t.precoCentavos} is null or ${t.precoCentavos} >= 0`),
    check("fp_prazo_nao_negativo", sql`${t.prazoDias} is null or ${t.prazoDias} >= 0`),
    check("fp_lote_positivo", sql`${t.loteMinimo} is null or ${t.loteMinimo} > 0`),
  ],
);

/** Histórico de preço e prazo por fornecedor e produto. Só inclusão. */
export const historicoPrecos = pgTable(
  "historico_precos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fornecedorProdutoId: bigint("fornecedor_produto_id", { mode: "number" })
      .notNull()
      .references(() => fornecedorProdutos.id),
    precoCentavos: integer("preco_centavos"),
    prazoDias: integer("prazo_dias"),
    unidadesPorEmbalagem: integer("unidades_por_embalagem").notNull(),
    origem: text("origem").notNull(), // cadastro | compra (Fase 4)
    usuarioId: text("usuario_id"),
    em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("historico_precos_fp_idx").on(t.fornecedorProdutoId, t.em)],
);
