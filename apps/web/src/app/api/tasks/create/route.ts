export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, TaskPriority } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";

const Schema = z.object({
  title: z.string().min(1).max(200),
  quadrant: z.enum(["Q1_DO", "Q2_PLAN", "Q3_DELEGATE", "Q4_ELIMINATE"]).optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  type: z.string().max(120).optional().nullable(),
  dealId: z.string().cuid().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  assigneeId: z.string().max(120).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
});

function quadrantFromPriority(priority: "HIGH" | "MEDIUM" | "LOW"): "Q1_DO" | "Q2_PLAN" | "Q3_DELEGATE" {
  if (priority === "HIGH") return "Q1_DO";
  if (priority === "LOW") return "Q3_DELEGATE";
  return "Q2_PLAN";
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const {
    title,
    dealId,
    dueAt,
    assigneeId,
    description,
    type,
  } = parsed.data;

  const priority = parsed.data.priority ?? "MEDIUM";
  const quadrant = parsed.data.quadrant ?? quadrantFromPriority(priority);
  const isUrgent = quadrant === "Q1_DO" || quadrant === "Q3_DELEGATE";
  const isImportant = quadrant === "Q1_DO" || quadrant === "Q2_PLAN";
  const safeTitle = defaultSanitizer.clean(title);
  const safeType = type ? defaultSanitizer.clean(type) : null;
  const safeDescription = description ? defaultSanitizer.clean(description) : null;
  const safeAssigneeId = assigneeId ? defaultSanitizer.clean(assigneeId) : null;

  if (dealId) {
    const deal = await db.deal.findFirst({
      where: { id: dealId, workspaceId: session.workspaceId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json(
        { error: "Deal não pertence ao workspace" },
        { status: 403 },
      );
    }
  }

  const task = await db.task.create({
    data: {
      workspaceId: session.workspaceId,
      title: safeTitle,
      description: safeDescription,
      type: safeType,
      quadrant,
      priority: TaskPriority[priority],
      urgent: isUrgent,
      important: isImportant,
      ...(dealId ? { dealId } : {}),
      ...(dueAt ? { dueAt: new Date(dueAt) } : {}),
      ...(safeAssigneeId ? { assigneeId: safeAssigneeId } : {}),
    },
    include: {
      deal: {
        select: {
          id: true,
          title: true,
          contact: { select: { name: true, email: true, phone: true } },
        },
      },
    },
  });

  return NextResponse.json({ ok: true, task }, { status: 201 });
}
