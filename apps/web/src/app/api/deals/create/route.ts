export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionWorkspaceId } from "@/lib/session";
import { publishKanbanEvent } from "@/lib/sse-bus";
import {
  computeDueAt,
  PIPELINE_MASTER_CONFIG,
  SUBTYPE_VALUES,
  SUBTYPE_TO_MODALIDADE,
} from "@flow-os/templates";

const Schema = z.object({
  arrematante: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")).transform((v) => v || undefined),
  phone: z.string().max(20).optional().or(z.literal("")).transform((v) => v || undefined),
  endereco: z.string().min(1).max(400),
  uf: z.string().length(2).toUpperCase(),
  value: z.number().positive(),
  modalidade: z.enum(SUBTYPE_VALUES).default("FINANCIAMENTO"),
});

export async function POST(req: NextRequest) {
  // [SEC-03] workspaceId da sessão - nunca do body
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { arrematante, email, phone, endereco, uf, value, modalidade } = parsed.data;
  const safeArrematante = defaultSanitizer.clean(arrematante);
  const safeEmail = email ? defaultSanitizer.clean(email) : undefined;
  const safePhone = phone ? defaultSanitizer.clean(phone) : undefined;
  const safeEndereco = defaultSanitizer.clean(endereco);
  const safeUf = defaultSanitizer.clean(uf).toUpperCase();

  // Busca o primeiro stage do workspace
  const firstStage = await db.stage.findFirst({
    where: { workspaceId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!firstStage) {
    return NextResponse.json({ error: "Workspace sem stages configurados" }, { status: 422 });
  }

  // Cria contato simples (sem dedup por CPF - criação básica funcional)
  const contact = await db.contact.create({
    data: { workspaceId, name: safeArrematante, email: safeEmail ?? null, phone: safePhone ?? null, type: "PERSON" },
  });

  const enteredAt = new Date();
  const triagemMaster = PIPELINE_MASTER_CONFIG.stages.find((s) => s.id === "triagem");
  const { dueAt, basis } = computeDueAt({
    stageId: "triagem",
    enteredAt,
    stage: triagemMaster ?? null,
  });

  const deal = await db.deal.create({
    data: {
      workspaceId,
      stageId: firstStage.id,
      contactId: contact.id,
      title: `${safeArrematante} - ${safeEndereco.slice(0, 60)}`,
      value,
      meta: {
        eisenhower: "Q2_PLAN",
        kanbanStatus: "inbox",
        currentPhase: "triagem",
        stageId: "triagem",
        dueAt: dueAt?.toISOString() ?? null,
        slaBasis: basis,
        stageEnteredAt: enteredAt.toISOString(),
        endereco: safeEndereco,
        uf: safeUf,
        cidade: defaultSanitizer.clean(safeEndereco.split(",").at(-2)?.trim() ?? ""),
        modalidade: SUBTYPE_TO_MODALIDADE[modalidade],
        subtype: modalidade,
        channels: ["WA"],
        corretorNome: "",
      },
    },
    select: { id: true, title: true, value: true, createdAt: true },
  });

  // Notifica Kanban via SSE
  publishKanbanEvent({
    type: "DEAL_UPDATE",
    dealId: deal.id,
    timestamp: Date.now(),
  });

  return NextResponse.json({ ok: true, deal }, { status: 201 });
}
