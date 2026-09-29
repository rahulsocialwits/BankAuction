export default function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-5 py-14">
      <h1 className="text-2xl font-semibold mb-4">About BankAuction.co</h1>
      <div className="space-y-4 text-sm leading-7 text-black/80">
        <p>
          BankAuction.co is a discovery platform for Indian bank-auction properties. We automatically monitor
          public auction listing pages that permit it, extract structured property and auction information, and
          publish it here with full attribution back to the original source.
        </p>
        <p>
          We do not fabricate missing information. Where a source doesn&apos;t state a fact — a bedroom count, a
          possession date, a survey number — we show it as Not Available rather than guessing.
        </p>
        <p>
          Every listing links back to its official source and any linked documents (sale notices, bid forms, terms
          and conditions), so you can verify every detail before acting on it.
        </p>
      </div>
    </main>
  );
}
