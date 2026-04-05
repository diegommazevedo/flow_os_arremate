/**
 * Tipos públicos do agente de relatório — sem executar relatorio-imovel.ts
 * (evita que o webpack do Next.js resolva Playwright ao analisar o barrel).
 */
import type { Worker as BullWorker } from "bullmq";
import type { ReportAnalise } from "./relatorio-report-schema";
import type { AuditWriter, VectorSearchClient } from "../token-router";
import type { PrismaClient } from "@flow-os/db";

export interface RelatorioPayload {
  dealId:      string;
  workspaceId: string;
}

export interface OrgConfig {
  portalColor?: string;
  orgName?:     string;
  logoUrl?:     string;
}

export interface RelatorioDeps {
  callClaude:      (system: string, user: string) => Promise<string>;
  callFallback:    (system: string, user: string) => Promise<string>;
  vectorSearch:    VectorSearchClient;
  uploadBuffer:    (key: string, buf: Buffer, contentType: string) => Promise<void>;
  getPresignedUrl: (key: string, expiresInSeconds: number) => Promise<string>;
  sendWhatsApp:    (phone: string, pdfUrl: string) => Promise<void>;
  auditWriter:     AuditWriter;
  prisma?:         PrismaClient;
  htmlToPdf?:      (html: string) => Promise<Buffer>;
}

export interface RelatorioResult {
  documentId: string;
  pdfUrl:     string;
  report:     ReportAnalise;
}

export interface RelatorioWorkerOptions {
  connection: ConstructorParameters<typeof BullWorker>[2] extends { connection: infer C } ? C : never;
  deps:       RelatorioDeps;
}

export interface MinioStorageDepsConfig {
  endpoint:  string;
  bucket:    string;
  accessKey: string;
  secretKey: string;
  region?:   string;
}
