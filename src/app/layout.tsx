import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClipGenius - YouTube to Shorts",
  description:
    "Convert long YouTube videos into viral short-form clips with captions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0f] text-white antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
