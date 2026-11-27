-- Lançamentos e movimentações: só inclusão. Correção é por estorno.
CREATE TRIGGER lancamentos_imutaveis BEFORE UPDATE OR DELETE ON lancamentos
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();
--> statement-breakpoint
CREATE TRIGGER movimentacoes_imutaveis BEFORE UPDATE OR DELETE ON movimentacoes
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();
--> statement-breakpoint

-- O saldo só muda pelo livro: cada movimentação inserida atualiza o saldo
-- (com a linha travada) e grava o saldo resultante na própria movimentação.
CREATE OR REPLACE FUNCTION aplicar_movimentacao() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE novo integer;
BEGIN
  PERFORM set_config('estoque.via_livro', '1', true);
  INSERT INTO saldos (variante_id, local, quantidade)
    VALUES (NEW.variante_id, NEW.local, NEW.quantidade)
  ON CONFLICT (variante_id, local)
    DO UPDATE SET quantidade = saldos.quantidade + EXCLUDED.quantidade
  RETURNING quantidade INTO novo;
  PERFORM set_config('estoque.via_livro', '0', true);
  NEW.saldo_apos := novo;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER movimentacoes_aplicar BEFORE INSERT ON movimentacoes
  FOR EACH ROW EXECUTE FUNCTION aplicar_movimentacao();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION saldos_so_pelo_livro() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR coalesce(current_setting('estoque.via_livro', true), '0') <> '1' THEN
    RAISE EXCEPTION 'O saldo só muda por movimentação no livro (%).', TG_OP USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER saldos_protegidos BEFORE INSERT OR UPDATE OR DELETE ON saldos
  FOR EACH ROW EXECUTE FUNCTION saldos_so_pelo_livro();
--> statement-breakpoint

ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE saldos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE custos_medios ENABLE ROW LEVEL SECURITY;
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
