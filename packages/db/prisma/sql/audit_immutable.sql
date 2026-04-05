-- ─────────────────────────────────────────────────────────────────────────────
-- FlowOS v4 — Trigger: audit_immutable [SEC-06]
-- Garante que agent_audit_logs seja INSERT ONLY.
-- UPDATE e DELETE geram exceção de banco de dados.
-- Executado após db:push via `pnpm db:setup`.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Habilitar extensão pgvector (se não existir)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Índice IVFFLAT para busca semântica em brain_memories
-- ─────────────────────────────────────────────────────────────────────────────
-- Criado AFTER db:push porque Prisma não gerencia índices de tipo vector.
-- IVFFLAT: bom trade-off entre velocidade e recall para até ~1M vetores.
-- Para >1M vetores, considerar HNSW: CREATE INDEX USING hnsw(...).

CREATE INDEX IF NOT EXISTS brain_memories_embedding_idx
  ON brain_memories
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Função de trigger: bloqueia UPDATE e DELETE em audit logs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_audit_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      '[SEC-06] FlowOS audit log is INSERT ONLY. UPDATE is forbidden on table "%". '
      'Attempted by role "%".',
      TG_TABLE_NAME,
      current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      '[SEC-06] FlowOS audit log is INSERT ONLY. DELETE is forbidden on table "%". '
      'Attempted by role "%".',
      TG_TABLE_NAME,
      current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NULL; -- AFTER trigger: retorno ignorado para UPDATE/DELETE bloqueados
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Aplicar trigger à tabela agent_audit_logs
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_audit_immutable ON agent_audit_logs;

CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE
  ON agent_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Comentários de documentação
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TRIGGER trg_audit_immutable ON agent_audit_logs IS
  '[SEC-06] FlowOS v4 — Audit log immutable. INSERT ONLY enforced at DB level.';

COMMENT ON TABLE agent_audit_logs IS
  'Audit log append-only de ações de agentes IA. '
  'UPDATE e DELETE bloqueados por trigger trg_audit_immutable [SEC-06]. '
  'Toda ação de agente é rastreada aqui com input, output, custo e duração.';

COMMENT ON TABLE knowledge_chunks IS
  'Fragmentos de documentos com embedding pgvector para RAG. '
  'Índice IVFFLAT em knowledge_chunks_embedding_idx. '
  'contentHash garante deduplicação por workspace.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Índices de performance — Deal.meta JSON + InternalMessage
-- ─────────────────────────────────────────────────────────────────────────────
-- GIN jsonb_path_ops: acelera queries meta->>path em Deal (layout badges, kanban)

-- Prisma preserva camelCase nas colunas — usar aspas duplas no SQL raw.
CREATE INDEX IF NOT EXISTS deals_meta_gin_idx
  ON deals USING GIN (meta jsonb_path_ops);

-- Índice parcial: contagem rápida de deals Q1_DO no badge do menu lateral
CREATE INDEX IF NOT EXISTS deals_eisenhower_q1_idx
  ON deals ("workspaceId")
  WHERE (meta->>'eisenhower') = 'Q1_DO' AND "closedAt" IS NULL;

-- Índice para contagem rápida de mensagens internas (badge do menu)
CREATE INDEX IF NOT EXISTS internal_messages_workspace_created_idx
  ON internal_messages ("workspaceId", "createdAt" DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação: confirmar que o trigger foi criado
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_audit_immutable'
      AND event_object_table = 'agent_audit_logs'
  ) INTO trigger_exists;

  IF trigger_exists THEN
    RAISE NOTICE '[SEC-06] ✓ Trigger audit_immutable ativo em agent_audit_logs';
  ELSE
    RAISE WARNING '[SEC-06] ✗ Trigger audit_immutable NÃO encontrado — verificar setup';
  END IF;
END;
$$;
