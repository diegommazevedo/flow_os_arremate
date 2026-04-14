import { redirect } from "next/navigation";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmailsPage() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) redirect("/login");

  const emails = await db.email.findMany({
    where: { workspaceId },
    orderBy: { receivedAt: "desc" },
    take: 100,
    select: {
      id: true,
      from: true,
      fromName: true,
      subject: true,
      lido: true,
      importante: true,
      enviado: true,
      receivedAt: true,
      eisenhower: true,
    },
  });

  const unreadCount = emails.filter((email) => !email.lido).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Caixa de Email</h1>
          <p className="mt-1 text-sm text-gray-400">
            {emails.length} mensagens • {unreadCount} não lidas
          </p>
        </div>
      </div>

      {emails.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 text-sm text-gray-400">
          Nenhum email encontrado neste workspace.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="min-w-full divide-y divide-gray-800 text-sm">
            <thead className="bg-gray-950/70">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Remetente</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Assunto</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Eisenhower</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Recebido em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900 bg-gray-950/30">
              {emails.map((email) => (
                <tr key={email.id} className="hover:bg-gray-900/60">
                  <td className="px-4 py-3 text-gray-300">
                    {!email.lido ? "Nao lido" : "Lido"}
                    {email.importante ? " • Importante" : ""}
                    {email.enviado ? " • Enviado" : ""}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    {email.fromName ? `${email.fromName} <${email.from}>` : email.from}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{email.subject}</td>
                  <td className="px-4 py-3 text-gray-400">{email.eisenhower ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(email.receivedAt).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
