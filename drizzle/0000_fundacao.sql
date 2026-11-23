CREATE TABLE "ambiente_sistema" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"ambiente" text NOT NULL,
	"definido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ambiente_sistema_linha_unica" CHECK ("ambiente_sistema"."id" = 1),
	CONSTRAINT "ambiente_sistema_valor" CHECK ("ambiente_sistema"."ambiente" in ('teste', 'producao'))
);
