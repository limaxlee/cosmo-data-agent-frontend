import type { Metadata } from "next";

import ChatView from "@/components/chat/chat-view";
import { NEW_CHAT_TITLE } from "@/lib/app-title";

export const metadata: Metadata = { title: NEW_CHAT_TITLE };

export default function NewChat() {
  return (
    <main>
      <ChatView />
    </main>
  );
}
