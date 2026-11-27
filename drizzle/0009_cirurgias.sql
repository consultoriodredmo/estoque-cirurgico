CREATE TABLE "cirurgia_procedimentos" (
	"cirurgia_id" bigint NOT NULL,
	"procedimento" text NOT NULL,
	CONSTRAINT "cirurgia_procedimentos_cirurgia_id_procedimento_pk" PRIMARY KEY("cirurgia_id","procedimento")
);
--> statement-breakpoint
CREATE TABLE "cirurgias" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"paciente" text NOT NULL,
	"data" date NOT NULL,
	"hora" time,
	"situacao" text DEFAULT 'agendada' NOT NULL,
	"chinelo_variante_id" bigint,
	"observacao" text,
	"origem" text DEFAULT 'manual' NOT NULL,
	"uid_evento" text,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cirurgias_uid_evento_unique" UNIQUE("uid_evento"),
	CONSTRAINT "cirurgias_situacao" CHECK ("cirurgias"."situacao" in ('agendada', 'cancelada', 'consumo_confirmado')),
	CONSTRAINT "cirurgias_origem" CHECK ("cirurgias"."origem" in ('manual', 'icloud'))
);
--> statement-breakpoint
CREATE TABLE "procedimentos" (
	"codigo" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "procedimentos_nome_unique" UNIQUE("nome"),
	CONSTRAINT "procedimentos_tipo" CHECK ("procedimentos"."tipo" in ('procedimento', 'tecnologia'))
);
--> statement-breakpoint
ALTER TABLE "cirurgia_procedimentos" ADD CONSTRAINT "cirurgia_procedimentos_cirurgia_id_cirurgias_id_fk" FOREIGN KEY ("cirurgia_id") REFERENCES "public"."cirurgias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cirurgia_procedimentos" ADD CONSTRAINT "cirurgia_procedimentos_procedimento_procedimentos_codigo_fk" FOREIGN KEY ("procedimento") REFERENCES "public"."procedimentos"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cirurgias" ADD CONSTRAINT "cirurgias_chinelo_variante_id_variantes_id_fk" FOREIGN KEY ("chinelo_variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cirurgias_data_idx" ON "cirurgias" USING btree ("data");