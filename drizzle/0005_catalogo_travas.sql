-- Os três locais de estoque da especificação (seção 2).
INSERT INTO locais (codigo, nome, ordem) VALUES
  ('consultorio', 'Consultório', 1),
  ('farmacia', 'Farmácia do hospital', 2),
  ('armario', 'Armário privativo', 3)
ON CONFLICT (codigo) DO NOTHING;
--> statement-breakpoint

-- Locais são fixos: não se alteram nem se apagam pelo sistema.
CREATE TRIGGER locais_imutaveis
  BEFORE UPDATE OR DELETE ON locais
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();
--> statement-breakpoint

-- Histórico de preços: só inclusão.
CREATE TRIGGER historico_precos_imutavel
  BEFORE UPDATE OR DELETE ON historico_precos
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();
--> statement-breakpoint

-- Cadastros nunca são apagados (o histórico depende deles): só desativados.
CREATE OR REPLACE FUNCTION impedir_exclusao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Exclusão não permitida em %: desative o registro.', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER produtos_sem_exclusao BEFORE DELETE ON produtos FOR EACH ROW EXECUTE FUNCTION impedir_exclusao();
--> statement-breakpoint
CREATE TRIGGER variantes_sem_exclusao BEFORE DELETE ON variantes FOR EACH ROW EXECUTE FUNCTION impedir_exclusao();
--> statement-breakpoint
CREATE TRIGGER fornecedores_sem_exclusao BEFORE DELETE ON fornecedores FOR EACH ROW EXECUTE FUNCTION impedir_exclusao();
--> statement-breakpoint
CREATE TRIGGER fornecedor_produtos_sem_exclusao BEFORE DELETE ON fornecedor_produtos FOR EACH ROW EXECUTE FUNCTION impedir_exclusao();
--> statement-breakpoint

ALTER TABLE locais ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE variantes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fornecedor_produtos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE historico_precos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
    END IF;
  END LOOP;
END;
$$;
