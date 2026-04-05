-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "channel" TEXT;
ALTER TABLE "tasks" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "tasks_workspaceId_channel_idx" ON "tasks"("workspaceId", "channel");

-- CreateIndex
CREATE INDEX "tasks_workspaceId_groupId_idx" ON "tasks"("workspaceId", "groupId");
