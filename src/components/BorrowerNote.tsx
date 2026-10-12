"use client";

import Link from "next/link";
import { useMe } from "@/lib/auth/useMe";

/**
 * The Borrower row. Owner decision D07: borrower names are not displayed or sold (privacy). A Premium member is told that plainly
 * instead of being sent to the plans page again; everyone else sees the neutral line that was there before.
 */
export default function BorrowerNote() {
  const { user } = useMe();
  if (user?.premium) {
    return <>Borrower names are not published on BankAuction.co (privacy policy). The official notice and documents below have the details the bank publishes.</>;
  }
  return (
    <>
      Borrower details available with Premium.{" "}
      <Link href="/pricing" className="text-gold font-semibold whitespace-nowrap">See plans →</Link>
    </>
  );
}
