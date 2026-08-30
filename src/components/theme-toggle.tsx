"use client";

import { useTheme } from "@/providers/theme-provider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Monitor } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Background matches the message input in both themes. */}
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 border-0 shadow-none bg-input dark:bg-zinc-800 focus-visible:ring-0 focus-visible:border-0"
        >
          {/*
            Chosen by CSS, not by state: data-theme is stamped before paint, so
            this renders correctly on the server and can't mismatch on hydration.
          */}
          <Sun className="h-[1.2rem] w-[1.2rem] transition-all dark:hidden" />
          <Moon className="hidden h-[1.2rem] w-[1.2rem] transition-all dark:block" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      {/* Matches the session menu in the sidebar. */}
      <DropdownMenuContent
        align="end"
        className="border-0 shadow-none bg-input dark:bg-zinc-800"
      >
        <DropdownMenuItem onClick={() => setTheme("light")} className="text-sm">
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="text-sm">
          <Moon className="mr-2 h-4 w-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="text-sm"
        >
          <Monitor className="mr-2 h-4 w-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SimpleThemeToggle() {
  const { actualTheme, setTheme } = useTheme();

  return (
    <div className="flex items-center space-x-2">
      <Sun className="h-4 w-4" />
      <Switch
        checked={actualTheme === "dark"}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      />
      <Moon className="h-4 w-4" />
    </div>
  );
}
