import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="bg-night text-night-foreground mt-24">
      <div className="mx-auto max-w-7xl px-4 py-12 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <div className="font-display text-2xl">Dealmaker<span className="text-gold">.</span></div>
          <p className="mt-2 opacity-70">Dubai's AI-powered talent marketplace. Every artist deserves an AI manager.</p>
        </div>
        <div>
          <div className="font-semibold mb-3 text-gold">Discover</div>
          <ul className="space-y-2 opacity-80">
            <li><Link to="/$category" params={{ category: "musicians" }}>Musicians in Dubai</Link></li>
            <li><Link to="/$category" params={{ category: "djs" }}>DJs in Dubai</Link></li>
            <li><Link to="/$category" params={{ category: "variety-entertainers" }}>Variety entertainers</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3 text-gold">For talent</div>
          <ul className="space-y-2 opacity-80">
            <li><Link to="/auth" search={{ mode: "signup" }}>Create a profile</Link></li>
            <li><Link to="/how-it-works">How it works</Link></li>
          </ul>
        </div>
        <div className="opacity-70">
          Prices in AED, incl. 5% VAT where applicable. Demo platform — no real payments.
        </div>
      </div>
    </footer>
  );
}
