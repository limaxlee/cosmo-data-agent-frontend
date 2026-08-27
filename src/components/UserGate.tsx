"use client";

import { useState } from "react";
import { useUser } from "@/lib/user-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function UserGate({ children }: { children: React.ReactNode }) {
  const { userId, setUserId, isReady } = useUser();
  const [value, setValue] = useState("");

  if (!isReady) return null;

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold">Enter your user ID</h1>
            <p className="text-sm text-muted-foreground">
              Temporary stand-in until login is built.
            </p>
          </div>
          <Input
            autoFocus
            placeholder="e.g. m.alenova"
            value={value}
             => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setUserId(value);
            }}
          />
          <Button
            className="w-full"
             => setUserId(value)}
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
