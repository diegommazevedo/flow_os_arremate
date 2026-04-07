/**
 * Helper de sessÃ£o servidor.
 * [SEC-03] workspaceId e userId vÃªm sempre da sessÃ£o autenticada.
 */

import "server-only";

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { db } from "@flow-os/db";

export interface SessionContext {
  workspaceId: string;
  userId: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "DEV";
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseAnon = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const devWorkspace = process.env["DEFAULT_WORKSPACE_ID"];

  if (!supabaseUrl || !supabaseAnon) {
    if (process.env["NODE_ENV"] === "development" && devWorkspace) {
      return { workspaceId: devWorkspace, userId: null, role: "DEV" };
    }
    return null;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  let member: { workspaceId: string; role: SessionContext["role"] } | null = null;
  try {
    member = await db.member.findFirst({
      where: { userId: user.id },
      select: { workspaceId: true, role: true },
    });
  } catch (err) {
    // Falhas do Prisma (engine, conexão, schema) não derrubam o render — mas precisamos de trilha no servidor.
    let requestId: string | undefined;
    try {
      requestId = (await headers()).get("x-flowos-request-id") ?? undefined;
    } catch {
      requestId = undefined;
    }
    console.error("[session] db.member.findFirst failed", { requestId, err });
    return null;
  }

  if (!member) return null;

  return {
    workspaceId: member.workspaceId,
    userId: user.id,
    role: member.role,
  };
}

export async function getSessionWorkspaceId(): Promise<string | null> {
  const context = await getSessionContext();
  return context?.workspaceId ?? null;
}
