-- A trilha de auditoria não pode ser alterada nem apagada, nem pelo administrador.
CREATE TRIGGER auditoria_imutavel
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();
--> statement-breakpoint

-- Segunda trava contra acesso pelo navegador (ver 0001): RLS ligado, sem políticas.
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE session ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE account ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE verification ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE two_factor ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rate_limit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- As tabelas novas também ficam fora do alcance de anon/authenticated (Supabase).
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
