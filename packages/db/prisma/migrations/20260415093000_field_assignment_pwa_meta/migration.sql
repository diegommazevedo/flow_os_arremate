-- PWA v2: estado incremental (itemStates), confirmação celular, pixPendente
ALTER TABLE "field_assignments" ADD COLUMN "meta" JSONB NOT NULL DEFAULT '{}';
