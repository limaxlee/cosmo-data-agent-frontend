import type { Metadata } from "next";

import "./globals.css";
import localFont from "next/font/local";

import { UserProvider } from "@/providers/user-provider";
import { UserGate } from "@/components/user-gate";
import { ThemeProvider } from "@/providers/theme-provider";

const inter = localFont({
  src: [
    { path: "./fonts/InterVariable.woff2", style: "normal" },
    { path: "./fonts/InterVariable-Italic.woff2", style: "italic" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_TITLE || "Data Agent",
  description: "Frontend for DICE Data Agent",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <ThemeProvider defaultTheme="system" storageKey="theme">
          <UserProvider>
            <UserGate>{children}</UserGate>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
