"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMe } from "@/lib/auth/useMe";
import { submitPropertyLead } from "@/app/(site)/property/[slug]/actions";

const input = "w-full border border-brand-border rounded-lg px-3 py-2 text-sm";

export default function PropertyEnquiry({ propertyId, slug }: { propertyId: string; slug: string }) {
  const { loaded, user } = useMe();
  const params = useSearchParams();
  const leadSent = params.get("leadSent");
  const leadError = params.get("leadError");
  const next = encodeURIComponent(`/property/${slug}`);

  return (
    <>
      {leadSent && <div className="bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2.5 mb-4">Thanks — we&apos;ll be in touch shortly.</div>}
      {leadError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2.5 mb-4">Please enter your name.</div>}

      {!loaded ? (
        <div className="h-40 rounded-lg bg-brand-bg animate-pulse" aria-hidden />
      ) : user ? (
        <form action={submitPropertyLead} className="space-y-3">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="slug" value={slug} />
          <input name="name" required defaultValue={user.name ?? ""} placeholder="Your name" className={input} />
          <input name="phone" placeholder="Phone" className={input} />
          <input name="email" type="email" defaultValue={user.email} placeholder="Email" className={input} />
          <textarea name="message" placeholder="Message (optional)" rows={3} className={input} />
          <button type="submit" className="w-full bg-brand text-white font-medium rounded-lg py-2.5 hover:bg-brand-dark">
            Send Enquiry
          </button>
        </form>
      ) : (
        <div className="bg-brand-bg border border-brand-border rounded-lg p-4 text-center">
          <p className="text-sm text-brand-muted mb-3">Sign in to send an enquiry on this property.</p>
          <Link href={`/login?next=${next}`} className="block bg-brand text-white font-medium rounded-lg py-2.5 mb-2 hover:bg-brand-dark text-sm">
            Login
          </Link>
          <Link href={`/register?next=${next}`} className="text-xs text-brand hover:underline">
            New here? Register free
          </Link>
        </div>
      )}
    </>
  );
}
