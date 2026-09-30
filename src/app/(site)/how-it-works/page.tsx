const STEPS = [
  {
    title: "Search",
    body: "Browse published bank-auction listings by city, bank, property type, price or auction date.",
  },
  {
    title: "Review",
    body: "Open a listing to see the full auction summary, property description, legal schedule and any linked official documents — all attributed to the source that published them.",
  },
  {
    title: "Verify",
    body: "Cross-check details against the official source link and documents on every listing before acting. We never invent a fact the source didn't state.",
  },
  {
    title: "Take Action",
    body: "Contact the authorized officer or bank branch listed on the auction to participate, following the official process described in the sale notice.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-14">
      <h1 className="text-2xl font-semibold mb-2">How BankAuction.co works</h1>
      <p className="text-brand-muted mb-10">
        We automatically discover public bank-auction listings, extract their details, and publish them here with
        full source attribution — we never fabricate missing information.
      </p>

      <div className="grid sm:grid-cols-2 gap-6">
        {STEPS.map((s, i) => (
          <div key={s.title} className="bg-white border border-brand-border rounded-xl p-5">
            <div className="text-xs font-semibold text-gold mb-1">Step {i + 1}</div>
            <div className="font-semibold mb-2">{s.title}</div>
            <p className="text-sm text-brand-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
