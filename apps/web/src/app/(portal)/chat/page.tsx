/**
 * /chat â€” Chat Omnichannel (Server Component)
 * [SEC-03] AutenticaÃ§Ã£o via Supabase SSR ou bypass dev
 */

export const dynamic    = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { getSessionWorkspaceId } from "@/lib/session";
import { getConversations } from "./_lib/chat-queries";
import { ChatClient } from "./_components/ChatClient";

export default async function ChatPage() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) redirect("/login");

  const conversations = await getConversations(workspaceId);

  // -m-6 cancela o p-6 do portal layout â€” chat precisa ser edge-to-edge
  return (
    <div className="-m-6 h-[calc(100vh-56px)] overflow-hidden">
      <ChatClient
        initial={conversations}
        workspaceId={workspaceId}
      />
    </div>
  );
}
