"use client";

import { useState, useRef, useCallback, type ReactNode, type DragEvent } from "react";

interface DropZoneProps {
  children: ReactNode;
  disabled?: boolean;
  onFilesDropped: (files: File[]) => void;
}

export function DropZone({ children, disabled, onFilesDropped }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const counterRef = useRef(0);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    counterRef.current += 1;
    setDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    counterRef.current -= 1;
    if (counterRef.current <= 0) {
      counterRef.current = 0;
      setDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    counterRef.current = 0;
    setDragging(false);
    if (disabled) return;
    const dt = e.dataTransfer;
    if (!dt?.files?.length) return;
    const files = Array.from(dt.files);
    onFilesDropped(files);
  }, [disabled, onFilesDropped]);

  return (
    <div
      className="relative flex-1 flex flex-col min-h-0"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
      {dragging && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 pointer-events-none animate-msg-fadein"
          style={{
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            className="rounded-xl px-8 py-6 text-center"
            style={{
              border: "2px dashed var(--text-accent)",
              background: "rgba(124,106,247,0.08)",
            }}
          >
            <p style={{ fontSize: "24px", marginBottom: "4px" }}>📎</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
              Solte o arquivo aqui
            </p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", marginTop: "4px" }}>
              Imagem, vídeo, PDF, documento
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
