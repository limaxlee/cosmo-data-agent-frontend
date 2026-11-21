"use client";

import { LoaderCircle } from "lucide-react";

import { useUser } from "@/providers/user-provider";
import { loginUrl } from "@/lib/auth-client";
import { APP_TITLE } from "@/lib/app-title";
import { Button } from "@/components/ui/button";

function Screen({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}

/**
 * Shows the app only to a person who is logged in and approved. In every
 * other state the app is not rendered at all, so its polling stops and no
 * stale error banner is left on screen.
 *
 * Nothing here changes the address: it is what the login page comes back to.
 */
export function UserGate({ children }: { children: React.ReactNode }) {
  const { status, userId, checkAgain, logout } = useUser();

  if (status === "ready") return <>{children}</>;

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle
          className="h-5 w-5 animate-spin text-muted-foreground"
          aria-label="Checking your login"
        />
      </div>
    );
  }

  if (status === "redirecting") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">
          Going to Samsung SSO...
        </p>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <Screen title="You are not logged in">
        <p className="text-sm text-muted-foreground">
          Log in with Samsung SSO to use {APP_TITLE}.
        </p>
        <Button
          className="w-full"
          onClick={() => window.location.assign(loginUrl())}
        >
          Log in
        </Button>
        <Button variant="ghost" className="w-full" onClick={checkAgain}>
          Check again
        </Button>
      </Screen>
    );
  }

  if (status === "pending") {
    return (
      <Screen title="Waiting for approval">
        <p className="text-sm text-muted-foreground">
          An administrator has to approve your account before you can use{" "}
          {APP_TITLE}.
        </p>
        <p className="text-sm font-medium">{userId}</p>
        <Button className="w-full" onClick={checkAgain}>
          Check again
        </Button>
        <Button variant="ghost" className="w-full" onClick={logout}>
          Log out
        </Button>
      </Screen>
    );
  }

  return (
    <Screen title="Could not check your login">
      <p className="text-sm text-muted-foreground">
        The login service or the server did not answer.
      </p>
      <Button className="w-full" onClick={checkAgain}>
        Try again
      </Button>
    </Screen>
  );
}
