export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { bootstrapWorkspaceContent } from "@/lib/workspace-bootstrap";

async function requireSuperAdmin() {
  const ctx = await getSessionContext();
  if (!ctx?.workspaceId || !ctx.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return ctx;
}

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const workspaces = await db.workspace.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      sector: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });

  return NextResponse.json({ workspaces });
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = String(body?.["name"] ?? "").trim();
  let slug = String(body?.["slug"] ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const templateRaw = String(body?.["template"] ?? "caixa");
  const template = templateRaw === "generic" ? "generic" : "caixa";
  const adminEmail = String(body?.["adminEmail"] ?? "")
    .trim()
    .toLowerCase();

  if (!name || !slug) {
    return NextResponse.json({ error: "name e slug são obrigatórios" }, { status: 400 });
  }

  const sector = template === "caixa" ? "real-estate" : "generic";

  const existing = await db.workspace.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug já em uso" }, { status: 409 });
  }

  const workspace = await db.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: { name, slug, sector, settings: {} },
    });
    await bootstrapWorkspaceContent(tx, ws.id, template === "caixa" ? "caixa" : "generic");
    return ws;
  });

  let ownerLinked = false;
  let ownerWarning: string | undefined;
  if (adminEmail) {
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !serviceKey) {
      ownerWarning = "SUPABASE_SERVICE_ROLE_KEY não configurada; owner não associado.";
    } else {
      const supabaseAdmin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      let ownerId: string | null = null;
      for (let page = 1; page <= 20 && !ownerId; page++) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error || !data?.users?.length) break;
        const u = data.users.find((x) => x.email?.toLowerCase() === adminEmail);
        if (u) ownerId = u.id;
        if (data.users.length < 200) break;
      }
      if (ownerId) {
        await db.member.create({
          data: { workspaceId: workspace.id, userId: ownerId, role: "OWNER" },
        });
        ownerLinked = true;
      } else {
        ownerWarning = "Email não encontrado no Supabase Auth.";
      }
    }
  }

  return NextResponse.json({
    workspace,
    ownerLinked,
    ownerWarning,
  });
}
