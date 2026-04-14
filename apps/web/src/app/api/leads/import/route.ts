/**
 * POST /api/leads/import — CSV via FormData (colunas mapeadas em JSON).
 * [SEC-03] workspaceId · [SEC-08] sanitização · [SEC-06] LEAD_IMPORTED.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { ensureOpenDealForContact } from "@/lib/lead-deal";

interface ColumnMap {
  nome?: number;
  telefone?: number;
  endereco?: number;
  cidade?: number;
  uf?: number;
  tag?: number;
}

function parseCsvRows(raw: string): string[][] {
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (ch === '"') {
          q = !q;
        } else if (ch === "," && !q) {
          out.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      out.push(cur.trim());
      return out;
    })
    .filter((r) => r.some((c) => c.length > 0));
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId, userId } = session;

  const form = await req.formData();
  const file = form.get("file");
  const mapRaw = form.get("columnMap");
  const bulkTagName = (form.get("bulkTag") as string | null)?.trim() || "";

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file obrigatório" }, { status: 400 });
  }

  let columnMap: ColumnMap = {};
  try {
    columnMap = JSON.parse(String(mapRaw ?? "{}")) as ColumnMap;
  } catch {
    return NextResponse.json({ error: "columnMap JSON inválido" }, { status: 400 });
  }

  const raw = await file.text();
  const rows = parseCsvRows(raw);
  if (rows.length < 2) {
    return NextResponse.json({ error: "CSV vazio" }, { status: 400 });
  }

  const header = rows[0]!.map((h) => h.toLowerCase());
  const dataRows = rows.slice(1);

  const autoMap: ColumnMap = {};
  header.forEach((h, i) => {
    if (/^nome|^name/i.test(h)) autoMap.nome = i;
    if (/fone|tel|phone|cel/i.test(h)) autoMap.telefone = i;
    if (/end|imovel|imóvel|logradouro/i.test(h)) autoMap.endereco = i;
    if (/cidade|^city/i.test(h)) autoMap.cidade = i;
    if (/^uf$|^estado/i.test(h)) autoMap.uf = i;
    if (/tag|etiqueta/i.test(h)) autoMap.tag = i;
  });
  const map = { ...autoMap, ...columnMap };

  let imported = 0;
  let updated = 0;
  const errors: { line: number; reason: string }[] = [];

  let bulkTagId: string | null = null;
  if (bulkTagName) {
    const safeTag = defaultSanitizer.clean(bulkTagName).slice(0, 64);
    if (safeTag) {
      const t = await db.tag.upsert({
        where: { workspaceId_name: { workspaceId, name: safeTag } },
        create: { workspaceId, name: safeTag, color: "#6366f1" },
        update: {},
        select: { id: true },
      });
      bulkTagId = t.id;
    }
  }

  for (let r = 0; r < dataRows.length; r++) {
    const cols = dataRows[r]!;
    const line = r + 2;
    try {
      const nomeI = map.nome ?? 0;
      const telI = map.telefone ?? 1;
      const rawNome = cols[nomeI]?.trim() ?? "";
      const rawTel = cols[telI]?.trim() ?? "";
      const digits = rawTel.replace(/\D/g, "");
      if (!rawNome || digits.length < 10) {
        errors.push({ line, reason: "nome ou telefone inválido" });
        continue;
      }

      const safeName = defaultSanitizer.clean(rawNome).slice(0, 200);
      const safePhone = defaultSanitizer.clean(digits).slice(0, 20);
      const endereco = map.endereco != null ? defaultSanitizer.clean(cols[map.endereco] ?? "").slice(0, 500) : "";
      const cidade = map.cidade != null ? defaultSanitizer.clean(cols[map.cidade] ?? "").slice(0, 120) : "";
      const ufRaw = map.uf != null ? (cols[map.uf] ?? "").trim().toUpperCase() : "";
      const uf = ufRaw.length === 2 ? ufRaw : "";

      const existing = await db.contact.findFirst({
        where: { workspaceId, phone: safePhone },
        select: { id: true },
      });

      let contactId: string;
      if (existing) {
        contactId = existing.id;
        await db.contact.update({
          where: { id: contactId, workspaceId },
          data: { name: safeName },
        });
        updated++;
      } else {
        const c = await db.contact.create({
          data: {
            workspaceId,
            name: safeName,
            phone: safePhone,
            leadLifecycle: "PROSPECT",
          },
          select: { id: true },
        });
        contactId = c.id;
        imported++;
      }

      const meta: Record<string, unknown> = {};
      if (endereco) meta["imovelEndereco"] = endereco;
      if (cidade) meta["imovelCidade"] = cidade;
      if (uf) meta["imovelUF"] = uf;

      await ensureOpenDealForContact(workspaceId, contactId, meta, `Lead — ${safeName}`);

      if (bulkTagId) {
        await db.contactTag.upsert({
          where: {
            contactId_tagId: { contactId, tagId: bulkTagId },
          },
          create: {
            workspaceId,
            contactId,
            tagId: bulkTagId,
            addedBy: userId ?? "import",
          },
          update: {},
        });
      }

      if (map.tag != null) {
        const tagCell = (cols[map.tag] ?? "").trim();
        if (tagCell) {
          const tn = defaultSanitizer.clean(tagCell).slice(0, 64);
          const t = await db.tag.upsert({
            where: { workspaceId_name: { workspaceId, name: tn } },
            create: { workspaceId, name: tn, color: "#22c55e" },
            update: {},
            select: { id: true },
          });
          await db.contactTag.upsert({
            where: { contactId_tagId: { contactId, tagId: t.id } },
            create: {
              workspaceId,
              contactId,
              tagId: t.id,
              addedBy: userId ?? "import",
            },
            update: {},
          });
        }
      }
    } catch (e) {
      errors.push({
        line,
        reason: e instanceof Error ? e.message : "erro",
      });
    }
  }

  await appendAuditLog({
    workspaceId,
    action: "LEAD_IMPORTED",
    input: { rows: dataRows.length, bulkTag: bulkTagName || null },
    output: { imported, updated, errorCount: errors.length },
  }).catch(() => undefined);

  return NextResponse.json({ imported, updated, errors });
}
