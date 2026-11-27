-- Procedimentos e tecnologias citados na especificação (seção 5) e pelo Edmo.
-- O administrador pode cadastrar outros pela tela.
INSERT INTO procedimentos (codigo, nome, tipo, ordem) VALUES
  ('protese_mama', 'Prótese de mama', 'procedimento', 1),
  ('mamoplastia', 'Mamoplastia', 'procedimento', 2),
  ('lipo_axilar', 'Lipo axilar', 'procedimento', 3),
  ('abdominoplastia', 'Abdominoplastia', 'procedimento', 4),
  ('lipoaspiracao', 'Lipoaspiração', 'procedimento', 5),
  ('lipoescultura_enxerto', 'Lipoescultura com enxerto de gordura', 'procedimento', 6),
  ('renuvion', 'Renuvion', 'tecnologia', 10)
ON CONFLICT (codigo) DO NOTHING;
--> statement-breakpoint

-- Cirurgias e procedimentos não se apagam: cirurgia se cancela, procedimento se desativa.
CREATE TRIGGER cirurgias_sem_exclusao BEFORE DELETE ON cirurgias FOR EACH ROW EXECUTE FUNCTION impedir_exclusao();
--> statement-breakpoint
CREATE TRIGGER procedimentos_sem_exclusao BEFORE DELETE ON procedimentos FOR EACH ROW EXECUTE FUNCTION impedir_exclusao();
--> statement-breakpoint

-- O código de um procedimento é a chave das regras de kit: não muda.
CREATE OR REPLACE FUNCTION procedimento_codigo_fixo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo <> OLD.codigo THEN
    RAISE EXCEPTION 'O código do procedimento não pode mudar.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER procedimentos_codigo_fixo BEFORE UPDATE ON procedimentos FOR EACH ROW EXECUTE FUNCTION procedimento_codigo_fixo();
--> statement-breakpoint

ALTER TABLE procedimentos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cirurgias ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cirurgia_procedimentos ENABLE ROW LEVEL SECURITY;
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
END $$;
