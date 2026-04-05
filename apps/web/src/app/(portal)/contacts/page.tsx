"use client";

import { useState, useTransition } from "react";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Contact {
  id:     string;
  name:   string;
  email?: string | null;
  phone?: string | null;
  type:   "PERSON" | "COMPANY";
  deals?: number;
}

// ─── Dados iniciais ───────────────────────────────────────────────────────────

const SEED: Contact[] = [
  { id: "1", name: "João da Silva",          email: "joao@exemplo.com",        phone: "11999990000", type: "PERSON",  deals: 2 },
  { id: "2", name: "Maria Construtora Ltda", email: "contato@mariaconst.com.br",phone: "1133334444",  type: "COMPANY", deals: 1 },
  { id: "3", name: "Carlos Souza",           email: "carlos@exemplo.com",      phone: "11988887777", type: "PERSON",  deals: 3 },
];

// ─── Modal ───────────────────────────────────────────────────────────────────

function NewContactModal({
  onClose,
  onCreated,
}: {
  onClose:   () => void;
  onCreated: (c: Contact) => void;
}) {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [phone,   setPhone]   = useState("");
  const [type,    setType]    = useState<"PERSON" | "COMPANY">("PERSON");
  const [error,   setError]   = useState("");
  const [pending, start]      = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nome é obrigatório."); return; }
    setError("");

    start(async () => {
      const res = await fetch("/api/contacts/create", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: name.trim(), email, phone, type }),
      });

      if (res.ok) {
        const { contact } = await res.json() as { contact: Contact };
        onCreated({ ...contact, deals: 0 });
        onClose();
      } else {
        const { error: msg } = await res.json().catch(() => ({ error: "Erro ao criar contato." })) as { error: string };
        setError(msg);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-white font-semibold">Novo Contato</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {/* Tipo — toggle */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tipo</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {(["PERSON", "COMPANY"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 text-sm transition-colors ${
                    type === t
                      ? "bg-brand-600 text-white"
                      : "bg-gray-900 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {t === "PERSON" ? "Pessoa" : "Empresa"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Nome *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "PERSON" ? "Nome completo" : "Razão social"}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Telefone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-0000"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-sm text-white font-medium transition-colors disabled:opacity-50"
            >
              {pending ? "Salvando…" : "Criar Contato"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>(SEED);
  const [modal,    setModal]    = useState(false);

  function addContact(c: Contact) {
    setContacts((prev) => [c, ...prev]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Contatos</h1>
          <p className="text-sm text-gray-500 mt-1">{contacts.length} contatos</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary text-sm">
          + Novo Contato
        </button>
      </div>

      <div className="space-y-2">
        {contacts.map((c) => (
          <div key={c.id} className="card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-brand-800 flex items-center justify-center text-sm font-bold text-brand-300">
                {c.name.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-white">{c.name}</p>
                <p className="text-xs text-gray-500">
                  {c.email && <span>{c.email}</span>}
                  {c.email && c.phone && <span> · </span>}
                  {c.phone && <span>{c.phone}</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-600">{c.type === "PERSON" ? "Pessoa" : "Empresa"}</span>
              {c.deals != null && (
                <span className="text-xs text-brand-400">{c.deals} deal(s)</span>
              )}
              <button className="btn-secondary text-xs py-1 px-2">Ver</button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-700">
        [SEC-11] CPF/CNPJ armazenado criptografado · PII nunca aparece em logs
      </p>

      {modal && (
        <NewContactModal
          onClose={() => setModal(false)}
          onCreated={addContact}
        />
      )}
    </div>
  );
}
