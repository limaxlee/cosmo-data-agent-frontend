"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Theme = "dark" | "light" | "system";
type ThemeProviderContext = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: "dark" | "light";
};

const ThemeProviderContext = createContext<ThemeProviderContext | undefined>(
  undefined,
);

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
}: ThemeProviderProps) {
  // Read straight from storage on the first client render, so the theme the
  // pre-paint script already applied is never briefly replaced by the default.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "dark" || stored === "light" || stored === "system") {
        return stored;
      }
    } catch {
      // Storage unavailable (private mode, blocked cookies) - use the default.
    }
    return defaultTheme;
  });

  const [actualTheme, setActualTheme] = useState<"dark" | "light">(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";
  });

  // Only a real choice is persisted. Writing on every mount would clobber the
  // stored value with the default before it had been read back.
  const setTheme = useCallback(
    (next: Theme) => {
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // Non-fatal: the theme still applies for this page.
      }
      setThemeState(next);
    },
    [storageKey],
  );

  useEffect(() => {
    const root = window.document.documentElement;

    const effectiveTheme: "dark" | "light" =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;

    setActualTheme(effectiveTheme);
    root.setAttribute("data-theme", effectiveTheme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      const root = window.document.documentElement;
      const systemTheme = mediaQuery.matches ? "dark" : "light";
      setActualTheme(systemTheme);
      root.setAttribute("data-theme", systemTheme);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const value = { theme, setTheme, actualTheme };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
