CREATE TABLE "regra_itens" (
	"regra_id" bigint NOT NULL,
	"produto_id" bigint NOT NULL,
	"quantidade" integer NOT NULL,
	CONSTRAINT "regra_itens_regra_id_produto_id_pk" PRIMARY KEY("regra_id","produto_id"),
	CONSTRAINT "regra_itens_quantidade" CHECK ("regra_itens"."quantidade" > 0)
);
--> statement-breakpoint
CREATE TABLE "regras_kit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"grupo" text NOT NULL,
	"descricao" text NOT NULL,
	"todos" text[] DEFAULT '{}'::text[] NOT NULL,
	"algum" text[] DEFAULT '{}'::text[] NOT NULL,
	"nenhum" text[] DEFAULT '{}'::text[] NOT NULL,
	"somente" boolean DEFAULT false NOT NULL,
	"prioridade" integer DEFAULT 0 NOT NULL,
	"provisoria" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procedimentos" DROP CONSTRAINT "procedimentos_tipo";--> statement-breakpoint
ALTER TABLE "regra_itens" ADD CONSTRAINT "regra_itens_regra_id_regras_kit_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_kit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_itens" ADD CONSTRAINT "regra_itens_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "regras_kit_grupo_idx" ON "regras_kit" USING btree ("grupo");--> statement-breakpoint
ALTER TABLE "procedimentos" ADD CONSTRAINT "procedimentos_tipo" CHECK ("procedimentos"."tipo" in ('procedimento', 'complemento', 'tecnologia'));