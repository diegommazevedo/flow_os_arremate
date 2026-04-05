/**
 * PortalSkeleton — Loading states para todas as seções do portal.
 * Anime com pulse para indicar carregamento sem texto genérico "carregando...".
 */

type Variant = "stepper" | "next-step" | "list" | "chat";

interface Props {
  variant?: Variant;
  rows?:    number;
}

export function PortalSkeleton({ variant = "list", rows = 3 }: Props) {
  switch (variant) {
    case "stepper":     return <StepperSkeleton />;
    case "next-step":   return <NextStepSkeleton />;
    case "chat":        return <ChatSkeleton />;
    case "list":
    default:            return <ListSkeleton rows={rows} />;
  }
}

// ─── Variantes ────────────────────────────────────────────────────────────────

function StepperSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex justify-between mb-3">
          <div>
            <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
            <div className="h-5 w-40 bg-gray-200 rounded" />
          </div>
          <div className="h-7 w-28 bg-gray-200 rounded-xl" />
        </div>
        <div className="h-2 bg-gray-100 rounded-full mt-3">
          <div className="h-2 w-1/3 bg-gray-200 rounded-full" />
        </div>
      </div>
      <div className="flex gap-4 px-4 py-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center flex-shrink-0 w-[72px]">
            <div className="w-11 h-11 rounded-2xl bg-gray-200" />
            <div className="h-3 w-14 bg-gray-200 rounded mt-2" />
            <div className="h-2.5 w-10 bg-gray-100 rounded mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

function NextStepSkeleton() {
  return (
    <div className="rounded-2xl border-2 border-gray-200 overflow-hidden animate-pulse">
      <div className="h-9 bg-gray-200" />
      <div className="px-4 py-4">
        <div className="h-6 w-2/3 bg-gray-200 rounded mb-3" />
        <div className="h-4 bg-gray-100 rounded mb-2" />
        <div className="h-4 w-4/5 bg-gray-100 rounded" />
      </div>
      <div className="px-4 py-2 border-t border-gray-100">
        <div className="h-3 w-3/4 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="h-4 w-1/3 bg-gray-200 rounded" />
      </div>
      <ul className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="px-4 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
            <div className="w-16 h-9 bg-gray-200 rounded-xl flex-shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="h-4 w-1/2 bg-gray-200 rounded" />
      </div>
      <div className="p-4 space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="flex items-center gap-3 border border-gray-100 rounded-xl p-4">
            <div className="w-10 h-10 rounded-xl bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
