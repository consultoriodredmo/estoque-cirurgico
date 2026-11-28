ALTER TABLE "lancamentos" DROP CONSTRAINT "lancamentos_tipo";--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "cirurgia_id" bigint;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_cirurgia_id_cirurgias_id_fk" FOREIGN KEY ("cirurgia_id") REFERENCES "public"."cirurgias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lancamentos_cirurgia_idx" ON "lancamentos" USING btree ("cirurgia_id");--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_tipo" CHECK ("lancamentos"."tipo" in ('implantacao', 'ajuste', 'estorno', 'consumo'));