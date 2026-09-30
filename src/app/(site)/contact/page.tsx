import type { Metadata } from "next";
import { submitContactLead } from "./actions";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Questions about a bank auction listing or the platform? Send us a message and our team will get back to you.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-14">
      <h1 className="text-2xl font-semibold mb-2">Contact Us</h1>
      <p className="text-brand-muted text-sm mb-8">
        Questions about a listing or the platform? Send us a message.
      </p>

      {sent && (
        <div className="bg-green-50 text-green-700 text-sm rounded-lg px-4 py-3 mb-6">
          Thanks — we&apos;ve received your message and will get back to you.
        </div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">Please enter your name.</div>
      )}

      <form action={submitContactLead} className="space-y-4 bg-white border border-brand-border rounded-xl p-6 max-w-2xl">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="name">Name</label>
          <input id="name" name="name" required className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="phone">Phone</label>
            <input id="phone" name="phone" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="message">Message</label>
          <textarea id="message" name="message" rows={4} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">
          Send Message
        </button>
      </form>
    </main>
  );
}
