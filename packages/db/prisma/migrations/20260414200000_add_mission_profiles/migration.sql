-- CreateEnum
CREATE TYPE "ProfileLevel" AS ENUM ('DOWN', 'STANDARD', 'UP');

-- CreateTable
CREATE TABLE "mission_profiles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "level" "ProfileLevel" NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bandeiradaValue" INTEGER NOT NULL DEFAULT 4000,
    "maxValue" INTEGER NOT NULL DEFAULT 8000,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "items" JSONB NOT NULL DEFAULT '[]',
    "skipPenalty" BOOLEAN NOT NULL DEFAULT true,
    "skipRequiresText" BOOLEAN NOT NULL DEFAULT true,
    "skipMinChars" INTEGER NOT NULL DEFAULT 10,
    "skipMaxItems" INTEGER NOT NULL DEFAULT 3,
    "skipReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "agentLimit" INTEGER NOT NULL DEFAULT 3,
    "followupDelayMs" INTEGER NOT NULL DEFAULT 7200000,
    "deadlineHours" INTEGER NOT NULL DEFAULT 48,
    "autoSelectRules" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "mission_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mission_profiles_workspaceId_name_key" ON "mission_profiles"("workspaceId", "name");

CREATE INDEX "mission_profiles_workspaceId_idx" ON "mission_profiles"("workspaceId");

-- AddForeignKey
ALTER TABLE "mission_profiles" ADD CONSTRAINT "mission_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (field_assignments: backfill pwaAccessToken before NOT NULL + unique)
ALTER TABLE "field_assignments" ADD COLUMN "profileId" TEXT,
ADD COLUMN "pwaAccessToken" TEXT;

UPDATE "field_assignments" SET "pwaAccessToken" = gen_random_uuid()::text WHERE "pwaAccessToken" IS NULL;

ALTER TABLE "field_assignments" ALTER COLUMN "pwaAccessToken" SET NOT NULL;

CREATE UNIQUE INDEX "field_assignments_pwaAccessToken_key" ON "field_assignments"("pwaAccessToken");

CREATE INDEX "field_assignments_profileId_idx" ON "field_assignments"("profileId");

ALTER TABLE "field_assignments" ADD CONSTRAINT "field_assignments_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "mission_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
