-- CreateEnum
CREATE TYPE "ParallelType" AS ENUM ('CONDOMINIO', 'AVERBACAO', 'DESOCUPACAO');

-- CreateEnum
CREATE TYPE "ParallelStatus" AS ENUM ('INACTIVE', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');

-- CreateTable
CREATE TABLE "deal_parallels" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" "ParallelType" NOT NULL,
    "status" "ParallelStatus" NOT NULL DEFAULT 'INACTIVE',
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "deal_parallels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deal_parallels_dealId_type_key" ON "deal_parallels"("dealId", "type");

-- CreateIndex
CREATE INDEX "deal_parallels_workspaceId_idx" ON "deal_parallels"("workspaceId");

-- AddForeignKey
ALTER TABLE "deal_parallels" ADD CONSTRAINT "deal_parallels_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_parallels" ADD CONSTRAINT "deal_parallels_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
