-- CreateEnum
CREATE TYPE "PixKeyType" AS ENUM ('CPF', 'EMAIL', 'PHONE', 'EVP');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EditalSource" AS ENUM ('UPLOAD', 'RPA_CAIXA', 'RPA_LEILOEIRO', 'RPA_DOU', 'RPA_TJ');

-- CreateEnum
CREATE TYPE "EditalStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'EXPIRED', 'POS_48H');

-- CreateEnum
CREATE TYPE "DeliveryContext" AS ENUM ('PRE_ARREMATE', 'POS_ARREMATE');

-- AlterTable: FieldAgentProfile — add CPF + PIX
ALTER TABLE "field_agent_profiles" ADD COLUMN "cpf" TEXT;
ALTER TABLE "field_agent_profiles" ADD COLUMN "pixKey" TEXT;
ALTER TABLE "field_agent_profiles" ADD COLUMN "pixKeyType" "PixKeyType";

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "pixKey" TEXT NOT NULL,
    "pixKeyType" "PixKeyType" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "breakdown" JSONB NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_checklists" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "gateB" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dossier_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editais" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "sourceType" "EditalSource" NOT NULL,
    "sourceUrl" TEXT,
    "fileUrl" TEXT,
    "rawText" TEXT,
    "status" "EditalStatus" NOT NULL DEFAULT 'PENDING',
    "leilaoDate" TIMESTAMP(3),
    "leilaoModalidade" TEXT,
    "leiloeiro" TEXT,
    "varaJudicial" TEXT,
    "valorAvaliacao" INTEGER,
    "lanceMinimo" INTEGER,
    "debitosEdital" JSONB,
    "restricoes" JSONB,
    "prazoBoletoPago" TIMESTAMP(3),
    "urgencyLevel" "UrgencyLevel" NOT NULL DEFAULT 'NORMAL',
    "horasAteEvento" INTEGER,
    "deliveryContext" "DeliveryContext" NOT NULL DEFAULT 'PRE_ARREMATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_assignmentId_key" ON "payment_orders"("assignmentId");

-- CreateIndex
CREATE INDEX "payment_orders_workspaceId_idx" ON "payment_orders"("workspaceId");

-- CreateIndex
CREATE INDEX "payment_orders_status_idx" ON "payment_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "dossier_checklists_dossierId_key" ON "dossier_checklists"("dossierId");

-- CreateIndex
CREATE INDEX "dossier_checklists_workspaceId_idx" ON "dossier_checklists"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "editais_dealId_key" ON "editais"("dealId");

-- CreateIndex
CREATE INDEX "editais_workspaceId_idx" ON "editais"("workspaceId");

-- CreateIndex
CREATE INDEX "editais_leilaoDate_idx" ON "editais"("leilaoDate");

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "field_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_checklists" ADD CONSTRAINT "dossier_checklists_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_checklists" ADD CONSTRAINT "dossier_checklists_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "property_dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editais" ADD CONSTRAINT "editais_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editais" ADD CONSTRAINT "editais_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
