"use client";

import { Message } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { useUser } from "@/providers/user-provider";
import { Send, Paperclip, X, LoaderCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { MessageItem } from "@/components/chat/message-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionSidebar } from "@/components/chat/session-sidebar";
import { useFollowReveal } from "@/components/chat/use-follow-reveal";
import { SessionStorage } from "@/lib/session-api";
import { readDraft, writeDraft } from "@/lib/draft-storage";
import { NEW_CHAT_TITLE, documentTitle } from "@/lib/app-title";
import { ERROR_REPLY } from "@/lib/error-reply";

interface SuggestedQuestion {
  title: string;
  question: string;
  icon: string;
}
// A session opened while its last turn is still the user's is one whose reply
// is on its way -- the request was sent from another page of this tab, or
// from another tab. The view waits for it the way it waits after a send, and
// asks the backend again at this interval until the reply is there.
const REPLY_POLL_INTERVAL_MS = 3000;

// How long a turn is waited on before it is given up as one that will never be
// answered -- a run that died without leaving an error event behind. Also the
// age past which a session is opened as finished rather than waited on.
const REPLY_WAIT_LIMIT_MS = 10 * 60 * 1000;

// While a reply is pending the user is waiting, not idle. The login is kept
// alive at this interval until the reply lands.
const PENDING_REPLY_KEEP_ALIVE_MS = 60 * 1000;

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".bmp",
  ".png",
  ".tiff",
  ".tif",
] as const;

const isAllowedFile = (file: File) => {
  const name = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
};

