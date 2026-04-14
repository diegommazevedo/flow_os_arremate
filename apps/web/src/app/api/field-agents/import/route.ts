/**
 * POST /api/field-agents/import
 *
 * Upload CSV de motoboys/field agents e faz upsert no banco.
 * [SEC-03] workspaceId da sessão autenticada.
 * [SEC-08] nome/telefone sanitizados antes de gravar.
 * [SEC-06] AuditLog: FIELD_AGENT_IMPORTED.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

interface CsvLine {
  nome: string;
  telefone: string;
  cidade: string;
  estado: string;
  valorVisita: string;
}

interface ImportError {
  line: number;
  reason: string;
}

function parseCsvLines(raw: string): { lines: CsvLine[]; errors: ImportError[] } {
  const rows = raw.split(/\r?\n/).filter((r) => r.trim().length > 0);
  if (rows.length === 0) return { lines: [], errors: [] };

  // Skip header
  const header = rows[0]!.toLowerCase();
  const startIdx = header.includes("nome") ? 1 : 0;

  const lines: CsvLine[] = [];
  const errors: ImportError[] = [];

  for (let i = startIdx; i < rows.length; i++) {
    const cols = rows[i]!.split(",").map((c) => c.trim());
    if (cols.length < 5) {
      errors.push({ line: i + 1, reason: "colunas insuficientes (esperado: 5)" });
      continue;
    }

    const [nome, telefone, cidade, estado, valorVisita] = cols;
    if (!nome || !telefone || !cidade || !estado || !valorVisita) {
      errors.push({ line: i + 1, reason: "campo obrigatório vazio" });
      continue;
    }

    // Validar telefone — apenas dígitos, 10-13 chars
    const phoneDigits = telefone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      errors.push({ line: i + 1, reason: "telefone inválido" });
      continue;
    }

    // Validar UF
    const uf = estado.toUpperCase().trim();
    if (uf.length !== 2) {
      errors.push({ line: i + 1, reason: "estado inválido (esperado: UF com 2 letras)" });
      continue;
    }

    // Validar valor
    const valor = parseFloat(valorVisita.replace(",", "."));
    if (isNaN(valor) || valor <= 0) {
      errors.push({ line: i + 1, reason: "valor_visita inválido" });
      continue;
    }

    lines.push({
      nome: nome.trim(),
      telefone: phoneDigits,
      cidade: cidade.trim(),
      estado: uf,
      valorVisita: valor.toFixed(2),
    });
  }

  return { lines, errors };
}

export async function POST(request: NextRequest) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = session;

  let csvText: string;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Arquivo CSV obrigatório" }, { status: 400 });
    }
    csvText = await file.text();
  } else {
    csvText = await request.text();
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: "CSV vazio" }, { status: 400 });
  }

  const { lines, errors } = parseCsvLines(csvText);

  let imported = 0;
  let updated = 0;
  const skipped = errors.length;

  for (const line of lines) {
    try {
      // [SEC-08] sanitizar nome e telefone
      const safeName = defaultSanitizer.clean(line.nome);
      const safePhone = defaultSanitizer.clean(line.telefone);
      const safeCity = defaultSanitizer.clean(line.cidade);

      // Upsert Partner (dedup por workspaceId + phone)
      const existing = await db.partner.findUnique({
        where: { workspaceId_phone: { workspaceId, phone: safePhone } },
      });

      let partnerId: string;

      if (existing) {
        await db.partner.update({
          where: { id: existing.id },
          data: {
            name: safeName,
            type: "FIELD_AGENT",
            isActive: true,
          },
        });
        partnerId = existing.id;
        updated++;
      } else {
        const partner = await db.partner.create({
          data: {
            workspaceId,
            name: safeName,
            phone: safePhone,
            type: "FIELD_AGENT",
            isActive: true,
          },
        });
        partnerId = partner.id;
        imported++;
      }

      // Upsert FieldAgentProfile
      await db.fieldAgentProfile.upsert({
        where: { partnerId },
        update: {
          cities: { set: [safeCity] },
          states: { set: [line.estado] },
          pricePerVisit: parseFloat(line.valorVisita),
          availability: "AVAILABLE",
        },
        create: {
          workspaceId,
          partnerId,
          cities: [safeCity],
          states: [line.estado],
          pricePerVisit: parseFloat(line.valorVisita),
          currency: "BRL",
          availability: "AVAILABLE",
        },
      });
    } catch (err) {
      errors.push({
        line: lines.indexOf(line) + 1,
        reason: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  }

  // [SEC-06] AuditLog
  await appendAuditLog({
    workspaceId,
    action: "FIELD_AGENT_IMPORTED",
    input: { totalLines: lines.length, csvLength: csvText.length },
    output: { imported, updated, skipped, errorCount: errors.length },
  }).catch(() => undefined);

  return NextResponse.json({ imported, updated, skipped, errors });
}
