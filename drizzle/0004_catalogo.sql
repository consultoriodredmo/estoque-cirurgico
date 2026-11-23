CREATE TABLE "fornecedor_produtos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fornecedor_id" bigint NOT NULL,
	"produto_id" bigint NOT NULL,
	"embalagem" text DEFAULT 'unidade' NOT NULL,
	"unidades_por_embalagem" integer DEFAULT 1 NOT NULL,
	"preco_centavos" integer,
	"prazo_dias" integer,
	"lote_minimo" integer,
	"codigo_no_fornecedor" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fp_unidades_positivas" CHECK ("fornecedor_produtos"."unidades_por_embalagem" > 0),
	CONSTRAINT "fp_preco_nao_negativo" CHECK ("fornecedor_produtos"."preco_centavos" is null or "fornecedor_produtos"."preco_centavos" >= 0),
	CONSTRAINT "fp_prazo_nao_negativo" CHECK ("fornecedor_produtos"."prazo_dias" is null or "fornecedor_produtos"."prazo_dias" >= 0),
	CONSTRAINT "fp_lote_positivo" CHECK ("fornecedor_produtos"."lote_minimo" is null or "fornecedor_produtos"."lote_minimo" > 0)
);
--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"contato" text,
	"telefone" text,
	"email" text,
	"observacao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedores_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "historico_precos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fornecedor_produto_id" bigint NOT NULL,
	"preco_centavos" integer,
	"prazo_dias" integer,
	"unidades_por_embalagem" integer NOT NULL,
	"origem" text NOT NULL,
	"usuario_id" text,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locais" (
	"codigo" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"categoria" text,
	"fabricante" text,
	"unidade" text NOT NULL,
	"esteril" boolean,
	"local_padrao" text,
	"observacao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "variantes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"produto_id" bigint NOT NULL,
	"nome" text NOT NULL,
	"codigo" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fornecedor_produtos" ADD CONSTRAINT "fornecedor_produtos_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedor_produtos" ADD CONSTRAINT "fornecedor_produtos_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_precos" ADD CONSTRAINT "historico_precos_fornecedor_produto_id_fornecedor_produtos_id_fk" FOREIGN KEY ("fornecedor_produto_id") REFERENCES "public"."fornecedor_produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_local_padrao_locais_codigo_fk" FOREIGN KEY ("local_padrao") REFERENCES "public"."locais"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedor_produto_uq" ON "fornecedor_produtos" USING btree ("fornecedor_id","produto_id");--> statement-breakpoint
CREATE INDEX "historico_precos_fp_idx" ON "historico_precos" USING btree ("fornecedor_produto_id","em");--> statement-breakpoint
CREATE INDEX "produtos_nome_idx" ON "produtos" USING btree ("nome");--> statement-breakpoint
CREATE UNIQUE INDEX "variantes_produto_nome_uq" ON "variantes" USING btree ("produto_id","nome");