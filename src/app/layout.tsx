import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
export const metadata: Metadata = {
  title: "aux — Every seat has a say.",
  description:
    "One ride. One queue. A soundtrack made together. Create a room and pass the aux to your whole crew.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f8f9f5",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
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
