/**
 * Tipos do worker RPA — sem rpa-caixa.ts (Playwright) no grafo do barrel Next.js.
 */
import type { Worker as BullWorker } from "bullmq";
import type { PrismaClient } from "@flow-os/db";

export interface IssuerPortalRpaConfig {
  workspaceId: string;
  loginUrl:    string;
  user:        string;
  pass:        string;
  totpSecret:  string;
  dryRun:      boolean;
  fixturePath?: string;
}

export interface RpaRunStats {
  status:      "SUCCESS" | "FAILED" | "LAYOUT_CHANGED";
  rowsFound:   number;
  rowsNew:     number;
  rowsSkipped: number;
  rowsFailed:  number;
  duration:    number;
  domHash:     string | null;
  dryRun:      boolean;
  errors:      string[];
}

export interface RpaDeps {
  redisGet:    (key: string) => Promise<string | null>;
  redisSet:    (key: string, val: string) => Promise<void>;
  redisDel:    (key: string) => Promise<void>;
  enqueueJob:  (jobName: string, data: unknown) => Promise<void>;
  notifyOwner: (message: string) => Promise<void>;
  prisma?:     PrismaClient;
}

export interface IssuerPortalWorkerOptions {
  connection: ConstructorParameters<typeof BullWorker>[2] extends { connection: infer C } ? C : never;
  config:     Omit<IssuerPortalRpaConfig, "user" | "pass" | "totpSecret" | "loginUrl" | "dryRun">;
  deps:       RpaDeps;
}

export type RpaCaixaConfig = IssuerPortalRpaConfig;
export type RpaCaixaWorkerOptions = IssuerPortalWorkerOptions;
