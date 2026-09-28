export default function AdminPage() {
  const modules = [
    ["Properties", "Manage published, draft and review listings."],
    ["Auctions", "Track upcoming, live, completed and changed auctions."],
    ["Sources", "Monitor source adapters and last synchronization."],
    ["Import Jobs", "Review new, updated, duplicate and failed records."],
    ["Banks & Locations", "Manage normalized bank and geographic data."],
    ["Documents", "Track sale notices, bid forms and terms."],
  ];

  return (
    <main className="container section">
      <p className="eyebrow">ADMINISTRATION</p>
      <h1>BankAuction Dashboard</h1>
      <p className="muted">
        The admin area will control imports, validation, publishing, source
        health and property data.
      </p>
      <div className="admin-grid">
        {modules.map(([title, description]) => (
          <article className="empty-card" key={title}>
            <strong>{title}</strong>
            <span>{description}</span>
          </article>
        ))}
      </div>
    </main>
  );
}
