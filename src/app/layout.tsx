import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Type Six Steven",
  description: "Type the crypto word before time runs out. But when you see six, type steven instead!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
