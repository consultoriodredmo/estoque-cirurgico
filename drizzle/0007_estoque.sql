CREATE TABLE "custos_medios" (
	"variante_id" bigint PRIMARY KEY NOT NULL,
	"custo" numeric(14, 4) NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"local" text,
	"motivo" text NOT NULL,
	"usuario_id" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"estorno_de" text,
	CONSTRAINT "lancamentos_estorno_de_unique" UNIQUE("estorno_de"),
	CONSTRAINT "lancamentos_tipo" CHECK ("lancamentos"."tipo" in ('implantacao', 'ajuste', 'estorno'))
);
--> statement-breakpoint
CREATE TABLE "movimentacoes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lancamento_id" text NOT NULL,
	"variante_id" bigint NOT NULL,
	"local" text NOT NULL,
	"quantidade" integer NOT NULL,
	"saldo_apos" integer NOT NULL,
	"custo_unitario" numeric(14, 4),
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimentacoes_quantidade_nao_zero" CHECK ("movimentacoes"."quantidade" <> 0)
);
--> statement-breakpoint
CREATE TABLE "saldos" (
	"variante_id" bigint NOT NULL,
	"local" text NOT NULL,
	"quantidade" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "saldos_variante_id_local_pk" PRIMARY KEY("variante_id","local")
);
--> statement-breakpoint
ALTER TABLE "custos_medios" ADD CONSTRAINT "custos_medios_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_local_locais_codigo_fk" FOREIGN KEY ("local") REFERENCES "public"."locais"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_local_locais_codigo_fk" FOREIGN KEY ("local") REFERENCES "public"."locais"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldos" ADD CONSTRAINT "saldos_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldos" ADD CONSTRAINT "saldos_local_locais_codigo_fk" FOREIGN KEY ("local") REFERENCES "public"."locais"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lancamentos_em_idx" ON "lancamentos" USING btree ("em");--> statement-breakpoint
CREATE INDEX "movimentacoes_variante_local_idx" ON "movimentacoes" USING btree ("variante_id","local");--> statement-breakpoint
CREATE INDEX "movimentacoes_lancamento_idx" ON "movimentacoes" USING btree ("lancamento_id");