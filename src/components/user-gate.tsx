"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/providers/user-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function UserGate({ children }: { children: React.ReactNode }) {
  const { userId, setUserId, isReady } = useUser();
  const [value, setValue] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const loggedOut = isReady && !userId;

  // A logged-out visitor is always shown the login page at /chat/new, so a
  // logout (by button or by expiry) on /chat/<id> does not leave that URL
  // behind for the next login.
  useEffect(() => {
    if (loggedOut && pathname !== "/chat/new") router.replace("/chat/new");
  }, [loggedOut, pathname, router]);

  if (!isReady) return null;

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold">Enter your knox ID</h1>
            <p className="text-sm text-muted-foreground">
              Temporary stand-in until login is built.
            </p>
          </div>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setUserId(value);
            }}
          />
          <Button
            className="w-full"
            onClick={() => setUserId(value)}
            disabled={!value.trim()}
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
