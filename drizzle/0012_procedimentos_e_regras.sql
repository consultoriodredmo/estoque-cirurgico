-- Lista de procedimentos informada pelo Edmo em 27/11/2026.
-- Os códigos não mudam (as regras dependem deles); só nomes, tipo e ordem.
INSERT INTO procedimentos (codigo, nome, tipo, ordem) VALUES
  ('protese_mama', 'Mamoplastia de aumento (prótese)', 'procedimento', 1),
  ('mamoplastia_protese', 'Mamoplastia com prótese (mastopexia com prótese)', 'procedimento', 2),
  ('mamoplastia', 'Mamoplastia redutora (sem prótese)', 'procedimento', 3),
  ('abdominoplastia', 'Abdominoplastia', 'procedimento', 4),
  ('lipoescultura_enxerto', 'Lipoescultura (com enxerto de gordura)', 'procedimento', 5),
  ('lipoaspiracao', 'Lipoaspiração', 'procedimento', 6),
  ('blefaroplastia', 'Blefaroplastia', 'procedimento', 7),
  ('rinoplastia', 'Rinoplastia', 'procedimento', 8),
  ('facelift_v1', 'Facelifting Vector 1 vetor', 'procedimento', 9),
  ('facelift_v2', 'Facelifting Vector 2 vetores', 'procedimento', 10),
  ('facelift_v3', 'Facelifting Vector 3 vetores', 'procedimento', 11),
  ('facelift_v4', 'Facelifting Vector 4 vetores', 'procedimento', 12),
  ('facelift_v5', 'Facelifting Vector 5 vetores', 'procedimento', 13),
  ('lipo_axilar', 'Lipo axilar (contorno da mama)', 'complemento', 20),
  ('renuvion', 'Renuvion', 'tecnologia', 30)
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, tipo = EXCLUDED.tipo, ordem = EXCLUDED.ordem, ativo = true;
--> statement-breakpoint

-- Regras não se apagam: desativam-se (o histórico de previsões depende delas).
CREATE TRIGGER regras_kit_sem_exclusao BEFORE DELETE ON regras_kit FOR EACH ROW EXECUTE FUNCTION impedir_exclusao();
--> statement-breakpoint

ALTER TABLE regras_kit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE regra_itens ENABLE ROW LEVEL SECURITY;
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
