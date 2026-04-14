import { Suspense } from "react";
import { LeadProfileClient } from "./_components/LeadProfileClient";

export const metadata = { title: "Lead" };

export default function LeadDetailPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--text-tertiary)" }}>Carregando…</p>}>
      <LeadProfileClient />
    </Suspense>
  );
}
