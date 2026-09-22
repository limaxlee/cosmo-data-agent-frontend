import type { Metadata } from "next";

import "./globals.css";
import localFont from "next/font/local";

import { UserProvider } from "@/providers/user-provider";
import { UserGate } from "@/components/user-gate";
import { ThemeProvider } from "@/providers/theme-provider";
import { APP_TITLE } from "@/lib/app-title";

const inter = localFont({
  src: [
    { path: "./fonts/InterVariable.woff2", style: "normal" },
    { path: "./fonts/InterVariable-Italic.woff2", style: "italic" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: APP_TITLE,
    template: `%s - ${APP_TITLE}`,
  },
  description: "Frontend for DICE Data Agent",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        {/*
          Runs before the page paints, so the saved theme is on the element
          from the first frame. Without it the server sends no data-theme and
          the browser falls back to prefers-color-scheme until React hydrates.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("theme");var t=(s==="dark"||s==="light")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`,
          }}
        />
        <ThemeProvider defaultTheme="system" storageKey="theme">
          <UserProvider>
            <UserGate>{children}</UserGate>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
