const logoUrl = "https://bankauction.co/wp-content/uploads/2026/05/Logo-2.png";

const stats = [
  ["7", "Auction Sources"],
  ["24×7", "Property Discovery"],
  ["100%", "Source-Backed Records"],
  ["1", "Central Search"]
];

const banks = ["State Bank of India", "Punjab National Bank", "HDFC Bank", "Bank of Baroda", "Canara Bank", "Union Bank"];
const cities = ["Mumbai", "Delhi", "Bengaluru", "Pune", "Surat", "Jaipur", "Ahmedabad", "Hyderabad"];

const propertyTypes = [
  ["Residential", "Homes, flats, houses & residential plots", "⌂"],
  ["Commercial", "Shops, offices, buildings & commercial land", "▣"],
  ["Industrial", "Factories, warehouses & industrial assets", "▤"],
  ["Agricultural", "Agricultural land, farms & related assets", "⌁"],
  ["Land / Plot", "Residential, commercial & open land", "◇"],
  ["Vehicles", "Cars, commercial vehicles & machinery", "◉"]
];

export default function HomePage() {
  return (
    <main>
      <div className="topbar">
        <div className="container topbar-inner">
          <span>India's bank auction property discovery platform</span>
          <div className="top-links">
            <span>Mon–Sat · 10:00 AM–6:00 PM</span>
            <a href="mailto:info@bankauction.co">info@bankauction.co</a>
          </div>
        </div>
      </div>

      <header className="site-header">
        <div className="container nav">
          <a className="brand-logo" href="/">
            <img src={logoUrl} alt="BankAuction.co" />
          </a>
          <nav>
            <a href="#listings">Listings</a>
            <a href="#banks">Banks</a>
            <a href="#cities">Cities</a>
            <a href="#property-types">Property Types</a>
            <a href="#how-it-works">How It Works</a>
          </nav>
          <div className="nav-actions">
            <a className="admin-link" href="/admin">Admin</a>
            <a className="primary-small" href="#listings">Explore Auctions</a>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-glow glow-one" />
        <div className="hero-glow glow-two" />
        <div className="container hero-grid">
          <div className="hero-copy-wrap">
            <div className="eyebrow-pill"><span /> BANK AUCTION PROPERTY PLATFORM</div>
            <h1>Find bank auction properties with <em>clarity.</em></h1>
            <p className="hero-copy">
              Discover structured auction information across banks, cities and property types —
              with source records, auction dates, reserve prices and documents organized in one place.
            </p>

            <div className="hero-actions">
              <a className="hero-button" href="#listings">Explore Properties <span>→</span></a>
              <a className="hero-secondary" href="#how-it-works">How it works</a>
            </div>

            <div className="hero-trust">
              <span className="trust-dot" />
              <span>Built around source-backed auction records</span>
              <span className="trust-divider" />
              <span>Search by city, bank & property type</span>
            </div>
          </div>

          <div className="search-card">
            <div className="search-card-head">
              <div>
                <span className="search-kicker">PROPERTY SEARCH</span>
                <h2>What are you looking for?</h2>
              </div>
              <div className="search-icon">⌕</div>
            </div>
            <div className="search-fields">
              <label>Location<input placeholder="City, district or locality" /></label>
              <label>Bank<select defaultValue=""><option value="" disabled>Select bank</option><option>State Bank of India</option><option>Punjab National Bank</option><option>HDFC Bank</option><option>Bank of Baroda</option><option>Canara Bank</option></select></label>
              <label>Property type<select defaultValue=""><option value="" disabled>Select property type</option><option>Residential</option><option>Commercial</option><option>Industrial</option><option>Agricultural</option><option>Land / Plot</option><option>Vehicle</option></select></label>
              <label>Auction status<select defaultValue=""><option value="" disabled>Select status</option><option>Upcoming</option><option>Live</option><option>Completed</option><option>Postponed</option></select></label>
            </div>
            <button className="search-button" type="button">Search Auction Properties <span>→</span></button>
            <p className="search-note">Search interface is ready for the normalized auction database.</p>
          </div>
        </div>
      </section>

      <section className="stats">
        <div className="container stats-grid">
          {stats.map(([value, label]) => (
            <div className="stat" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="listings">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-kicker">AUCTION DISCOVERY</span>
              <h2>Featured auction properties</h2>
              <p>Property cards will be populated automatically from normalized, validated source records.</p>
            </div>
            <a className="outline-button" href="/admin">Open Admin Dashboard →</a>
          </div>

          <div className="listing-preview">
            <div className="preview-icon">⌂</div>
            <div>
              <span className="preview-label">DATABASE READY</span>
              <h3>Your real auction listings will appear here</h3>
              <p>The next layer connects the property schema, source adapters, duplicate detection, documents and publication workflow.</p>
            </div>
            <div className="preview-status"><span /> Awaiting data</div>
          </div>
        </div>
      </section>

      <section className="section section-soft" id="property-types">
        <div className="container">
          <div className="section-heading centered">
            <span className="section-kicker">BROWSE BY TYPE</span>
            <h2>Find the right kind of asset</h2>
            <p>Dynamic property fields are designed around the asset type, so listings can show relevant information without unnecessary placeholders.</p>
          </div>
          <div className="type-grid">
            {propertyTypes.map(([title, description, icon]) => (
              <a className="type-card" href="#listings" key={title}>
                <div className="type-icon">{icon}</div>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <span className="card-arrow">↗</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="banks">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-kicker">BROWSE BY BANK</span>
              <h2>Explore auction sources by bank</h2>
            </div>
            <span className="section-note">Source coverage will expand as adapters are connected.</span>
          </div>
          <div className="bank-grid">
            {banks.map((bank, index) => (
              <a className="bank-card" href="#listings" key={bank}>
                <span className="bank-number">0{index + 1}</span>
                <span>{bank}</span>
                <b>→</b>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-soft" id="cities">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-kicker">BROWSE BY CITY</span>
              <h2>Search where you want to invest</h2>
            </div>
          </div>
          <div className="city-grid">
            {cities.map((city) => <a href="#listings" className="city-chip" key={city}>{city}<span>→</span></a>)}
          </div>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="container process-layout">
          <div className="process-intro">
            <span className="section-kicker">HOW IT WORKS</span>
            <h2>From auction notice to a clean, searchable listing.</h2>
            <p>BankAuction.co is being built as a database-driven platform rather than a collection of static pages.</p>
          </div>
          <div className="process-list">
            {[
              ["01", "Source", "Fetch permitted public source records and retain the original reference."],
              ["02", "Normalize", "Convert different source formats into one structured property and auction model."],
              ["03", "Validate", "Check required fields, dates, duplicates, conflicts and source confidence."],
              ["04", "Publish", "Review uncertain records, publish approved listings and track future changes."]
            ].map(([number, title, text]) => (
              <div className="process-item" key={number}>
                <span>{number}</span>
                <div><h3>{title}</h3><p>{text}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta">
          <div>
            <span className="section-kicker light">BANK AUCTION INTELLIGENCE</span>
            <h2>A cleaner way to discover auction opportunities.</h2>
            <p>Search, compare and review structured auction information from one platform.</p>
          </div>
          <a href="#listings" className="cta-button">Explore Auctions <span>→</span></a>
        </div>
      </section>

      <footer>
        <div className="container footer-main">
          <div className="footer-brand">
            <img src={logoUrl} alt="BankAuction.co" />
            <p>Structured bank auction property discovery — built around source-backed records.</p>
          </div>
          <div className="footer-column"><h4>Explore</h4><a href="#listings">Listings</a><a href="#banks">Banks</a><a href="#cities">Cities</a><a href="#property-types">Property Types</a></div>
          <div className="footer-column"><h4>Platform</h4><a href="#how-it-works">How It Works</a><a href="/admin">Admin Dashboard</a><a href="mailto:info@bankauction.co">Contact</a></div>
          <div className="footer-column"><h4>Data</h4><span>Source records</span><span>Validation</span><span>Change tracking</span><span>Document references</span></div>
        </div>
        <div className="container footer-bottom"><span>© 2026 BankAuction.co. All rights reserved.</span><span>Built for structured auction discovery.</span></div>
      </footer>
    </main>
  );
}
