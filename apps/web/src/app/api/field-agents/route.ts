/**
 * GET /api/field-agents — pool de motoboys (FieldAgentProfile + Partner).
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import type { AgentAvailability, Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const cidade = (sp.get("cidade") ?? "").trim();
  const uf = (sp.get("uf") ?? "").trim().toUpperCase();
  const availability = sp.get("availability") as AgentAvailability | null;
  const minRating = Number(sp.get("minRating") ?? "");

  const where: Prisma.FieldAgentProfileWhereInput = { workspaceId };
  if (cidade) {
    where.cities = { has: cidade };
  }
  if (uf.length === 2) {
    where.states = { has: uf };
  }
  if (availability && ["AVAILABLE", "BUSY", "INACTIVE"].includes(availability)) {
    where.availability = availability;
  }
  if (!Number.isNaN(minRating) && minRating > 0) {
    where.avgRating = { gte: minRating };
  }

  const rows = await db.fieldAgentProfile.findMany({
    where,
    orderBy: [{ avgRating: { sort: "desc", nulls: "last" } }, { pricePerVisit: "asc" }],
    take: 200,
    include: {
      partner: { select: { id: true, name: true, phone: true, isActive: true } },
    },
  });

  const items = rows.map((r) => ({
    id: r.id,
    partnerId: r.partnerId,
    name: r.partner.name,
    phone: r.partner.phone,
    cities: r.cities,
    states: r.states,
    pricePerVisit: Number(r.pricePerVisit),
    avgRating: r.avgRating ? Number(r.avgRating) : null,
    totalJobs: r.totalJobs,
    availability: r.availability,
    notes: r.notes,
    isActive: r.partner.isActive,
  }));

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    phone?: string;
    cities?: string[];
    states?: string[];
    pricePerVisit?: number;
    notes?: string;
    availability?: AgentAvailability;
  } | null;

  const name = defaultSanitizer.clean(body?.name ?? "").slice(0, 120);
  const phoneDigits = (body?.phone ?? "").replace(/\D/g, "");
  const cities = (body?.cities ?? []).map((c) => defaultSanitizer.clean(c).slice(0, 80)).filter(Boolean);
  const states = (body?.states ?? [])
    .map((s) => s.toUpperCase().slice(0, 2))
    .filter((s) => s.length === 2);
  const price = Number(body?.pricePerVisit);
  const notes = body?.notes ? defaultSanitizer.clean(body.notes).slice(0, 2000) : null;
  const availability = body?.availability ?? "AVAILABLE";

  if (!name || phoneDigits.length < 10 || Number.isNaN(price) || price <= 0 || states.length === 0) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const partner = await db.partner.create({
    data: {
      workspaceId,
      name,
      phone: phoneDigits,
      type: "FIELD_AGENT",
      isActive: true,
    },
    select: { id: true },
  });

  const profile = await db.fieldAgentProfile.create({
    data: {
      workspaceId,
      partnerId: partner.id,
      cities,
      states,
      pricePerVisit: price,
      availability,
      notes,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: profile.id, partnerId: partner.id });
}
