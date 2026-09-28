const logoUrl = "https://bankauction.co/wp-content/uploads/2026/05/Logo-2.png";

const listings = [
  { title:"2BHK Bank Auction Flat in Andheri West, Mumbai", city:"Andheri West, Mumbai", bank:"State Bank of India", type:"Residential", price:"₹78,00,000", meta:"2 BHK · 980 Sq Ft", status:"Upcoming" },
  { title:"2BHK Flat for Auction in Andheri West, Mumbai", city:"Andheri West, Mumbai", bank:"Canara Bank", type:"Residential", price:"₹31,00,000", meta:"2 BHK · 958 Sq Ft", status:"Upcoming" },
  { title:"Commercial Space for Auction in Bandra East", city:"Bandra East, Mumbai", bank:"ICICI Bank", type:"Commercial", price:"₹57,00,000", meta:"442 Sq Ft", status:"Upcoming" },
  { title:"Residential Plot for Auction in Thane", city:"Thane, Maharashtra", bank:"Canara Bank", type:"Plot", price:"₹30,00,000", meta:"2,316 Sq Ft", status:"Upcoming" },
  { title:"Residential Flat at South 24 Parganas", city:"Kolkata, West Bengal", bank:"Cholamandalam Investment", type:"Residential", price:"₹5,00,00,000", meta:"3,900 Sq Ft", status:"Upcoming" },
  { title:"Commercial Property at Sachana Town, Sanand", city:"Ahmedabad, Gujarat", bank:"JM Financial ARC", type:"Commercial", price:"₹5,90,000", meta:"Unit 501", status:"Upcoming" }
];

const banks = ["State Bank of India","Punjab National Bank","HDFC Bank","Canara Bank","Bank of Baroda","Union Bank of India","ICICI Bank","IDBI Bank"];
const cities = ["Mumbai","Delhi","Bengaluru","Pune","Ahmedabad","Chennai","Hyderabad","Jaipur","Kolkata","Surat","Gurgaon","Thane"];
const types = [
  ["Residential","Flats, houses, villas & apartments","⌂"],
  ["Commercial","Shops, offices, showrooms & buildings","▣"],
  ["Industrial","Factories, warehouses & machinery","▤"],
  ["Land & Plot","Residential, commercial & open land","◇"],
  ["Agricultural","Farms, orchards & agricultural land","⌁"],
  ["Vehicles","Cars, commercial vehicles & equipment","◉"]
];

function Logo() {
  return <a className="brand-logo" href="/" aria-label="BankAuction.co">
    <span className="brand-fallback">BankAuction<span>.co</span></span>
    <img src={logoUrl} alt="BankAuction.co" />
  </a>;
}

