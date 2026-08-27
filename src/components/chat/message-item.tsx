"use client";

import remarkGfm from "remark-gfm";
import ReactMarkdown from "react-markdown";

import { useEffect, useState } from "react";
import { Message } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Copy, RefreshCw } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageItemProps {
  message: Message;
  isLast: boolean;
  onRegenerate?: () => void;
}

function dataUrlToObjectUrl(src?: string): string | null {
  if (!src) return null;
  const commaIdx = src.indexOf(",");
  if (commaIdx === -1) return null;

  const mime = src.slice(0, commaIdx).match(/data:([^;]+)/)?.[1] ?? "image/png";

  let payload = src.slice(commaIdx + 1).replace(/\s/g, "");
  payload = payload.replace(/-/g, "+").replace(/_/g, "/");
  while (payload.length % 4 !== 0) payload += "=";

  const invalid = payload.replace(/[A-Za-z0-9+/=]/g, "");
  if (invalid.length) {
    console.error(
      "Attached image base64 contains invalid characters:",
      JSON.stringify(invalid.slice(0, 20)),
      "| count:",
      invalid.length,
    );
    return null;
  }

  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch (e) {
    console.error("Attached image failed to decode (atob):", e);
    return null;
  }
}

export function MessageItem({
  message,
  isLast,
  onRegenerate,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleCopy = async () => {
    try {
      const content = message.content || "";
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const formatContent = (content: string) => {
    if (!content || typeof content !== "string") {
      return "";
    }
    return content;
  };

  const isUser = message.role === "user";

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = dataUrlToObjectUrl(message.image);
    setObjectUrl(url);
    setImgError(url === null && !!message.image);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [message.image]);

  const messageDate = message.timestamp ?? new Date();
  const now = new Date();
  const isSameDay =
    messageDate.getFullYear() === now.getFullYear() &&
    messageDate.getMonth() === now.getMonth() &&
    messageDate.getDate() === now.getDate();

  const timestamp = isSameDay
    ? messageDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : messageDate.toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className="flex items-start gap-4 group w-full">
      {/* Message content */}
      <div className={`relative ${isUser ? "max-w-[80%] ml-auto" : "w-full"}`}>
        {/* Message bubble - sent has fill/bubble, reply is plain */}
        <Card
          className={`relative transition-all duration-200 rounded-lg p-0 ${
            isUser
              ? "bg-input dark:bg-zinc-950 text-foreground dark:text-white border-0 hover:shadow-md"
              : "bg-transparent border-0 shadow-none text-card-foreground"
          }`}
        >
          <div className="relative px-4 py-2">
            <div
              className={`text-base max-w-none ${
                isUser
                  ? "text-foreground dark:text-white"
                  : "text-card-foreground"
              }`}
            >
              {isUser ? (
                <div className="space-y-2">
                  {formatContent(message.content) && (
                    <p className="whitespace-pre-wrap break-words leading-relaxed text-base">
                      {formatContent(message.content)}
                    </p>
                  )}
                  {message.image &&
                    (imgError || !objectUrl ? (
                      <div className="rounded-md border border-border/40 px-3 py-2 text-xs text-muted-foreground">
                        Preview unavailable
                      </div>
                    ) : (
                      <img
                        src={objectUrl}
                        alt="Attached image"
                        onError={() => setImgError(true)}
                        className="max-h-80 max-w-full w-auto rounded-lg border border-border/40 object-contain"
                      />
                    ))}
                </div>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => (
                      <p className="leading-7 mb-4 last:mb-0">{children}</p>
                    ),
                    h1: ({ children }) => (
                      <h1 className="text-2xl font-semibold mt-6 mb-3 first:mt-0">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-xl font-semibold mt-6 mb-3 first:mt-0">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-lg font-semibold mt-5 mb-2 first:mt-0">
                        {children}
                      </h3>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-6 mb-4 space-y-2 marker:text-muted-foreground">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal pl-6 mb-4 space-y-2 marker:text-muted-foreground">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="leading-7 pl-1">{children}</li>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-border pl-4 italic text-muted-foreground my-4">
                        {children}
                      </blockquote>
                    ),
                    a: ({ children, href }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        {children}
                      </a>
                    ),
                    code: ({ className, children, ...props }) => {
                      const isBlock = /language-(\w+)/.test(className || "");
                      return isBlock ? (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      ) : (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => (
                      <pre className="bg-muted rounded-lg p-4 overflow-x-auto my-4 text-sm">
                        {children}
                      </pre>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4">
                        <table className="w-full border-collapse text-sm">
                          {children}
                        </table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="border border-border px-3 py-2 text-left font-semibold">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="border border-border px-3 py-2">
                        {children}
                      </td>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold">{children}</strong>
                    ),
                    hr: () => <hr className="my-6 border-border" />,
                  }}
                >
                  {formatContent(message.content)}
                </ReactMarkdown>
              )}
            </div>
          </div>
        </Card>

        {/* Action row - timestamp + buttons, appear on hover */}
        <div
          className={`flex items-center gap-1.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${
            isUser ? "justify-end" : "justify-start"
          }`}
        >
          {/* Sent: timestamp comes before the copy button */}
          {isUser && (
            <span className="text-xs text-muted-foreground">{timestamp}</span>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-black dark:text-white" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{copied ? "Copied!" : "Copy"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {!isUser && isLast && onRegenerate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={onRegenerate}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Regenerate response</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Reply: timestamp comes after the copy button */}
          {!isUser && (
            <span className="text-xs text-muted-foreground">{timestamp}</span>
          )}
        </div>
      </div>
    </div>
  );
}
