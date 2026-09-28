import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BankAuction.co — Bank Auction Properties",
  description:
    "Discover bank auction properties with structured auction, property, bank, location and document information."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
