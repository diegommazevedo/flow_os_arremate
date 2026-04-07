import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    SUPABASE_URL:  process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "AUSENTE",
    SUPABASE_ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 20) + "..."
      : "AUSENTE",
    NODE_ENV: process.env.NODE_ENV,
  });
}
