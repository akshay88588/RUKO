import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RUKO — wait, before you tap send",
  description:
    "RUKO decides whether you should act on a message that is asking you for money. It tests the message's claims against live evidence, then a second model from a different family argues the message is legitimate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-[#E7EAEE] font-sans antialiased">{children}</body>
    </html>
  );
}
