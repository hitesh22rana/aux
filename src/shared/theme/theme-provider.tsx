"use client";

import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { useEffect, type ReactNode } from "react";

function ThemeToaster() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )) {
      meta.content = resolvedTheme === "dark" ? "#000000" : "#fafafa";
    }
  }, [resolvedTheme]);
  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      richColors
      closeButton
      toastOptions={{ style: { fontFamily: "inherit", borderRadius: "12px" } }}
    />
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      storageKey="aux-theme"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <ThemeToaster />
    </NextThemeProvider>
  );
}
