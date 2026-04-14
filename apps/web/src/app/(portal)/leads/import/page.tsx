"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type Step = 1 | 2 | 3;

function parseCsvRows(raw: string): string[][] {
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (ch === '"') q = !q;
        else if (ch === "," && !q) {
          out.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      out.push(cur.trim());
      return out;
    })
    .filter((r) => r.some((c) => c.length > 0));
}

const FIELDS = [
  { key: "nome", label: "Nome do contato" },
  { key: "telefone", label: "Telefone" },
  { key: "endereco", label: "Endereço / imóvel" },
  { key: "cidade", label: "Cidade" },
  { key: "uf", label: "UF" },
  { key: "tag", label: "Etiqueta (coluna)" },
  { key: "skip", label: "Ignorar coluna" },
] as const;

export default function LeadsImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<number, string>>({});
  const [bulkTag, setBulkTag] = useState("");
  const [result, setResult] = useState<{
    imported: number;
    updated: number;
    errors: { line: number; reason: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = useCallback(async (f: File | null) => {
    if (!f || !f.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setRaw("");
      setPreview([]);
      return;
    }
    setFile(f);
    const text = await f.text();
    setRaw(text);
    const rows = parseCsvRows(text);
    setPreview(rows.slice(0, 6));
    if (rows[0]) {
      setHeaders(rows[0]);
      const auto: Record<number, string> = {};
      rows[0].forEach((h, i) => {
        const l = h.toLowerCase();
        if (/nome|^name/i.test(l)) auto[i] = "nome";
        else if (/fone|tel|cel|phone/i.test(l)) auto[i] = "telefone";
        else if (/end|imovel|imóvel|logradouro/i.test(l)) auto[i] = "endereco";
        else if (/cidade|^city/i.test(l)) auto[i] = "cidade";
        else if (/^uf$|estado/i.test(l)) auto[i] = "uf";
        else if (/tag|etiqueta/i.test(l)) auto[i] = "tag";
        else auto[i] = "skip";
      });
      setColumnMap(auto);
    }
  }, []);

  const runImport = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const map: Record<string, number> = {};
      Object.entries(columnMap).forEach(([idx, key]) => {
        if (key === "skip") return;
        map[key] = Number(idx);
      });
      fd.append("columnMap", JSON.stringify(map));
      if (bulkTag.trim()) fd.append("bulkTag", bulkTag.trim());
      const r = await fetch("/api/leads/import", { method: "POST", body: fd });
      const d = (await r.json()) as {
        imported?: number;
        updated?: number;
        errors?: { line: number; reason: string }[];
        error?: string;
      };
      if (r.ok && d.imported != null) {
        setResult({
          imported: d.imported,
          updated: d.updated ?? 0,
          errors: d.errors ?? [],
        });
      } else {
        setResult({
          imported: 0,
          updated: 0,
          errors: [{ line: 0, reason: d.error ?? `HTTP ${r.status}` }],
        });
      }
    } finally {
      setBusy(false);
      setStep(3);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Importar leads (CSV)
        </h1>
        <Link href="/leads" className="text-sm" style={{ color: "var(--text-accent)" }}>
          Voltar
        </Link>
      </div>

      <div className="flex gap-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
        <span style={{ fontWeight: step === 1 ? 600 : 400 }}>1. Upload</span>
        <span>→</span>
        <span style={{ fontWeight: step === 2 ? 600 : 400 }}>2. Mapeamento</span>
        <span>→</span>
        <span style={{ fontWeight: step === 3 ? 600 : 400 }}>3. Resultado</span>
      </div>

      {step === 1 && (
        <div
          className="rounded-lg border border-dashed p-8 text-center"
          style={{ borderColor: "var(--border-default)" }}
        >
          <input
            type="file"
            accept=".csv"
            className="hidden"
            id="csv-up"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
          <label htmlFor="csv-up" className="cursor-pointer text-sm" style={{ color: "var(--text-accent)" }}>
            Clique ou arraste um arquivo .csv
          </label>
          {preview.length > 0 && (
            <div className="mt-4 overflow-x-auto text-left">
              <table className="w-full text-xs">
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {row.map((c, j) => (
                        <td key={j} className="border p-1" style={{ borderColor: "var(--border-subtle)" }}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            type="button"
            className="mt-4 rounded-lg px-4 py-2 text-sm text-white disabled:opacity-40"
            style={{ background: "var(--text-accent)" }}
            disabled={!file}
            onClick={() => setStep(2)}
          >
            Próximo
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Associe cada coluna do CSV a um campo do FlowOS.
          </p>
          <label className="block text-sm">
            Etiqueta para todos os leads desta importação (opcional)
            <input
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
              placeholder="ex.: lote-abril-2026"
            />
          </label>
          <div className="space-y-2">
            {headers.map((h, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-40 truncate font-mono text-xs" title={h}>
                  {h || `col ${i}`}
                </span>
                <select
                  value={columnMap[i] ?? "skip"}
                  onChange={(e) => setColumnMap((m) => ({ ...m, [i]: e.target.value }))}
                  className="rounded border px-2 py-1"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
                >
                  {FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--border-default)" }}
              onClick={() => setStep(1)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-white disabled:opacity-40"
              style={{ background: "var(--text-accent)" }}
              disabled={busy || !raw}
              onClick={() => void runImport()}
            >
              {busy ? "Importando…" : `Importar ${Math.max(0, parseCsvRows(raw).length - 1)} leads`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-green-600">✅ {result.imported} leads importados</p>
          <p className="text-amber-600">⚠️ {result.updated} atualizados (telefone existente)</p>
          <p className="text-red-600">❌ {result.errors.length} erros</p>
          {result.errors.length > 0 && (
            <ul className="max-h-40 list-inside list-disc overflow-y-auto text-xs">
              {result.errors.slice(0, 30).map((e, i) => (
                <li key={i}>
                  Linha {e.line}: {e.reason}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-2">
            <Link
              href="/leads"
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--border-default)" }}
            >
              Ver leads
            </Link>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm text-white"
              style={{ background: "var(--text-accent)" }}
              onClick={() => router.push("/campanhas?prefill=import")}
            >
              Criar campanha
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
