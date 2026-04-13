/**
 * Server session helpers.
 * [SEC-03] workspaceId and userId must always come from an authenticated session.
 */

import "server-only";

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { db } from "@flow-os/db";
import type { MemberRole } from "@flow-os/db";

export interface SessionContext {
  workspaceId: string;
  userId: string | null;
  role: MemberRole | "DEV";
}

async function resolveMemberSession(userId: string): Promise<SessionContext | null> {
  let member: { workspaceId: string; role: MemberRole } | null = null;
  try {
    member = await db.member.findFirst({
      where: { userId },
      select: { workspaceId: true, role: true },
    });
  } catch (err) {
    // Keep server alive, but log trace details.
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
    userId,
    role: member.role,
  };
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return resolveMemberSession(user.id);
}

export async function getSessionContextFromBearer(
  authorizationHeader?: string | null,
): Promise<SessionContext | null> {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseAnon = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (!supabaseUrl || !supabaseAnon) return null;
  if (!authorizationHeader) return null;

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: { getAll: () => [], setAll: () => {} },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) return null;

  return resolveMemberSession(user.id);
}

export async function getSessionWorkspaceId(): Promise<string | null> {
  const context = await getSessionContext();
  return context?.workspaceId ?? null;
}
