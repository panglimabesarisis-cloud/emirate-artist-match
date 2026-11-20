import { Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/SiteFooter";

export function HomeFooter() {
  return <div className="home-footer">
    <SiteFooter />
    <div className="wordmark split" aria-hidden="true">{"Dealmaker".split("").map((c, i) => <span className="ch" key={i}>{c}</span>)}<b className="ch">.</b><span className="spark"><i /></span><span className="spark"><i /></span><span className="spark"><i /></span></div>
    <div className="wrap f-bot"><span>© 2026 Dealmaker · Management by <b>Dede Fajar Kurniawan</b></span><Link to="/how-it-works">Dubai · Abu Dhabi · Sharjah</Link></div>
  </div>;
}