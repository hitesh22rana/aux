import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
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
  themeColor: "#000000",
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
        {children}
        <Toaster
          theme="dark"
          position="bottom-center"
          richColors
          closeButton
          toastOptions={{
            style: { fontFamily: "inherit", borderRadius: "12px" },
          }}
        />
      </body>
    </html>
  );
}
