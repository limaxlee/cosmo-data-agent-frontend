"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@/lib/user-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportUtils } from "@/lib/export-utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect, useCallback } from "react";
import { ChatSession, SessionStorage } from "@/lib/session-storage";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Trash2,
  Copy,
  Search,
  MessageSquare,
  MoreVertical,
  PanelLeft,
  Pencil,
} from "lucide-react";

interface SessionSidebarProps {
  currentSessionId: string | null;
  userId: string;
  onSessionSelect: (session: ChatSession | null) => void;
  onNewSession: () => void;
  className?: string;
}

export function SessionSidebar({
  currentSessionId,
  onSessionSelect,
  onNewSession,
  className = "",
}: SessionSidebarProps) {
  const { userId } = useUser();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const router = useRouter();

  const loadSessions = useCallback(async () => {
    if (!userId) return;

    try {
      setError(null);
      const remote = await SessionStorage.listSessions(userId);
      setSessions(remote);
    } catch (e) {
      console.error("Error loading sessions:", e);
      setError("Couldn't load chats");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()),
  );

  const handleSessionClick = (session: ChatSession) => {
    router.push(`/chat/${session.id}`);
    setIsMobileOpen(false);
  };

  const handleNewSession = () => {
    onNewSession();
    router.push("/new");
    setIsMobileOpen(false);
  };

  const handleDeleteSession = async (
    e: React.MouseEvent,
    sessionId: string,
  ) => {
    e.stopPropagation();
    if (!userId) return;
    if (!confirm("Are you sure you want to delete this session?")) return;

    try {
      await SessionStorage.deleteSession(userId, sessionId);

      const onThisSession =
        currentSessionId === sessionId ||
        (typeof window !== "undefined" &&
          window.location.pathname === `/chat/${sessionId}`);

      if (onThisSession) {
        onNewSession();
        router.push("/new");
      }
      await loadSessions();
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const handleExport = (
    e: React.MouseEvent,
    session: ChatSession,
    format: "json" | "markdown" | "text",
  ) => {
    e.stopPropagation();

    switch (format) {
      case "json":
        ExportUtils.exportToJSON(session);
        break;
      case "markdown":
        ExportUtils.exportToMarkdown(session);
        break;
      case "text":
        ExportUtils.exportToText(session);
        break;
    }
  };

  const handleCopy = async (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    try {
      await ExportUtils.copyToClipboard(session);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card/95 backdrop-blur-sm">
      {/* Header */}
      <div className={isCollapsed ? "px-2 pt-2 pb-1" : "px-2 pt-2 pb-4"}>
        <div
          className={`flex items-center ${
            isCollapsed ? "justify-center mb-1" : "justify-between mb-4"
          }`}
        >
          {!isCollapsed && (
            <h2 className="text-lg font-semibold text-foreground whitespace-nowrap">
              Data Agent
            </h2>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                   => setIsCollapsed(!isCollapsed)}
                  className="h-10 w-10 hover:bg-accent text-foreground"
                >
                  {isCollapsed ? (
                    <PanelLeft className="h-4 w-4" />
                  ) : (
                    <PanelLeft className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side={isCollapsed ? "right" : "bottom"}>
                <p>{isCollapsed ? "Open sidebar" : "Close sidebar"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {!isCollapsed && (
          <Button
            variant="ghost"
            
            className="w-full justify-start mb-2 hover:bg-accent text-foreground"
          >
            <Plus className="h-4 w-4 mr-2" />
            New chat
          </Button>
        )}

        {!isCollapsed &&
          (isSearchActive ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                autoFocus
                placeholder="Search chats"
                value={searchQuery}
                 => setSearchQuery(e.target.value)}
                onBlur={() => {
                  if (!searchQuery) setIsSearchActive(false);
                }}
                className="pl-9 border-0"
              />
            </div>
          ) : (
            <Button
              variant="ghost"
               => setIsSearchActive(true)}
              className="w-full justify-start hover:bg-accent text-foreground"
            >
              <Search className="h-4 w-4 mr-2" />
              Search chats
            </Button>
          ))}
      </div>

      {/* Sessions list */}
      <ScrollArea className="flex-1 [&>div>div]:!block [&>div>div]:!min-w-0">
        <div className="p-2">
          {isCollapsed ? (
            <div className="space-y-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      
                      className="w-10 h-10 -translate-y-0.5 hover:bg-accent text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>New Chat</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredSessions.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">
                    {searchQuery
                      ? "No conversations found"
                      : "No conversations yet"}
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Start a new chat to get going
                  </p>
                </div>
              ) : (
                <div className="mb-4">
                  <div className="px-2 py-1 mb-2">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Recents
                    </h3>
                  </div>

                  <div className="space-y-1">
                    {filteredSessions.map((session) => (
                      <div key={session.id} className="relative group">
                        <div
                          className={`
                            cursor-pointer rounded-lg p-2 transition-all duration-200
                            hover:bg-accent
                            ${
                              currentSessionId === session.id
                                ? "bg-primary/10 border border-primary/20"
                                : "hover:shadow-sm"
                            }
                            `}
                           => handleSessionClick(session)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium truncate leading-tight ${
                                  currentSessionId === session.id
                                    ? "text-primary"
                                    : "text-foreground"
                                }`}
                              >
                                {session.title}
                              </p>
                            </div>

                            <DropdownMenu
                               =>
                                setOpenMenuId(open ? session.id : null)
                              }
                            >
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={`h-6 w-6 transition-opacity text-foreground hover:bg-accent hover:text-foreground data-[state=open]:text-foreground ${
                                    openMenuId === session.id
                                      ? "opacity-100"
                                      : "opacity-0 group-hover:opacity-100"
                                  }`}
                                   => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-48 border-0 shadow-none bg-stone-100 dark:bg-zinc-800"
                              >
                                <DropdownMenuItem
                                   => handleCopy(e, session)}
                                  className="text-sm"
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy to Clipboard
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                   =>
                                    handleExport(e, session, "json")
                                  }
                                  className="text-sm"
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                   =>
                                    handleDeleteSession(e, session.id)
                                  }
                                  className="text-red-400 focus:text-red-400 text-sm"
                                >
                                  <Trash2 className="h-4 w-4 mr-2 text-red-400" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={`hidden md:block h-full ${className}`}>
        <div
          className={`h-full border-r border-border transition-all duration-300 ${
            isCollapsed ? "w-14" : "w-72"
          }`}
        >
          <div className="h-full relative">{SidebarContent()}</div>
        </div>
      </div>

      {/* Mobile Sidebar */}
      <div className="md:hidden">
        <Sheet open={isMobileOpen} >
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="fixed top-4 left-4 z-50 bg-card/80 backdrop-blur-sm"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            {SidebarContent()}
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
