import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";
import { fetchEisenhowerDeals } from "@/app/(portal)/eisenhower/_lib/eisenhower-queries";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deals = await fetchEisenhowerDeals(session.workspaceId);
  return NextResponse.json({ deals });
}
