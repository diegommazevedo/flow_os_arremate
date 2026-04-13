"use client";

interface UploadProgressProps {
  /** 0-100, or null when idle */
  percent: number | null;
  /** Error message, or null */
  error: string | null;
  onRetry?: (() => void) | undefined;
}

export function UploadProgress({ percent, error, onRetry }: UploadProgressProps) {
  if (percent === null && !error) return null;

  const isError = Boolean(error);
  const isDone = percent !== null && percent >= 100 && !isError;

  return (
    <div
      className="mb-2 rounded-md overflow-hidden transition-opacity duration-300"
      style={{
        background: "var(--surface-overlay)",
        border: `1px solid ${isError ? "var(--color-q1)" : "var(--border-subtle)"}`,
        opacity: isDone ? 0 : 1,
      }}
    >
      {/* Bar */}
      <div
        className="h-1 transition-all duration-300 ease-out"
        style={{
          width: `${Math.min(percent ?? 0, 100)}%`,
          background: isError ? "var(--color-q1)" : isDone ? "var(--color-success)" : "var(--text-accent)",
        }}
      />
      {/* Label */}
      <div className="flex items-center gap-2 px-2 py-1" style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}>
        {isError ? (
          <>
            <span style={{ color: "var(--color-q1)" }}>{error}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="ml-auto shrink-0 rounded px-1.5 py-0.5 transition-colors hover:[background:var(--surface-hover)]"
                style={{ color: "var(--text-accent)", border: "1px solid var(--border-subtle)" }}
              >
                Tentar novamente
              </button>
            )}
          </>
        ) : (
          <span style={{ color: "var(--text-tertiary)" }}>
            {isDone ? "Enviado" : `Enviando… ${Math.round(percent ?? 0)}%`}
          </span>
        )}
      </div>
    </div>
  );
}
