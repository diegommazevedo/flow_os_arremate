/**
 * GET /api/leads — lista paginada de leads (contacts + deal + dossiê + tags).
 * [SEC-03] workspaceId da sessão.
 * Filtros: stageIds / stageIds[] (cuid do Stage), funnel=1 → só funil (stages + contagens).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { LeadLifecycle, Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";
import { maskPhoneTail } from "@/lib/phone-mask";

function dossierBucket(
  status: string | null | undefined,
): "none" | "progress" | "ready" {
  if (!status) return "none";
  if (status === "GENERATED" || status === "SHARED") return "ready";
  return "progress";
}

function mergeContactAnd(where: Prisma.ContactWhereInput, clauses: Prisma.ContactWhereInput[]) {
  if (clauses.length === 0) return;
  const prev = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  where.AND = [...prev, ...clauses];
}

function applyDealStageAndDossierFilters(
  where: Prisma.ContactWhereInput,
  workspaceId: string,
  stageIds: string[],
  hasDossier: string | null,
) {
  const extra: Prisma.ContactWhereInput[] = [];

  if (hasDossier === "none") {
    extra.push({
      NOT: {
        deals: {
          some: {
            workspaceId,
            closedAt: null,
            propertyDossier: {
              is: {
                status: {
                  in: [
                    "GENERATED",
                    "SHARED",
                    "READY",
                    "FIELD_COMPLETE",
                    "FIELD_PENDING",
                    "DOCS_PENDING",
                  ],
                },
              },
            },
          },
        },
      },
    });
  }

  const needSome =
    stageIds.length > 0 || hasDossier === "ready" || hasDossier === "progress";
  if (needSome) {
    const some: Prisma.DealWhereInput = { workspaceId, closedAt: null };
    if (stageIds.length > 0) {
      some.stageId = { in: stageIds };
    }
    if (hasDossier === "ready") {
      some.propertyDossier = { is: { status: { in: ["GENERATED", "SHARED"] } } };
    } else if (hasDossier === "progress") {
      some.propertyDossier = {
        is: {
          status: {
            in: ["DRAFT", "FIELD_PENDING", "FIELD_COMPLETE", "DOCS_PENDING", "READY"],
          },
        },
      };
    }
    extra.push({ deals: { some: some } });
  }

  mergeContactAnd(where, extra);
}

export async function GET(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;

  if (sp.get("funnel") === "1") {
    const [stages, grouped] = await Promise.all([
      db.stage.findMany({
        where: { workspaceId },
        orderBy: { position: "asc" },
        select: { id: true, name: true, position: true },
      }),
      db.deal.groupBy({
        by: ["stageId"],
        where: { workspaceId, closedAt: null, contactId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const stageCounts: Record<string, number> = {};
    for (const row of grouped) {
      stageCounts[row.stageId] = row._count._all;
    }
    return NextResponse.json({ stages, stageCounts });
  }

  const stageIdParams = [...sp.getAll("stageIds"), ...sp.getAll("stageIds[]")];
  const stageIds = [...new Set(stageIdParams.map((s) => s.trim()).filter(Boolean))];

  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? "25") || 25));
  const search = (sp.get("search") ?? "").trim();
  const cidade = (sp.get("cidade") ?? "").trim();
  const uf = (sp.get("uf") ?? "").trim().toUpperCase();
  const hasDossier = sp.get("hasDossier");
  const createdFrom = sp.get("createdFrom");
  const createdTo = sp.get("createdTo");

  const statusParams = sp.getAll("status");
  const tagParams = sp.getAll("tags");

  const where: Prisma.ContactWhereInput = { workspaceId };

  if (search) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search.replace(/\D/g, "") } },
        ],
      },
    ];
  }

  if (statusParams.length > 0) {
    const allowed: LeadLifecycle[] = ["PROSPECT", "LEAD", "ACTIVE"];
    const st = statusParams.filter((s): s is LeadLifecycle =>
      (allowed as readonly string[]).includes(s),
    );
    if (st.length > 0) {
      where.leadLifecycle = { in: st };
    }
  }

  if (tagParams.length > 0) {
    where.contactTags = {
      some: { workspaceId, tagId: { in: tagParams } },
    };
  }

  if (cidade || uf.length === 2) {
    const dealWhere: Prisma.DealWhereInput = {
      workspaceId,
      closedAt: null,
      contactId: { not: null },
      ...(stageIds.length > 0 ? { stageId: { in: stageIds } } : {}),
    };
    const deals = await db.deal.findMany({
      where: dealWhere,
      select: { contactId: true, meta: true },
      take: 4000,
    });
    const needle = cidade.toLowerCase();
    const filtered = deals.filter((d) => {
      const m = (d.meta ?? {}) as Record<string, unknown>;
      if (cidade) {
        const c = String(m["imovelCidade"] ?? m["cidade"] ?? "").toLowerCase();
        if (!c.includes(needle)) return false;
      }
      if (uf.length === 2) {
        const u = String(m["imovelUF"] ?? m["uf"] ?? "").toUpperCase();
        if (u !== uf) return false;
      }
      return true;
    });
    const ids = [...new Set(filtered.map((d) => d.contactId as string))];
    if (ids.length === 0) {
      return NextResponse.json({ items: [], total: 0, page, limit });
    }
    where.id = { in: ids };
    applyDealStageAndDossierFilters(where, workspaceId, [], hasDossier);
  } else {
    applyDealStageAndDossierFilters(where, workspaceId, stageIds, hasDossier);
  }

  if (createdFrom || createdTo) {
    where.createdAt = {};
    if (createdFrom) {
      where.createdAt.gte = new Date(createdFrom);
    }
    if (createdTo) {
      where.createdAt.lte = new Date(createdTo);
    }
  }

  const [total, rows] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        contactTags: {
          where: { workspaceId },
          include: { tag: true },
        },
        deals: {
          where: { workspaceId, closedAt: null },
          take: 1,
          orderBy: { updatedAt: "desc" },
          include: {
            propertyDossier: { select: { id: true, status: true, fieldScore: true } },
            stage: { select: { id: true, name: true, position: true } },
          },
        },
      },
    }),
  ]);

  const items = rows.map((c) => {
    const deal = c.deals[0] ?? null;
    const meta = (deal?.meta ?? {}) as Record<string, unknown>;
    const end =
      (meta["imovelEndereco"] as string) ??
      (meta["endereco"] as string) ??
      "";
    const short = end.length > 42 ? `${end.slice(0, 40)}…` : end || "—";
    const dStatus = deal?.propertyDossier?.status ?? null;
    const st = deal?.stage;
    return {
      id: c.id,
      name: c.name,
      phoneMasked: maskPhoneTail(c.phone),
      phone: c.phone,
      imovel: short,
      cidade: (meta["imovelCidade"] as string) ?? (meta["cidade"] as string) ?? "—",
      uf: (meta["imovelUF"] as string) ?? (meta["uf"] as string) ?? "—",
      tags: c.contactTags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        color: ct.tag.color,
      })),
      leadLifecycle: c.leadLifecycle,
      pipelineStage: st
        ? { id: st.id, name: st.name, position: st.position }
        : null,
      dossier: {
        bucket: dossierBucket(dStatus),
        status: dStatus,
        score: deal?.propertyDossier?.fieldScore
          ? Number(deal.propertyDossier.fieldScore)
          : null,
      },
      lastActivityAt: c.updatedAt.toISOString(),
    };
  });

  if (sp.get("format") === "csv") {
    const header = ["nome", "telefone", "cidade", "uf", "status", "etapa", "imovel"];
    const lines = items.map((i) =>
      [
        i.name,
        i.phone ?? "",
        i.cidade,
        i.uf,
        i.leadLifecycle,
        i.pipelineStage?.name ?? "",
        i.imovel.replaceAll(",", " "),
      ]
        .map((x) => `"${String(x).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${workspaceId.slice(0, 8)}.csv"`,
      },
    });
  }

  return NextResponse.json({ items, total, page, limit });
}
