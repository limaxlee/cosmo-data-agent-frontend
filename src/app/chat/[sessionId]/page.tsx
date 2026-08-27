import ChatView from "@/components/chat/chat-view";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <main>
      <ChatView initialSessionId={sessionId} />
    </main>
  );
}
