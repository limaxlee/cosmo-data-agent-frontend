"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { onAdminRevoked } from "@/lib/admin-api";
import { useUser } from "@/providers/user-provider";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

import { AdminContext } from "./admin-context";
import { AdminSidebar } from "./admin-sidebar";

// A centred message with the way back to the chat, like UserGate's screens.
function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{text}</p>
        <Button asChild className="w-full">
          <Link href="/chat/new">Back to the chat</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Everything under /admin sits inside this: the check, the sidebar, and what
 * the views share.
 *
 * The check only hides. `isAdmin` is the backend's answer from the page load,
 * and the code of this area can be downloaded by anyone who can open the app,
 * which is fine because it holds no data. What protects the data is the
 * backend, which looks the caller up in its list of admins on every request.
 *
 * UserGate, further up, has already made sure the person is logged in and
 * approved, and renders nothing of this on the server, so reading `isAdmin`
 * here cannot differ between the server and the browser.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useUser();
  const [version, setVersion] = useState(0);
  // The admin right can be taken away while this area is open. The next
  // request is then refused with `admin_required`, whatever view sent it.
  const [revoked, setRevoked] = useState(false);

  useEffect(() => onAdminRevoked(() => setRevoked(true)), []);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  const value = useMemo(() => ({ version, refresh }), [version, refresh]);

  // No redirect, and no request: a person who is not an admin gets this
  // screen and nothing else.
  if (!isAdmin) {
    return (
      <Message
        title="This area is for administrators"
        text="Your account does not have the administrator right."
      />
    );
  }

  if (revoked) {
    return (
      <Message
        title="You are no longer an administrator"
        text="Your administrator right was taken away while this area was open."
      />
    );
  }

  return (
    <AdminContext.Provider value={value}>
      <div className="flex h-screen overflow-hidden bg-background">
        <AdminSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </AdminContext.Provider>
  );
}

/**
 * One admin view: the header with its title and the theme switch, and the
 * area below it, which scrolls when the window is too short.
 */
export function AdminPage({
  title,
  back,
  children,
}: {
  title: string;
  // A link shown before the title, for a view that sits below another.
  back?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="flex items-center gap-2 bg-card/80 px-4 py-1 backdrop-blur-sm">
        {back}
        <h1 className="min-w-0 truncate text-base font-semibold" title={title}>
          {title}
        </h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col gap-4 overflow-auto p-4">
        {children}
      </main>
    </>
  );
}
