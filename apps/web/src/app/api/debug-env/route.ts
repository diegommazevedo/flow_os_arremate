import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseAnon = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  return NextResponse.json({
    SUPABASE_URL:  supabaseUrl ?? "AUSENTE",
    SUPABASE_ANON: supabaseAnon
      ? supabaseAnon.slice(0, 20) + "..."
      : "AUSENTE",
    NODE_ENV: process.env["NODE_ENV"],
  });
}
