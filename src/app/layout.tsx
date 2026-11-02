import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/shared/theme/theme-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: "aux | Everyone gets a say.",
  description:
    "One room. One queue. A soundtrack made together. Create a room and build a shared soundtrack across multiple music services.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // LanguageTool and similar extensions may add root attributes before hydration.
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
