import type { Metadata } from "next";

import ChatView from "@/components/chat/chat-view";
import { NEW_CHAT_TITLE } from "@/lib/app-title";

// Rendered on the server, so the tab reads "New Chat - Data Agent" before any
// JS runs. Sessions cannot do this -- their title comes from a client fetch.
export const metadata: Metadata = { title: NEW_CHAT_TITLE };

export default function NewChat() {
  return (
    <main>
      <ChatView />
    </main>
  );
}