// The box grows with its content up to 15 rows, then scrolls. Used while
// typing and again when a saved draft is put back.
const fitToText = (el: HTMLTextAreaElement | null) => {
  if (!el) return;

  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 15 * 24)}px`;
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export default function ChatView({
  initialSessionId,
}: {
  initialSessionId?: string;
}) {
  const { userId, keepAlive } = useUser();

  const [input, setInput] = useState(() => readDraft(initialSessionId ?? ""));
  const [maxLength, setMaxLength] = useState(1000);
  const [isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isBackendError, setIsBackendError] = useState(false);

  // Index of the one message allowed to type itself out: the reply that just
  // came back. Null everywhere else, so history read back from a session
  // renders instantly the way it always has.
  const [revealIndex, setRevealIndex] = useState<number | null>(null);

  // The session whose reply is being polled for, once it was opened with the
  // user's turn still unanswered. Null when nothing is being waited on.
  const [awaitingSessionId, setAwaitingSessionId] = useState<string | null>(
    null,
  );
  const [currentSessionTitle, setCurrentSessionTitle] = useState(
    initialSessionId ? "" : NEW_CHAT_TITLE,
  );

  const [suggestedQuestions, setSuggestedQuestions] = useState<
    SuggestedQuestion[]
  >([]);

  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");

  const shouldPinRef = useRef(false);
  const justLoadedRef = useRef(false);
  const ownSessionRef = useRef<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const pinnedMessageRef = useRef<HTMLDivElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const revealingMessageRef = useRef<HTMLDivElement>(null);

  // Follows the reply as it types itself out, but only once it is long enough
  // to run past the bottom of the pane -- and only until the reader scrolls up.
  useFollowReveal(scrollAreaRef, revealingMessageRef, revealIndex !== null);

  // Which chat the box belongs to right now. Empty until the first message
  // creates a session -- what the draft store files under "new".
  const draftSessionId = sessionId || initialSessionId || "";

  // Every change to the box goes through here, so the saved draft never
  // drifts from what is on screen.
  const applyInput = (value: string) => {
    setInput(value);
    writeDraft(draftSessionId, value);
  };

  // Leaves the caret after the last character of whatever was just put in
  // the box, once React has painted it, so typing carries straight on.
  const focusInputEnd = () => {
    requestAnimationFrame(() => {
      const el = inputRef.current;

      if (!el) return;

      fitToText(el);

      if (!el.value) return;

      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  // Puts a stored draft back on screen. No write: the text is already what
  // storage holds for that chat.
  const restoreDraft = (text: string) => {
    setInput(text);
    focusInputEnd();
  };

  useEffect(() => {
    if (!userId) return;

    if (initialSessionId) {
      if (ownSessionRef.current === initialSessionId) return;

      loadSessionFromBackend(initialSessionId);
    }
  }, [initialSessionId, userId]);

  useEffect(() => {
    const maxLengthValue = parseInt(
      process.env.NEXT_PUBLIC_MAX_INPUT_LENGTH || "100000",
      10,
    );

    setMaxLength(maxLengthValue);

    const fetchSuggestedQuestions = async () => {
      try {
        const response = await fetch("/suggested-questions.json");
        const data = await response.json();

        setSuggestedQuestions(data);
      } catch (error) {
        console.error("Error fetching suggested questions:", error);
      }
    };

    fetchSuggestedQuestions();
  }, []);

  useEffect(() => {
    if (!shouldPinRef.current) return;

    const id = requestAnimationFrame(() => {
      pinnedMessageRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });

      shouldPinRef.current = false;
    });

    return () => cancelAnimationFrame(id);
  }, [messages]);

  useEffect(() => {
    if (!justLoadedRef.current) return;

    const id = requestAnimationFrame(() => {
      endOfMessagesRef.current?.scrollIntoView({
        block: "end",
      });

      justLoadedRef.current = false;
    });

    return () => cancelAnimationFrame(id);
  }, [messages]);

  useEffect(() => {
    if (!sidebarOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [sidebarOpen]);

  useEffect(() => {
    if (!fileError) return;

    const timer = setTimeout(() => setFileError(""), 5000);

    return () => clearTimeout(timer);
  }, [fileError]);

  // A draft restored on page load has to look like the user just finished
  // typing it, not like text dropped into a collapsed box.
  useEffect(() => {
    focusInputEnd();
  }, []);

  // The tab follows the open chat: "New Chat - Data Agent" on /chat/new and
  // "<session title> - Data Agent" on a session. Route metadata cannot cover
  // the session case -- the title is fetched in the browser.
  useEffect(() => {
    document.title = documentTitle(currentSessionTitle);
  }, [currentSessionTitle]);

  // Leaves the waiting state entered by loadSessionFromBackend, if any. A send
  // in flight from this instance is not touched -- that keeps its own flag.
  const stopAwaitingReply = () => {
    if (!awaitingSessionId) return;

    setAwaitingSessionId(null);
    setIsSending(false);
  };

  // Polls the backend while a session is waited on. The poll touches no state
  // until the reply is there, so nothing on screen moves between polls; then
  // the reply lands exactly as it does after a send.
  useEffect(() => {
    if (!awaitingSessionId || !userId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const startedAt = Date.now();

    const tick = async () => {
      try {
        const session = await SessionStorage.getSession(
          userId,
          awaitingSessionId,
        );

        if (cancelled) return;

        const last = session.messages[session.messages.length - 1];

        if (last && last.role !== "user") {
          // The reply is here in full; the reveal only decides how it lands.
          setRevealIndex(session.messages.length - 1);
          setMessages(session.messages);
          setAwaitingSessionId(null);
          setIsSending(false);

          return;
        }
      } catch (e) {
        console.error("Error polling session:", e);
      }

      if (cancelled) return;

      if (Date.now() - startedAt >= REPLY_WAIT_LIMIT_MS) {
        setAwaitingSessionId(null);
        setIsSending(false);

        return;
      }

      timer = setTimeout(tick, REPLY_POLL_INTERVAL_MS);
    };

    timer = setTimeout(tick, REPLY_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [awaitingSessionId, userId]);

  // A pending reply counts as activity for the idle logout.
  useEffect(() => {
    if (!isSending) return;
    keepAlive();
    const timer = setInterval(keepAlive, PENDING_REPLY_KEEP_ALIVE_MS);
    return () => clearInterval(timer);
  }, [isSending, keepAlive]);

  if (!userId) return null;

  const loadSessionFromBackend = async (id: string) => {
    try {
      const session = await SessionStorage.getSession(userId, id);

      setSessionId(session.id);

      justLoadedRef.current = true;

      setRevealIndex(null);
      setMessages(session.messages);
      setCurrentSessionTitle(session.title);
      setSidebarOpen(false);

      // A user turn with nothing after it is still being answered, unless it is
      // so old that no answer is coming. Waiting looks the same as after a
      // send: spinner, "Thinking...", and the box held until the reply lands.
      const last = session.messages[session.messages.length - 1];

      const unanswered =
        last?.role === "user" &&
        (!last.timestamp ||
          Date.now() - last.timestamp.getTime() < REPLY_WAIT_LIMIT_MS);

      setAwaitingSessionId(unanswered ? session.id : null);
      setIsSending(unanswered);

      // Opening another chat from the sidebar keeps this component mounted,
      // so the box has to be swapped over to that chat's draft by hand.
      restoreDraft(readDraft(session.id));
    } catch (e) {
      console.error("Error loading session:", e);
      setIsBackendError(true);
    }
  };

  const startNewChat = () => {
    ownSessionRef.current = null;

    stopAwaitingReply();

    setSessionId("");
    setRevealIndex(null);
    setMessages([]);
    restoreDraft(readDraft(""));
    setAttachedFile(null);
    setFileError("");
    setCurrentSessionTitle(NEW_CHAT_TITLE);
    setSidebarOpen(false);

    window.history.replaceState(null, "", "/chat/new");

    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return;

    if (!isAllowedFile(file)) {
      setFileError(
        `Unsupported file type. Allowed: ${IMAGE_EXTENSIONS.join(", ")}`,
      );

      return;
    }

    setAttachedFile(file);
    setFileError("");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);

    e.target.value = "";
  };

  const removeFile = () => {
    setAttachedFile(null);
    setFileError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();

    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();

    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    setIsDragging(false);

    acceptFile(e.dataTransfer.files?.[0]);
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || !userId || isSending) {
      return;
    }

    const currentInput = input;

    const currentFile = attachedFile;

    applyInput("");
    setAttachedFile(null);
    setFileError("");

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    setIsSending(true);

    let activeSessionId = sessionId || initialSessionId || "";
    let isNewSession = false;

    if (!activeSessionId) {
      try {
        activeSessionId = await SessionStorage.createSession(userId);

        isNewSession = true;

        ownSessionRef.current = activeSessionId;

        setSessionId(activeSessionId);

        window.history.replaceState(null, "", `/chat/${activeSessionId}`);
      } catch (error) {
        console.error("Error creating session:", error);

        setIsBackendError(true);
        setIsSending(false);

        return;
      }
    }

    const userMessage: Message = {
      role: "user",
      content: currentInput,
      timestamp: new Date(),

      image: currentFile ? await fileToDataUrl(currentFile) : undefined,
    };

    const historyWithUserMessage = [...messages, userMessage];

    shouldPinRef.current = true;

    // Whatever was typing itself out before this send is finished with.
    setRevealIndex(null);
    setMessages(historyWithUserMessage);

    try {
      const form = new FormData();

      form.append("userId", userId);
      form.append("sessionId", activeSessionId);
      form.append("message", currentInput);

      if (isNewSession) {
        form.append("newSession", "true");
      }

      form.append(
        "messages",
        JSON.stringify(
          historyWithUserMessage.map(({ image, artifact, ...rest }) => rest),
        ),
      );

      if (currentFile) {
        form.append("file", currentFile);
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      };

      const updatedMessages = [...historyWithUserMessage, assistantMessage];

      // The reply is here in full; the reveal only decides how it lands.
      setRevealIndex(historyWithUserMessage.length);
      setMessages(updatedMessages);
    } catch (error) {
      console.error("Error sending message:", error);

      const errorMessage: Message = {
        role: "assistant",
        content: ERROR_REPLY,
        timestamp: new Date(),
      };

      setMessages([...historyWithUserMessage, errorMessage]);
    } finally {
      setIsSending(false);

      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      handleSend();
    }
  };

  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <SessionSidebar
        currentSessionId={sessionId || initialSessionId || null}
        userId={userId}
        onSessionSelect={async (session) =>
          session && (await loadSessionFromBackend(session.id))
        }
        onNewSession={startNewChat}
        onCurrentSessionTitleChange={setCurrentSessionTitle}
        className={`${sidebarOpen ? "block" : "hidden"} md:block`}
      />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {isBackendError && (
          <div className="bg-red-500 text-white p-2 text-center">
            <p>
              Could not connect to the ADK backend. Please make sure it is
              running.
            </p>
          </div>
        )}

        {/* Header */}
        <header className="bg-card/80 backdrop-blur-sm px-4 py-1 flex items-center justify-end ">
          <ThemeToggle />
        </header>

        {/* Messages area */}
        {/* This pane runs from the header down to the composer, so centering
            inside it puts the empty state midway between the top and the
            textarea -- not the window. Radix wraps children in an auto-height
            display:table div, which is what the >div>div reaches: without it
            no h-full below ever resolves. */}
        <ScrollArea
          className={`flex-1 min-h-0 p-4 ${
            messages.length === 0 ? "[&>div>div]:!h-full" : ""
          }`}
          ref={scrollAreaRef}
        >
          <div
            className={`max-w-4xl mx-auto ${
              messages.length === 0 ? "h-full" : "space-y-2"
            }`}
          >
            {messages.length === 0 ? (
              /* min-h-full, not h-full: on a short window the box may grow
                 past the pane and scroll instead of clipping the heading. */
              <div className="flex flex-col items-center justify-center min-h-full text-center space-y-6">
                <h2 className="text-5xl font-normal text-heading-foreground">
                  무엇을 도와드릴까요?
                </h2>

                <div className="flex w-full max-w-2xl flex-col gap-2">
                  {suggestedQuestions.map((sq, index) => (
                    <Card
                      key={index}
                      className="group flex-row items-center gap-3 px-4 py-3 hover:bg-accent cursor-pointer transition-colors border-tile-border shadow-none"
                      onClick={() => {
                        applyInput(sq.question);
                        focusInputEnd();
                      }}
                    >
                      <span className="flex-none text-lg font-medium">
                        {sq.title}
                      </span>

                      <p className="min-w-0 flex-1 truncate text-left text-base text-muted-foreground">
                        {sq.question}
                      </p>

                      <ChevronRight className="h-4 w-4 flex-none text-muted-foreground opacity-50 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={index}
                    ref={
                      index === lastUserIndex
                        ? pinnedMessageRef
                        : index === revealIndex
                          ? revealingMessageRef
                          : undefined
                    }
                    style={
                      index === lastUserIndex
                        ? {
                            scrollMarginTop: "0.5rem",
                          }
                        : undefined
                    }
                  >
                    <MessageItem
                      message={message}
                      isLast={index === messages.length - 1}
                      reveal={index === revealIndex}
                    />
                  </div>
                ))}

                {isSending && (
                  <div className="flex items-start space-x-3">
                    <div className="flex-1 max-w-[80%]">
                      <Card className="p-4 shadow-sm bg-transparent border-0 shadow-none">
                        <div className="flex items-center space-x-2">
                          <LoaderCircle
                            className="w-4 h-4 text-muted-foreground animate-spin"
                            aria-hidden
                          />

                          <span className="text-sm text-muted-foreground">
                            Thinking...
                          </span>
                        </div>
                      </Card>
                    </div>
                  </div>
                )}

                {/* Sentinel: scroll target when opening an existing session.
                    Sits under the spinner so a session opened mid-reply
                    scrolls to the "Thinking..." line, not just above it. */}
                <div ref={endOfMessagesRef} aria-hidden />

                {/* Spacer so the pinned question can reach the top */}
                <div
                  aria-hidden
                  style={{
                    minHeight: "60vh",
                  }}
                />
              </>
            )}
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="bg-background p-4">
          <div className="max-w-4xl mx-auto">
            {/* Hidden native file input (single file, image types only) */}
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_EXTENSIONS.join(",")}
              className="hidden"
              onChange={handleFileSelect}
            />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`rounded-2xl bg-input dark:bg-zinc-800 p-2 transition-shadow focus-within:shadow-md ${
                isDragging ? "ring-2 ring-ring/40 dark:ring-zinc-500" : ""
              }`}
            >
              {/* Top: typing area */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  applyInput(e.target.value);

                  fitToText(e.target);
                }}
                onKeyPress={handleKeyPress}
                placeholder={
                  isDragging
                    ? "Drop your image here..."
                    : "Type your message..."
                }
                disabled={isSending}
                rows={2}
                className="w-full resize-none overflow-y-auto bg-transparent px-2 pt-1 text-base text-foreground outline-none placeholder:text-muted-foreground max-h-[360px]"
              />

              {/* Bottom: button row */}
              <div className="flex items-center justify-between">
                {/* Left: attach button OR attached-file chip */}
                {attachedFile ? (
                  <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background dark:bg-zinc-900 pl-3 pr-1.5 py-1 max-w-[220px]">
                    <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />

                    <span className="truncate text-sm text-foreground">
                      {attachedFile.name}
                    </span>

                    <button
                      type="button"
                      onClick={removeFile}
                      aria-label="Remove file"
                      className="shrink-0 rounded-full p-0.5 hover:bg-accent transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <div className="group relative">
                    <Button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSending}
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Paperclip className="w-4 h-4" />

                      <span className="sr-only">Add file</span>
                    </Button>

                    {/* Tooltip shown on hover and on focus */}
                    <span className="pointer-events-none absolute left-1/2 -top-9 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      Add file
                    </span>
                  </div>
                )}

                {/* Right: send button */}
                <Button
                  onClick={handleSend}
                  disabled={isSending || (!input.trim() && !attachedFile)}
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />

                  <span className="sr-only">Send message</span>
                </Button>
              </div>
            </div>

            {fileError && (
              <div className="mt-2 text-center text-xs text-red-500">
                {fileError}
              </div>
            )}

            <div className="flex items-center justify-center mt-2 text-xs text-muted-foreground">
              <span>
                {isSending
                  ? "Sending..."
                  : "Press Enter to send, Shift+Enter for new line"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
