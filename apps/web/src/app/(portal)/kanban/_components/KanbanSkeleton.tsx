// Loading skeleton — sem 'use client' necessário

const COLS = 5;
const ROWS = 3; // Q1–Q3

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-2.5 space-y-2 animate-pulse">
      <div className="h-3 bg-gray-800 rounded w-3/4" />
      <div className="h-2 bg-gray-800 rounded w-1/2" />
      <div className="flex justify-between items-center">
        <div className="h-2.5 bg-gray-800 rounded w-1/3" />
        <div className="h-4 bg-gray-800 rounded-full w-12" />
      </div>
      <div className="flex justify-between items-center">
        <div className="flex gap-1">
          <div className="h-3.5 w-6 bg-gray-800 rounded" />
          <div className="h-3.5 w-6 bg-gray-800 rounded" />
        </div>
        <div className="h-6 w-6 bg-gray-800 rounded-full" />
      </div>
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5 animate-pulse">
          <div className="h-6 bg-gray-800 rounded w-48" />
          <div className="h-3.5 bg-gray-800 rounded w-72" />
        </div>
        <div className="flex gap-2 animate-pulse">
          <div className="h-8 bg-gray-800 rounded w-32" />
          <div className="h-8 bg-gray-800 rounded w-24" />
          <div className="h-8 bg-gray-800 rounded w-24" />
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex gap-2 animate-pulse">
        <div className="h-8 bg-gray-800 rounded w-36" />
        <div className="h-8 bg-gray-800 rounded w-36" />
        <div className="h-8 bg-gray-800 rounded w-36" />
      </div>

      {/* Board */}
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Column headers */}
          <div className="flex gap-2 mb-2 ml-36 animate-pulse">
            {Array.from({ length: COLS }).map((_, i) => (
              <div key={i} className="flex-1 h-8 bg-gray-800 rounded" />
            ))}
          </div>

          {/* Swimlane rows */}
          {Array.from({ length: ROWS }).map((_, si) => (
            <div key={si} className="flex gap-2 mb-2">
              {/* Swimlane header */}
              <div className="w-36 flex-shrink-0 rounded-lg border border-gray-800 bg-gray-900 p-2 animate-pulse">
                <div className="h-4 bg-gray-800 rounded w-8 mb-1" />
                <div className="h-3 bg-gray-800 rounded w-16" />
              </div>
              {/* Cells */}
              {Array.from({ length: COLS }).map((_, ci) => (
                <div
                  key={ci}
                  className="flex-1 min-h-[120px] rounded-lg border border-gray-800/50 bg-gray-900/30 p-1.5 space-y-1.5"
                >
                  {ci === 0 && <SkeletonCard />}
                  {ci === 1 && si === 0 && <SkeletonCard />}
                  {ci === 1 && si === 0 && <SkeletonCard />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
