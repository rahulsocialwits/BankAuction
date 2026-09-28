const stats = [
  ["Active Listings", "—"],
  ["Banks Covered", "—"],
  ["Cities", "—"],
  ["Auction Sources", "7"]
];

export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <div className="container nav">
          <a className="brand" href="/">BankAuction<span>.co</span></a>
          <nav>
            <a href="#listings">Listings</a>
            <a href="#banks">Banks</a>
            <a href="#cities">Cities</a>
            <a href="#how-it-works">How It Works</a>
          </nav>
          <a className="admin-link" href="/admin">Admin</a>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-content">
          <p className="eyebrow">BANK AUCTION PROPERTY PLATFORM</p>
          <h1>Find Bank Auction Properties</h1>
          <p className="hero-copy">
            Search structured auction listings by city, bank, property type and
            auction status. Data is designed to be updated from permitted source
            records and reviewed before publication when required.
          </p>

          <div className="search-panel">
            <input placeholder="City" aria-label="City" />
            <input placeholder="Bank" aria-label="Bank" />
            <select aria-label="Property type" defaultValue="">
              <option value="" disabled>Property Type</option>
              <option>Residential</option>
              <option>Commercial</option>
              <option>Industrial</option>
              <option>Agricultural</option>
              <option>Land / Plot</option>
              <option>Vehicle</option>
            </select>
            <select aria-label="Auction status" defaultValue="">
              <option value="" disabled>Auction Status</option>
              <option>Upcoming</option>
              <option>Live</option>
              <option>Completed</option>
              <option>Postponed</option>
              <option>Cancelled</option>
            </select>
            <button type="button">Search Auctions</button>
          </div>
        </div>
      </section>

      <section className="stats">
        <div className="container stats-grid">
          {stats.map(([label, value]) => (
            <div className="stat" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="container section" id="listings">
        <p className="eyebrow">DATABASE-DRIVEN LISTINGS</p>
        <h2>Featured Bank Auction Properties</h2>
        <p className="muted">
          Listing cards will be populated from the normalized property and
          auction database. No placeholder property facts are treated as real
          auction data.
        </p>
        <div className="empty-card">
          <strong>Property database is being connected.</strong>
          <span>Next: schema, source adapters, imports and admin review.</span>
        </div>
      </section>

      <section className="section soft" id="how-it-works">
        <div className="container two-col">
          <div>
            <p className="eyebrow">HOW IT WORKS</p>
            <h2>From source notice to searchable auction</h2>
          </div>
          <ol>
            <li>Fetch permitted source records.</li>
            <li>Normalize property and auction fields.</li>
            <li>Validate and detect duplicates.</li>
            <li>Review uncertain records.</li>
            <li>Publish and track changes automatically.</li>
          </ol>
        </div>
      </section>

      <footer>
        <div className="container footer-inner">
          <strong>BankAuction.co</strong>
          <span>Structured bank auction property discovery.</span>
        </div>
      </footer>
    </main>
  );
}
