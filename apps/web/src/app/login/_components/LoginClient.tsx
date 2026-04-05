"use client";

import { useState, FormEvent } from "react";

interface Props {
  next:           string;
  hasSupabase:    boolean;
  callbackError?: string;
}

type Mode = "magic" | "password";

export default function LoginClient({ next, hasSupabase, callbackError }: Props) {
  const [mode,    setMode]    = useState<Mode>("magic");
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [status,  setStatus]  = useState<"idle" | "loading" | "sent" | "error">(
    callbackError ? "error" : "idle",
  );
  const [message, setMessage] = useState(
    callbackError ? `Erro ao autenticar: ${decodeURIComponent(callbackError)}` : "",
  );

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const supabaseUrl  = process.env["NEXT_PUBLIC_SUPABASE_URL"]  ?? "";
      const supabaseAnon = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "";
      const { createBrowserClient } = await import("@supabase/ssr");
      const sb = createBrowserClient(supabaseUrl, supabaseAnon);
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: {
          // /auth/callback troca o code por cookies de sessão, depois redireciona para `next`
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setStatus("sent");
      setMessage(`Link enviado para ${email}. Verifique sua caixa de entrada.`);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Erro ao enviar link");
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    if (!email || !pass) return;
    setStatus("loading");
    try {
      const supabaseUrl  = process.env["NEXT_PUBLIC_SUPABASE_URL"]  ?? "";
      const supabaseAnon = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "";
      const { createBrowserClient } = await import("@supabase/ssr");
      const sb = createBrowserClient(supabaseUrl, supabaseAnon);
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      window.location.href = next;
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Credenciais inválidas");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white text-2xl font-bold mb-4">
            F
          </div>
          <h1 className="text-2xl font-bold text-white">FlowOS</h1>
          <p className="text-sm text-gray-500 mt-1">Acesso restrito à equipe</p>
        </div>

        {/* Aviso sem Supabase — decidido no servidor, sem divergência de hydration */}
        {!hasSupabase && (
          <div className="mb-4 p-4 rounded-xl bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 text-sm text-center">
            <p className="font-semibold mb-1">Modo desenvolvimento</p>
            <p className="text-xs text-yellow-400/80">
              Supabase não configurado. Defina{" "}
              <code className="bg-black/30 px-1 rounded">DEFAULT_WORKSPACE_ID</code>{" "}
              no <code className="bg-black/30 px-1 rounded">.env.local</code> para acesso direto.
            </p>
          </div>
        )}

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">
          {/* Toggle de modo */}
          <div className="flex rounded-lg overflow-hidden border border-gray-800 mb-6 text-sm">
            <button
              onClick={() => setMode("magic")}
              className={`flex-1 py-2 transition-colors font-medium
                ${mode === "magic" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              Magic link
            </button>
            <button
              onClick={() => setMode("password")}
              className={`flex-1 py-2 transition-colors font-medium
                ${mode === "password" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              Senha
            </button>
          </div>

          {status === "sent" ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">📬</div>
              <p className="text-green-400 font-semibold text-sm">Link enviado!</p>
              <p className="text-gray-400 text-xs mt-1">{message}</p>
              <button
                onClick={() => setStatus("idle")}
                className="mt-4 text-xs text-gray-500 underline hover:text-gray-300"
              >
                Enviar novamente
              </button>
            </div>
          ) : (
            <form
              onSubmit={mode === "magic" ? handleMagicLink : handlePassword}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  required
                  disabled={!hasSupabase}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200
                    focus:outline-none focus:border-indigo-500 placeholder:text-gray-600
                    disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {mode === "password" && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium">
                    Senha
                  </label>
                  <input
                    type="password"
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={!hasSupabase}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200
                      focus:outline-none focus:border-indigo-500 placeholder:text-gray-600
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              )}

              {status === "error" && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "loading" || !hasSupabase}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold
                  disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {status === "loading"
                  ? "Aguarde…"
                  : mode === "magic"
                    ? "Enviar magic link"
                    : "Entrar"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          FlowOS v4 · Acesso autorizado apenas para membros da equipe
        </p>
      </div>
    </div>
  );
}
