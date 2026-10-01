import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/queries/siteSettings";
import SubmitButton from "@/components/admin/SubmitButton";
import { submitContactLead } from "./actions";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Questions about a bank auction listing or the platform? Send us a message and our team will get back to you.",
  alternates: { canonical: "/contact" },
};

const ERRORS: Record<string, string> = {
  name: "Please enter your name.",
  reach: "Please give an email or a phone number so we can reply.",
  email: "That email address does not look right.",
  phone: "That phone number looks too short.",
  message: "Please write a short message (at least 5 characters).",
};

const SUBJECTS = ["General enquiry", "About a property", "List a property / partnership", "Premium plan", "Report a problem"];

const field = "w-full border border-brand-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand";

const svg = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

const PhoneIcon = () => (
  <svg {...svg}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
);
const ChatIcon = () => (
  <svg {...svg}>
    <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.3A8.4 8.4 0 1 1 21 11.5z" />
    <path d="M8.5 10.5h7M8.5 13.5h4" />
  </svg>
);
const MailIcon = () => (
  <svg {...svg}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-brand-border rounded-2xl p-5 flex gap-4">
      <div className="w-10 h-10 shrink-0 rounded-full bg-brand-bg text-brand flex items-center justify-center">{icon}</div>
      <div className="min-w-0">
        <div className="font-semibold text-sm mb-1">{title}</div>
        <div className="text-sm text-brand-muted space-y-1 break-words">{children}</div>
      </div>
    </div>
  );
}

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  const s = await getSiteSettings();
  const digits = s.phone.replace(/\D/g, "");
  const wa = digits.length === 10 ? `91${digits}` : digits;

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold mb-2">Contact Us</h1>
        <p className="text-brand-muted text-sm max-w-2xl">
          Questions about a listing, a premium plan or listing your own property? Send us a message or reach us directly. We reply during working hours.
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-8 items-start">
        <section aria-labelledby="send-message">
          <h2 id="send-message" className="sr-only">Send a message</h2>

          {sent && (
            <div role="status" className="bg-green-50 text-green-800 text-sm rounded-xl px-4 py-3 mb-5">
              ✓ Thank you — we have received your message and will get back to you shortly.
            </div>
          )}
          {error && (
            <div role="alert" className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">{ERRORS[error] ?? "Something went wrong. Please try again."}</div>
          )}

          <form action={submitContactLead} className="bg-white border border-brand-border rounded-2xl p-6 sm:p-8 space-y-5">
            {/* Honeypot: real visitors never see or fill this. */}
            <div className="hidden" aria-hidden="true">
              <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="name">Your name <span className="text-red-600">*</span></label>
                <input id="name" name="name" required minLength={2} autoComplete="name" className={field} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="subject">What is this about?</label>
                <select id="subject" name="subject" defaultValue={SUBJECTS[0]} className={field}>
                  {SUBJECTS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="email">Email</label>
                <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" className={field} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="phone">Phone / WhatsApp</label>
                <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+91 98XXX XXXXX" className={field} />
              </div>
            </div>
            <p className="text-xs text-brand-muted -mt-2">Give at least one of email or phone so we can reply.</p>

            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="message">Message <span className="text-red-600">*</span></label>
              <textarea id="message" name="message" rows={6} required minLength={5} maxLength={2000} placeholder="Tell us how we can help. If it is about a property, paste its link or name." className={field} />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <SubmitButton className="bg-brand text-white font-medium rounded-lg px-8 py-3 hover:bg-brand-dark">Send message</SubmitButton>
              <span className="text-xs text-brand-muted">We use your details only to reply to you.</span>
            </div>
          </form>
        </section>

        <aside className="space-y-4" aria-label="Contact details">
          <InfoCard icon={<PhoneIcon />} title="Call us">
            <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="text-brand font-medium hover:underline">{s.phone}</a>
            <div>{s.workingHours}</div>
          </InfoCard>

          <InfoCard icon={<ChatIcon />} title="WhatsApp">
            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent("Hi, I have a question about BankAuction.co")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-[#25D366] text-white font-medium px-4 py-2 hover:bg-[#1ebe5a]"
            >
              Chat on WhatsApp
            </a>
          </InfoCard>

          <InfoCard icon={<MailIcon />} title="Email">
            <div><span className="text-xs uppercase tracking-wide">General</span><br /><a href={`mailto:${s.generalEmail}`} className="text-brand hover:underline break-all">{s.generalEmail}</a></div>
            <div><span className="text-xs uppercase tracking-wide">List a property</span><br /><a href={`mailto:${s.listingsEmail}`} className="text-brand hover:underline break-all">{s.listingsEmail}</a></div>
            <div><span className="text-xs uppercase tracking-wide">Partnerships</span><br /><a href={`mailto:${s.partnershipsEmail}`} className="text-brand hover:underline break-all">{s.partnershipsEmail}</a></div>
          </InfoCard>
        </aside>
      </div>
    </main>
  );
}
