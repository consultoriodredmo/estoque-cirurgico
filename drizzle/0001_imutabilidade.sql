-- Função genérica que impede UPDATE e DELETE numa tabela.
-- Será usada no livro de movimentações e na auditoria (etapa 1.4).
-- Nem o administrador consegue alterar ou apagar: correção é sempre por estorno.
CREATE OR REPLACE FUNCTION bloquear_alteracao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro imutável: % em % não é permitido. Use estorno ou ajuste.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint

-- A marca de ambiente, depois de gravada, não pode ser trocada nem apagada.
CREATE TRIGGER ambiente_sistema_imutavel
  BEFORE UPDATE OR DELETE ON ambiente_sistema
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();
--> statement-breakpoint

-- Segunda trava para o acesso pelo navegador: RLS ligado e nenhuma política.
-- O servidor da aplicação, dono das tabelas, não é afetado.
ALTER TABLE ambiente_sistema ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- No Supabase, os papéis "anon" e "authenticated" dão acesso ao banco direto
-- pelo navegador. Este sistema só acessa o banco pelo servidor, então essa
-- porta fica fechada. (Os papéis só existem no Supabase; localmente nada muda.)
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', papel);
    END IF;
  END LOOP;
END;
$$;
