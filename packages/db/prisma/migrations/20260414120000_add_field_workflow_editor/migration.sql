-- CreateEnum
CREATE TYPE "FieldStepType" AS ENUM ('SEND_MESSAGE', 'WAIT_RESPONSE', 'WAIT_DELAY', 'CONDITION', 'UPDATE_STATUS', 'SCHEDULE_FOLLOWUP', 'DISPATCH_NEXT');

-- CreateTable
CREATE TABLE "field_workflows" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_workflow_steps" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldStepType" NOT NULL,
    "position" INTEGER NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_workflow_edges" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT,
    "condition" JSONB,

    CONSTRAINT "field_workflow_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_message_templates" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variables" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_workflow_configs" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "agentLimit" INTEGER NOT NULL DEFAULT 3,
    "followupDelayMs" INTEGER NOT NULL DEFAULT 7200000,
    "deadlineHours" INTEGER NOT NULL DEFAULT 48,
    "priceDefault" DECIMAL(10,2) NOT NULL DEFAULT 80,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "evidenceTypes" JSONB NOT NULL DEFAULT '["PHOTO_EXTERIOR","PHOTO_SURROUNDINGS","PHOTO_ACCESS","VIDEO_EXTERIOR","AUDIO_DESCRIPTION"]',
    "evidenceMinimum" INTEGER NOT NULL DEFAULT 6,
    "autoRetry" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "field_workflow_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_workflows_workspaceId_name_key" ON "field_workflows"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "field_workflows_workspaceId_idx" ON "field_workflows"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "field_workflow_steps_workflowId_key_key" ON "field_workflow_steps"("workflowId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "field_workflow_steps_workflowId_position_key" ON "field_workflow_steps"("workflowId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "field_workflow_edges_workflowId_sourceId_targetId_key" ON "field_workflow_edges"("workflowId", "sourceId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "field_message_templates_stepId_key" ON "field_message_templates"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "field_workflow_configs_workflowId_key" ON "field_workflow_configs"("workflowId");

-- AddForeignKey
ALTER TABLE "field_workflows" ADD CONSTRAINT "field_workflows_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_workflow_steps" ADD CONSTRAINT "field_workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "field_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_workflow_edges" ADD CONSTRAINT "field_workflow_edges_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "field_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_workflow_edges" ADD CONSTRAINT "field_workflow_edges_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "field_workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_workflow_edges" ADD CONSTRAINT "field_workflow_edges_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "field_workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_message_templates" ADD CONSTRAINT "field_message_templates_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "field_workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_workflow_configs" ADD CONSTRAINT "field_workflow_configs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "field_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
