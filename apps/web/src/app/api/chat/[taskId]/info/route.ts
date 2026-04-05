export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, Prisma } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog, getScopedTask } from "@/lib/chatguru-api";

const Schema = z.object({
  responsavelId: z.string().max(120).nullable().optional(),
  departamentoId: z.string().cuid().nullable().optional(),
  arquivado: z.boolean().optional(),
  favorito: z.boolean().optional(),
  chatbotAtivo: z.boolean().optional(),
  tags: z.array(z.string().cuid()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { taskId } = await params;
  const task = await getScopedTask(session.workspaceId, taskId);
  if (!task) return NextResponse.json({ error: "Task nao encontrada" }, { status: 404 });

  let departamentoId = parsed.data.departamentoId;
  if (departamentoId) {
    const department = await db.department.findFirst({
      where: { id: departamentoId, workspaceId: session.workspaceId },
      select: { id: true },
    });
    if (!department) {
      return NextResponse.json({ error: "Departamento nao pertence ao workspace" }, { status: 403 });
    }
  }

  const responsavelId =
    parsed.data.responsavelId === undefined
      ? undefined
      : parsed.data.responsavelId === null
        ? null
        : defaultSanitizer.clean(parsed.data.responsavelId);

  const updateData: Record<string, unknown> = {};
  if (responsavelId !== undefined) updateData["responsavelId"] = responsavelId;
  if (departamentoId !== undefined) updateData["departamentoId"] = departamentoId;
  if (parsed.data.arquivado !== undefined) updateData["arquivado"] = parsed.data.arquivado;
  if (parsed.data.favorito !== undefined) updateData["favorito"] = parsed.data.favorito;
  if (parsed.data.chatbotAtivo !== undefined) updateData["chatbotAtivo"] = parsed.data.chatbotAtivo;

  const chatSession = await db.chatSession.upsert({
    where: { taskId },
    create: {
      workspaceId: session.workspaceId,
      taskId,
      ...(responsavelId !== undefined ? { responsavelId } : {}),
      ...(departamentoId !== undefined ? { departamentoId } : {}),
      ...(parsed.data.arquivado !== undefined ? { arquivado: parsed.data.arquivado } : {}),
      ...(parsed.data.favorito !== undefined ? { favorito: parsed.data.favorito } : {}),
      ...(parsed.data.chatbotAtivo !== undefined ? { chatbotAtivo: parsed.data.chatbotAtivo } : {}),
    },
    update: updateData,
  });

  let safeTags: string[] | undefined;
  if (parsed.data.tags) {
    if (!task.deal?.contactId) {
      return NextResponse.json({ error: "Task sem contato vinculado para atualizar tags" }, { status: 422 });
    }

    safeTags = parsed.data.tags.map((tagId) => defaultSanitizer.clean(tagId));
    const validTags = await db.chatTag.findMany({
      where: { workspaceId: session.workspaceId, id: { in: safeTags } },
      select: { id: true },
    });

    if (validTags.length !== safeTags.length) {
      return NextResponse.json({ error: "Uma ou mais tags nao pertencem ao workspace" }, { status: 403 });
    }

    const contact = await db.contact.findFirst({
      where: { id: task.deal.contactId, workspaceId: session.workspaceId },
      select: { id: true, meta: true },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contato nao encontrado" }, { status: 404 });
    }

    const nextMeta = {
      ...((contact.meta ?? {}) as Prisma.JsonObject),
      tags: safeTags,
    } as Prisma.InputJsonObject;

    await db.contact.update({
      where: { id: contact.id },
      data: { meta: nextMeta },
    });
  }

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.session.info.update",
    input: {
      taskId,
      ...(responsavelId !== undefined ? { responsavelId } : {}),
      ...(departamentoId !== undefined ? { departamentoId } : {}),
      ...(parsed.data.arquivado !== undefined ? { arquivado: parsed.data.arquivado } : {}),
      ...(parsed.data.favorito !== undefined ? { favorito: parsed.data.favorito } : {}),
      ...(parsed.data.chatbotAtivo !== undefined ? { chatbotAtivo: parsed.data.chatbotAtivo } : {}),
      ...(safeTags ? { tags: safeTags } : {}),
    },
    output: { chatSessionId: chatSession.id, dealId: task.dealId ?? null },
  });

  return NextResponse.json({ ok: true, chatSession });
}
