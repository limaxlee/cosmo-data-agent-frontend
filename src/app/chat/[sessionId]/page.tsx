import Chat from "@/components/Chat";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <main>
      <Chat initialSessionId={sessionId} />
    </main>
  );
}
