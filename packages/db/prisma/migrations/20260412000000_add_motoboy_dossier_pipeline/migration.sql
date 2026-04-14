-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('LEILOEIRO', 'CORRETOR', 'DESPACHANTE', 'FIELD_AGENT', 'EXTERNO');

-- CreateEnum
CREATE TYPE "AgentAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING_CONTACT', 'CONTACTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'NO_RESPONSE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('PHOTO_EXTERIOR', 'PHOTO_SURROUNDINGS', 'PHOTO_ACCESS', 'VIDEO_EXTERIOR', 'VIDEO_SURROUNDINGS', 'AUDIO_DESCRIPTION', 'DOCUMENT_PHOTO');

-- CreateEnum
CREATE TYPE "DossierStatus" AS ENUM ('DRAFT', 'FIELD_PENDING', 'FIELD_COMPLETE', 'DOCS_PENDING', 'READY', 'GENERATED', 'SHARED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('MATRICULA', 'CERTIDAO_ONUS', 'CERTIDAO_ACOES', 'CERTIDAO_DEBITOS', 'EXTRATO_FGTS', 'DEBITOS_MUNICIPAIS', 'ITBI', 'OUTRO');

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "document" TEXT,
    "type" "PartnerType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_agent_profiles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "cities" TEXT[],
    "states" TEXT[],
    "pricePerVisit" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "avgRating" DECIMAL(3,2),
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "availability" "AgentAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_agent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_assignments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING_CONTACT',
    "contactedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "priceAgreed" DECIMAL(10,2),
    "waMessageId" TEXT,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_evidences" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "mediaKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "description" TEXT,
    "aiAnalysis" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_dossiers" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "clientId" TEXT,
    "status" "DossierStatus" NOT NULL DEFAULT 'DRAFT',
    "fieldScore" DECIMAL(4,2),
    "riskScore" DECIMAL(4,2),
    "aiSummary" TEXT,
    "reportUrl" TEXT,
    "reportKey" TEXT,
    "generatedAt" TIMESTAMP(3),
    "sharedWithLead" BOOLEAN NOT NULL DEFAULT false,
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_dossiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_documents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "mediaKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dossier_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partners_workspaceId_idx" ON "partners"("workspaceId");
CREATE INDEX "partners_workspaceId_type_idx" ON "partners"("workspaceId", "type");
CREATE UNIQUE INDEX "partners_workspaceId_phone_key" ON "partners"("workspaceId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "field_agent_profiles_partnerId_key" ON "field_agent_profiles"("partnerId");
CREATE INDEX "field_agent_profiles_workspaceId_idx" ON "field_agent_profiles"("workspaceId");
CREATE INDEX "field_agent_profiles_states_idx" ON "field_agent_profiles"("states");

-- CreateIndex
CREATE INDEX "field_assignments_workspaceId_idx" ON "field_assignments"("workspaceId");
CREATE INDEX "field_assignments_dealId_idx" ON "field_assignments"("dealId");
CREATE INDEX "field_assignments_agentId_idx" ON "field_assignments"("agentId");

-- CreateIndex
CREATE INDEX "field_evidences_workspaceId_dealId_idx" ON "field_evidences"("workspaceId", "dealId");
CREATE INDEX "field_evidences_assignmentId_idx" ON "field_evidences"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "property_dossiers_dealId_key" ON "property_dossiers"("dealId");
CREATE INDEX "property_dossiers_workspaceId_idx" ON "property_dossiers"("workspaceId");

-- CreateIndex
CREATE INDEX "dossier_documents_workspaceId_dossierId_idx" ON "dossier_documents"("workspaceId", "dossierId");

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_agent_profiles" ADD CONSTRAINT "field_agent_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_agent_profiles" ADD CONSTRAINT "field_agent_profiles_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_assignments" ADD CONSTRAINT "field_assignments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_assignments" ADD CONSTRAINT "field_assignments_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_assignments" ADD CONSTRAINT "field_assignments_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "field_agent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_evidences" ADD CONSTRAINT "field_evidences_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_evidences" ADD CONSTRAINT "field_evidences_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "field_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_dossiers" ADD CONSTRAINT "property_dossiers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_dossiers" ADD CONSTRAINT "property_dossiers_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_documents" ADD CONSTRAINT "dossier_documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dossier_documents" ADD CONSTRAINT "dossier_documents_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "property_dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
