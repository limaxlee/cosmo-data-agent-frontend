"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  Clock,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PanelLeft,
  Shield,
  Users,
} from "lucide-react";

import diceIcon from "@/app/dice_icon.png";
import { countWaiting } from "@/lib/admin-api";
import { APP_TITLE } from "@/lib/app-title";
import { readCollapsed, writeCollapsed } from "@/lib/sidebar-collapsed";
import { useUser } from "@/providers/user-provider";
import { DataAgentWordmark } from "@/components/data-agent-wordmark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { WaitingCount } from "./parts";
import { useAdminQuery } from "./use-admin-query";

const VIEWS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Accounts", icon: Users },
  { href: "/admin/access-log", label: "Access log", icon: Clock },
  { href: "/admin/sessions", label: "Sessions", icon: MessageSquare },
  { href: "/admin/admins", label: "Admins", icon: Shield },
];

// The overview is /admin itself. Every other view also covers what is below
// it: /admin/users/gildong.hong belongs to "Accounts".
function isCurrent(pathname: string, href: string): boolean {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

// Below this width the chat turns its sidebar into a sheet. Here it stays in
// place as the narrow strip of icons, so that the tables keep the room.
const NARROW = "(max-width: 767px)";

function watchNarrow(onChange: () => void) {
  const query = window.matchMedia(NARROW);

  query.addEventListener("change", onChange);

  return () => query.removeEventListener("change", onChange);
}

const NOTHING = {};

/**
 * The admin area's sidebar. Built to match the chat's session sidebar: the
 * same two widths, the same top with the icon and the wordmark, the same
 * account row at the bottom, and one shared "collapsed" setting, so that going
 * from the chat to the admin area and back does not move anything.
 */
export function AdminSidebar() {
  const { userId, logout } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);

  const narrow = useSyncExternalStore(
    watchNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );

  // The number of waiting people, visible from every admin view.
  const waiting = useAdminQuery(countWaiting, NOTHING).data ?? 0;

  const collapsed = isCollapsed || narrow;
  const userInitial = (userId ?? "").trim().charAt(0).toUpperCase();

  const toggleCollapsed = () => {
    const next = !isCollapsed;

    writeCollapsed(next);
    setIsCollapsed(next);
  };

  return (
    <div className="h-full shrink-0">
      <div
        className={`h-full border-r border-sidebar-border transition-all duration-300 ${
          collapsed ? "w-14" : "w-72"
        }`}
      >
        <div className="flex h-full flex-col bg-card/95 backdrop-blur-sm">
          {/* Header */}
          <div className={collapsed ? "px-2 pt-2 pb-1" : "px-2 pt-2 pb-4"}>
            <div
              className={`flex items-center ${
                collapsed ? "justify-center mb-1" : "justify-between mb-4"
              }`}
            >
              {!collapsed && (
                /* In the chat the wordmark starts a new chat. Here it leads
                   to the same place. Same classes as there, so the mark does
                   not move by a pixel between the two. */
                <Link
                  href="/chat/new"
                  aria-label={`${APP_TITLE}, back to the chat`}
                  className="-ml-1 flex items-center gap-0 rounded-md px-1 py-1 transition-colors hover:bg-accent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-[hsl(220_23%_97%)] dark:hover:bg-[hsl(216_22%_85%)]"
                >
                  <Image
                    src={diceIcon}
                    alt=""
                    className="h-12 w-auto shrink-0"
                    priority
                  />
                  <DataAgentWordmark className="-ml-2 h-5 w-auto shrink-0 text-heading-foreground dark:text-[hsl(218_14%_8%)]" />
                </Link>
              )}

              {/* In a narrow window the strip cannot be opened, so there is
                  nothing to toggle. The empty box keeps the icons below at
                  the height they have in the chat. */}
              {narrow ? (
                <span className="h-10 w-10" />
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleCollapsed}
                      className="h-10 w-10 hover:bg-accent text-foreground"
                    >
                      <PanelLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side={collapsed ? "right" : "bottom"}>
                    <p>{collapsed ? "Open sidebar" : "Close sidebar"}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* The visible way back to the chat, where the chat has "New". */}
            {!collapsed && (
              <Button
                asChild
                variant="ghost"
                className="w-full justify-start hover:bg-accent text-muted-foreground"
              >
                <Link href="/chat/new">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to chat
                </Link>
              </Button>
            )}
          </div>

          {/* The views. min-h-0 so a short window scrolls them rather than
              pushing the account row off the bottom. */}
          <nav
            aria-label="Admin views"
            className="flex-1 min-h-0 overflow-y-auto p-2"
          >
            {collapsed ? (
              <div className="space-y-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="w-10 h-10 -translate-y-0.5 hover:bg-accent text-foreground"
                    >
                      <Link href="/chat/new" aria-label="Back to chat">
                        <ArrowLeft className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Back to chat</p>
                  </TooltipContent>
                </Tooltip>

                {VIEWS.map((view) => {
                  const current = isCurrent(pathname, view.href);
                  const marked = view.href === "/admin" && waiting > 0;

                  return (
                    <Tooltip key={view.href}>
                      <TooltipTrigger asChild>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className={`relative w-10 h-10 hover:bg-accent text-foreground ${
                            current ? "bg-selected" : ""
                          }`}
                        >
                          <Link
                            href={view.href}
                            aria-label={view.label}
                            aria-current={current ? "page" : undefined}
                          >
                            <view.icon className="h-4 w-4" />
                            {marked && (
                              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500">
                                <span className="sr-only">
                                  {waiting} waiting for approval
                                </span>
                              </span>
                            )}
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>
                          {view.label}
                          {marked ? `: ${waiting} waiting` : ""}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1">
                {VIEWS.map((view) => {
                  const current = isCurrent(pathname, view.href);

                  return (
                    <Link
                      key={view.href}
                      href={view.href}
                      aria-current={current ? "page" : undefined}
                      className={`flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-accent outline-none focus-visible:bg-accent ${
                        current
                          ? "bg-selected text-selected-foreground font-semibold"
                          : "text-muted-foreground font-medium"
                      }`}
                    >
                      <view.icon className="h-4 w-4 mr-2 shrink-0" />
                      <span className="flex-1 truncate">{view.label}</span>
                      {view.href === "/admin" && waiting > 0 && (
                        <WaitingCount count={waiting} />
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </nav>

          {/* Account. The same row as in the chat's sidebar: the avatar in its
              own 40px slot, the login ID beside it, and a menu on top. */}
          <div className="border-t border-sidebar-border px-2 py-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  title={userId ?? undefined}
                  className="w-full h-10 gap-0 px-0 justify-start rounded-lg overflow-hidden hover:bg-accent focus-visible:ring-0 focus-visible:border-0 focus-visible:bg-accent"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-input text-sm font-semibold text-foreground">
                      {userInitial}
                    </span>
                  </span>
                  {!collapsed && (
                    <span className="ml-3 truncate pr-3 text-sm font-medium text-muted-foreground">
                      {userId}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-[17rem] border-0 shadow-none bg-input dark:bg-zinc-800"
              >
                <DropdownMenuItem
                  onClick={() => router.push("/chat/new")}
                  className="text-sm text-muted-foreground"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Chat
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="text-sm text-muted-foreground"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
