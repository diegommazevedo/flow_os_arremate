"use client";

import { useState } from "react";
import Link from "next/link";
import { TabBar } from "./TabBar";
import { PoolTab } from "./PoolTab";
import { AssignmentsTab } from "./AssignmentsTab";
import { QueueTab } from "./QueueTab";
import { MessagesTab } from "./MessagesTab";
import { AuditTab } from "./AuditTab";

const TABS = [
  { key: "pool", label: "Pool" },
  { key: "assignments", label: "Operações" },
  { key: "queue", label: "Fila" },
  { key: "messages", label: "Mensagens" },
  { key: "audit", label: "Auditoria" },
];

export function MotoboysDashboard() {
  const [active, setActive] = useState("pool");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Motoboys</h1>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Field Agents — dispatch, monitoramento e workflow</p>
        </div>
        <Link
          href="/motoboys/workflow"
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:opacity-80"
          style={{ borderColor: "var(--text-accent)", color: "var(--text-accent)" }}
        >
          Editar Workflow
        </Link>
      </div>

      {/* Tabs */}
      <TabBar tabs={TABS} active={active} onChange={setActive} />

      {/* Content */}
      <div className="min-h-[400px]">
        {active === "pool" && <PoolTab />}
        {active === "assignments" && <AssignmentsTab />}
        {active === "queue" && <QueueTab />}
        {active === "messages" && <MessagesTab />}
        {active === "audit" && <AuditTab />}
      </div>
    </div>
  );
}
