"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface AudioRecorderProps {
  disabled?: boolean;
  onRecorded: (blob: Blob, durationSec: number) => void;
}

const MAX_DURATION_SEC = 600; // 10 min

export function AudioRecorder({ disabled, onRecorded }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [supported, setSupported] = useState(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/ogg; codecs=opus")
        ? "audio/ogg; codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm; codecs=opus")
          ? "audio/webm; codecs=opus"
          : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      let seconds = 0;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/ogg",
        });
        onRecorded(blob, seconds);
        chunksRef.current = [];
        setElapsed(0);
      };

      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        seconds += 1;
        setElapsed(seconds);
        if (seconds >= MAX_DURATION_SEC) {
          stop();
        }
      }, 1000);
    } catch {
      setSupported(false);
    }
  }, [onRecorded, stop]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!supported) return null;

  if (recording) {
    return (
      <button
        type="button"
        onClick={stop}
        className="shrink-0 flex items-center gap-1.5 rounded transition-all duration-150 active:scale-95"
        style={{
          height: "32px",
          padding: "0 10px",
          background: "var(--color-q1)",
          color: "#fff",
          border: "none",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 600,
        }}
        aria-label="Parar gravação"
      >
        <span
          className="animate-pulse"
          style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#fff", display: "inline-block" }}
        />
        {formatTime(elapsed)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { void start(); }}
      disabled={disabled}
      className="shrink-0 flex items-center justify-center rounded transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 hover:[background:var(--surface-hover)] active:scale-95"
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-overlay)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-subtle)",
        fontSize: "14px",
      }}
      title="Gravar áudio"
      aria-label="Gravar áudio"
    >
      🎙
    </button>
  );
}