export default function HomePage() {
  return (
    <main>
      <div className="topbar"><div className="container topbar-inner">
        <span>India's bank auction property discovery platform</span>
        <div><span>Mon–Sat · 10:00 AM–6:00 PM IST</span><a href="tel:+918160144606">+91 81601 44606</a><a href="mailto:info@bankauction.co">info@bankauction.co</a></div>
      </div></div>

      <header className="site-header"><div className="container nav">
        <Logo />
        <nav>
          <a href="/listings">Listings</a><a href="#banks">Banks</a><a href="#cities">Cities</a><a href="#types">Property Types</a><a href="/how-it-works">How It Works</a><a href="/about">About</a>
        </nav>
        <div className="nav-actions"><a className="admin-link" href="/admin">Admin</a><a className="primary-small" href="/listings">Explore Auctions</a></div>
      </div></header>

      <section className="hero">
        <div className="hero-pattern" />
        <div className="container hero-grid">
          <div className="hero-left">
            <div className="eyebrow-pill"><span /> VERIFIED AUCTION DISCOVERY</div>
            <h1>Find bank auction properties <em>with confidence.</em></h1>
            <p className="hero-copy">Discover residential, commercial, industrial, land and vehicle auctions from banks and financial institutions — with auction dates, reserve prices, EMD and source documents organized in one place.</p>
            <div className="hero-actions"><a className="hero-button" href="/listings">Explore Properties <span>→</span></a><a className="hero-secondary" href="/how-it-works">How it works</a></div>
            <div className="hero-points"><span>✓ Source-backed listings</span><span>✓ Auction dates & EMD</span><span>✓ Bank & location filters</span></div>
          </div>
          <div className="search-card">
            <div className="search-head"><div><span>SEARCH AUCTION PROPERTIES</span><h2>What are you looking for?</h2></div><b>⌕</b></div>
            <div className="search-grid">
              <label>City / Location<input placeholder="e.g. Mumbai, Pune, Delhi" /></label>
              <label>Bank<select defaultValue=""><option value="" disabled>Select bank</option>{banks.slice(0,6).map(b=><option key={b}>{b}</option>)}</select></label>
              <label>Property Type<select defaultValue=""><option value="" disabled>Select property type</option>{types.map(t=><option key={t[0]}>{t[0]}</option>)}</select></label>
              <label>Auction Status<select defaultValue=""><option value="" disabled>Select status</option><option>Upcoming</option><option>Live</option><option>Completed</option><option>Postponed</option></select></label>
              <label>Price Range<select defaultValue=""><option value="" disabled>Any budget</option><option>Under ₹25 Lakh</option><option>₹25 Lakh – ₹50 Lakh</option><option>₹50 Lakh – ₹1 Crore</option><option>Above ₹1 Crore</option></select></label>
              <label>Search by<select defaultValue=""><option value="" disabled>Choose</option><option>City</option><option>Bank</option><option>Property type</option><option>Auction date</option></select></label>
            </div>
            <a className="search-button" href="/listings">Search Auction Properties <span>→</span></a>
            <div className="search-foot"><span>974 properties in the current catalog</span><span>Updated from source records</span></div>
          </div>
        </div>
      </section>

      <section className="stats"><div className="container stats-grid">
        <div><strong>974+</strong><span>Property Listings</span></div><div><strong>30+</strong><span>Banks & Institutions</span></div><div><strong>100+</strong><span>Cities Covered</span></div><div><strong>6</strong><span>Asset Categories</span></div>
      </div></section>

      <section className="section" id="listings"><div className="container">
        <div className="section-heading"><div><span className="section-kicker">FEATURED AUCTIONS</span><h2>Properties worth exploring</h2><p>Browse auction properties with reserve price, location, bank and property information clearly presented.</p></div><a className="outline-button" href="/listings">View All Listings →</a></div>
        <div className="listing-grid">
          {listings.map((item,i)=><article className="property-card" key={item.title}>
            <div className={"property-visual visual-"+(i%4)}><span className="visual-type">{item.type}</span><span className="visual-mark">BA</span><span className="status-badge">{item.status}</span></div>
            <div className="property-body"><div className="property-location">⌖ {item.city}</div><h3>{item.title}</h3><div className="property-meta"><span>{item.meta}</span><span>{item.bank}</span></div><div className="property-bottom"><div><small>Reserve Price</small><strong>{item.price}</strong></div><a href="/listings">View Details →</a></div></div>
          </article>)}
        </div>
      </div></section>

      <section className="section section-soft" id="types"><div className="container">
        <div className="section-heading centered"><span className="section-kicker">BROWSE BY PROPERTY TYPE</span><h2>Find the asset that fits your search</h2><p>Each property type can have its own relevant fields, documents and auction information.</p></div>
        <div className="type-grid">{types.map(t=><a className="type-card" href="/listings" key={t[0]}><div className="type-icon">{t[2]}</div><div><h3>{t[0]}</h3><p>{t[1]}</p></div><span>↗</span></a>)}</div>
      </div></section>

      <section className="section" id="banks"><div className="container">
        <div className="section-heading"><div><span className="section-kicker">BROWSE BY BANK</span><h2>Auctions from leading institutions</h2><p>Explore listings by the bank or financial institution conducting the auction.</p></div><a className="outline-button" href="/listings">All Banks →</a></div>
        <div className="bank-grid">{banks.map((bank,i)=><a className="bank-card" href="/listings" key={bank}><span className="bank-logo">{bank.split(" ").map(x=>x[0]).slice(0,3).join("")}</span><div><strong>{bank}</strong><small>View auction listings</small></div><b>→</b></a>)}</div>
      </div></section>

      <section className="section section-soft" id="cities"><div className="container">
        <div className="section-heading"><div><span className="section-kicker">BROWSE BY CITY</span><h2>Search auctions across India</h2></div><a className="outline-button" href="/listings">All Cities →</a></div>
        <div className="city-grid">{cities.map(city=><a className="city-card" href="/listings" key={city}><span>⌖</span><strong>{city}</strong><small>View auctions →</small></a>)}</div>
      </div></section>

      <section className="section"><div className="container trust-layout">
        <div className="trust-copy"><span className="section-kicker">WHY BANKAUCTION.CO</span><h2>Everything you need to evaluate an auction listing.</h2><p>Bank auction information is often spread across notices, portals and documents. The platform is structured to bring the important details together while preserving the original source reference.</p><a className="hero-button" href="/how-it-works">See How It Works <span>→</span></a></div>
        <div className="trust-grid">
          <div><i>✓</i><h3>Source-backed listings</h3><p>Keep the original source and notice reference alongside normalized data.</p></div>
          <div><i>₹</i><h3>Reserve price & EMD</h3><p>See key financial auction fields without hunting through the page.</p></div>
          <div><i>◷</i><h3>Auction timeline</h3><p>Track auction start, deadline, inspection and status changes.</p></div>
          <div><i>▤</i><h3>Documents in one place</h3><p>Sale notices, bid forms and terms can be attached to the listing.</p></div>
        </div>
      </div></section>

      <section className="section section-dark"><div className="container process-layout">
        <div><span className="section-kicker light">HOW IT WORKS</span><h2>From auction notice to a searchable property.</h2><p>Our data model is designed around the way auction information is actually published.</p><a className="dark-outline" href="/how-it-works">Learn More →</a></div>
        <div className="process-list">
          {[["01","Source","Collect permitted source records and retain the original reference."],["02","Structure","Normalize property, location, bank and auction fields."],["03","Validate","Detect duplicates, missing data and conflicting details."],["04","Publish","Review uncertain records and publish approved listings." ]].map(x=><div className="process-item" key={x[0]}><span>{x[0]}</span><div><h3>{x[1]}</h3><p>{x[2]}</p></div></div>)}
        </div>
      </div></section>

      <section className="section insights"><div className="container">
        <div className="section-heading"><div><span className="section-kicker">BANK AUCTION INSIGHTS</span><h2>Learn before you bid</h2><p>Guides covering auction process, legal checks, documents and property due diligence.</p></div><a className="outline-button" href="/how-it-works">View Guides →</a></div>
        <div className="article-grid"><article><span>LEGAL & PROCESS</span><h3>SARFAESI Act & bank auctions: what buyers should understand</h3><p>Understand the auction process, important documents and the role of the bank's sale notice.</p><a href="/how-it-works">Read Guide →</a></article><article><span>DUE DILIGENCE</span><h3>10 checks to make before bidding on an auction property</h3><p>Review title, possession, dues, inspection and auction conditions before you participate.</p><a href="/how-it-works">Read Guide →</a></article><article><span>AUCTION BASICS</span><h3>How online bank property auctions work in India</h3><p>A practical overview from finding a listing to submitting EMD and participating in the e-auction.</p><a href="/how-it-works">Read Guide →</a></article></div>
      </div></section>

      <section className="cta-section"><div className="container cta"><div><span className="section-kicker light">READY TO EXPLORE?</span><h2>Find your next bank auction opportunity.</h2><p>Search by city, bank, property type and auction status.</p></div><a href="/listings" className="cta-button">Explore Properties <span>→</span></a></div></section>

      <footer><div className="container footer-main">
        <div className="footer-brand"><Logo/><p>India's bank auction property discovery platform for residential, commercial, industrial, land and vehicle auctions.</p><div className="footer-contact"><a href="tel:+918160144606">+91 81601 44606</a><a href="mailto:info@bankauction.co">info@bankauction.co</a></div></div>
        <div className="footer-column"><h4>Properties</h4><a href="/listings">All Listings</a><a href="#types">Residential</a><a href="#types">Commercial</a><a href="#types">Industrial</a><a href="#types">Land & Plot</a></div>
        <div className="footer-column"><h4>Explore</h4><a href="#banks">Banks</a><a href="#cities">Cities</a><a href="/how-it-works">How It Works</a><a href="/about">About Us</a><a href="/admin">Admin</a></div>
        <div className="footer-column"><h4>Platform</h4><a href="/how-it-works">Auction Guides</a><a href="/listings">Auction Alerts</a><a href="/how-it-works">Source & Data</a><a href="mailto:info@bankauction.co">Contact Us</a></div>
      </div><div className="container footer-bottom"><span>© 2026 BankAuction.co. All rights reserved.</span><span>Information should be verified against the original auction notice before bidding.</span></div></footer>
    </main>
  );
}
