import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* Logo + tagline */}
      <div className="text-center max-w-3xl">
        <div className="inline-flex items-center gap-2 bg-brand-950 border border-brand-800 rounded-full px-4 py-1.5 text-sm text-brand-400 mb-8">
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          FlowOS v4 — O Linux dos Negócios
        </div>

        <h1 className="text-5xl font-bold tracking-tight text-white mb-4">
          Núcleo imutável.{" "}
          <span className="text-brand-400">Templates infinitos.</span>
        </h1>

        <p className="text-lg text-gray-400 mb-10 max-w-xl mx-auto">
          Um sistema operacional para o seu negócio. Kanban, Eisenhower, Fluxos,
          Brain IA e segurança empresarial — prontos para imobiliária, clínica,
          advocacia, construtora ou hotelaria.
        </p>

        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/dashboard" className="btn-primary text-base px-6 py-3">
            Acessar Dashboard →
          </Link>
          <Link href="/docs" className="btn-secondary text-base px-6 py-3">
            Ver Manifesto
          </Link>
        </div>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 max-w-4xl w-full">
        {FEATURES.map((f) => (
          <div key={f.title} className="card flex flex-col gap-2">
            <span className="text-2xl">{f.icon}</span>
            <h3 className="font-semibold text-sm text-white">{f.title}</h3>
            <p className="text-xs text-gray-500">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Security badges */}
      <div className="flex flex-wrap gap-2 mt-10 justify-center">
        {["SEC-01 Isolamento", "SEC-05 Validação Zod", "SEC-06 Audit Log", "SEC-07 Budget IA"].map((s) => (
          <span key={s} className="badge bg-green-900/30 text-green-400 border border-green-800">
            ✓ {s}
          </span>
        ))}
      </div>

      <p className="text-xs text-gray-600 mt-8">
        FlowOS v4 · Monorepo · Next.js 15 · Prisma · Supabase · OpenAI
      </p>
    </main>
  );
}

const FEATURES = [
  { icon: "🗂️", title: "Kanban Multi-setor", desc: "Pipeline configurável por template. Stages, WIP limits, SLA." },
  { icon: "⚡", title: "Eisenhower Engine", desc: "Q1→Q4 automático por prazo. Nunca perca uma tarefa crítica." },
  { icon: "⚙️", title: "Flow Engine", desc: "Automações sem código. Trigger → Condição → Ação." },
  { icon: "🧠", title: "Brain IA -98%", desc: "Cascata de custo: GPT → fine-tune → modelo local em 12 meses." },
  { icon: "🏗️", title: "5 Templates", desc: "Imobiliária, clínica, advocacia, construtora, hotelaria." },
  { icon: "🔒", title: "12 Invariantes", desc: "SEC-01 a SEC-12. Segurança estrutural, não opcional." },
  { icon: "🌐", title: "Multi-tenant", desc: "RLS Supabase. Isolamento absoluto de dados por workspace." },
  { icon: "📦", title: "Deal.meta:Json", desc: "Troca de setor sem migration. O schema nunca muda." },
];
