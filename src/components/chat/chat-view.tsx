"use client";

import { Message } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { useUser } from "@/providers/user-provider";
import { Send, Sparkles, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { MessageItem } from "@/components/chat/message-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionSidebar } from "@/components/chat/session-sidebar";
import { SessionStorage } from "@/lib/session-api";
import * as LucideIcons from "lucide-react";

interface SuggestedQuestion {
  title: string;
  question: string;
  icon: string;
}

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

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const getIcon = (name: string) => {
  const Icon = (
    LucideIcons as unknown as {
      [key: string]: React.ElementType;
    }
  )[name];

  if (Icon) {
    return <Icon className="w-4 h-4 text-black dark:text-white" />;
  }

  return null;
};

export default function ChatView({
  initialSessionId,
}: {
  initialSessionId?: string;
}) {
  const { userId } = useUser();

  const [input, setInput] = useState("");
  const [maxLength, setMaxLength] = useState(1000);
  const [isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isBackendError, setIsBackendError] = useState(false);
  const [currentSessionTitle, setCurrentSessionTitle] = useState("New Chat");

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

  if (!userId) return null;

  const loadSessionFromBackend = async (id: string) => {
    try {
      const session = await SessionStorage.getSession(userId, id);

      setSessionId(session.id);

      justLoadedRef.current = true;

      setMessages(session.messages);
      setCurrentSessionTitle(session.title);
      setSidebarOpen(false);
    } catch (e) {
      console.error("Error loading session:", e);
      setIsBackendError(true);
    }
  };

  const startNewChat = () => {
    ownSessionRef.current = null;

    setSessionId("");
    setMessages([]);
    setInput("");
    setAttachedFile(null);
    setFileError("");
    setCurrentSessionTitle("New Chat");
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

    setInput("");
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
          historyWithUserMessage.map(({ image, ...rest }) => rest),
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

      setMessages(updatedMessages);
    } catch (error) {
      console.error("Error sending message:", error);

      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
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
        <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollAreaRef}>
          <div className="max-w-3xl mx-auto space-y-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center space-y-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">
                    Welcome to Data Agent
                  </h2>

                  <p className="text-muted-foreground max-w-md">
                    Start a conversation by typing a message below.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                  {suggestedQuestions.map((sq, index) => (
                    <Card
                      key={index}
                      className="p-4 hover:bg-accent cursor-pointer transition-colors border-border/40"
                      onClick={() => setInput(sq.question)}
                    >
                      <div className="flex items-center space-x-2">
                        {getIcon(sq.icon)}

                        <span className="text-base font-medium">
                          {sq.title}
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground mt-1 text-left">
                        {sq.question}
                      </p>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={index}
                    ref={index === lastUserIndex ? pinnedMessageRef : undefined}
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
                    />
                  </div>
                ))}

                {/* Sentinel: scroll target when opening an existing session */}
                <div ref={endOfMessagesRef} aria-hidden />

                {isSending && (
                  <div className="flex items-start space-x-3">
                    <div className="flex-1 max-w-[80%]">
                      <Card className="p-4 shadow-sm bg-transparent border-0 shadow-none">
                        <div className="flex items-center space-x-2">
                          <div className="flex space-x-1">
                            <div
                              className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                              style={{
                                animationDelay: "0ms",
                              }}
                            />

                            <div
                              className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                              style={{
                                animationDelay: "150ms",
                              }}
                            />

                            <div
                              className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                              style={{
                                animationDelay: "300ms",
                              }}
                            />
                          </div>

                          <span className="text-sm text-muted-foreground">
                            Thinking...
                          </span>
                        </div>
                      </Card>
                    </div>
                  </div>
                )}

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
          <div className="max-w-3xl mx-auto">
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
                  setInput(e.target.value);

                  const el = e.target;

                  el.style.height = "auto";

                  el.style.height = `${Math.min(el.scrollHeight, 15 * 24)}px`;
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
                  size="icon"
                  className="h-9 w-9 bg-gradient-to-br from-slate-500 to-slate-600 hover:from-slate-400 hover:to-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
