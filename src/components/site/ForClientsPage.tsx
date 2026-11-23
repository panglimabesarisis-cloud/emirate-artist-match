import { Link } from "@tanstack/react-router";
import { ArrowRight, Heart, PartyPopper, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientBookingGuide } from "./ClientBookingGuide";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";
import { SceneBackground } from "@/components/shared/SceneBackground";
import { PublicLayout } from "./PublicLayout";
import "./information.css";
import "./how-it-works.css";
import "./for-clients.css";

const occasions = [
  { icon: Heart, title: "Weddings", subtitle: "Ceremony to celebration" },
  { icon: Users, title: "Corporate events", subtitle: "Galas, launches and gatherings" },
  { icon: PartyPopper, title: "Private parties", subtitle: "A moment worth celebrating" },
  { icon: Sparkles, title: "Cultural occasions", subtitle: "Performances with character" },
];

export function ForClientsPage() {
  return <ReferenceTheme><PublicLayout><div className="how-page clients-page">
    <section className="f-hero scenehost" data-scenes="arch">
      <SceneBackground />
      <div className="wrap f-hero-in">
        <span className="eyebrow">For clients</span>
        <h1 className="serif">Book talent <span className="it">for your event.</span></h1>
        <p className="lead">From an intimate celebration to a corporate stage, find UAE performers, share your brief and agree the details with the artist through Dealmaker.</p>
        <div className="client-hero-actions">
          <Button asChild className="btn btn-gold"><Link to="/$category" params={{ category: "musicians" }}>Find talent<Search aria-hidden="true" /></Link></Button>
          <Button asChild variant="outline" className="btn btn-line"><Link to="/how-it-works">How booking works<ArrowRight aria-hidden="true" /></Link></Button>
        </div>
        <p className="client-hero-note"><ShieldCheck aria-hidden="true" /><span>Free quote requests. Artist approval before payment.</span></p>
      </div>
    </section>
    <div className="wrap">
      <div className="client-occasions" aria-label="Event occasions">{occasions.map(({ icon: Icon, title, subtitle }) => <div className="client-occasion" key={title}><Icon aria-hidden="true" /><div><strong>{title}</strong><span>{subtitle}</span></div></div>)}</div>
      <ClientBookingGuide />
      <section className="f-cta" aria-labelledby="client-cta-title"><h2 id="client-cta-title">Give your event <span className="it">its moment.</span></h2><div><Button asChild className="btn btn-gold"><Link to="/$category" params={{ category: "musicians" }}>Explore talent<ArrowRight aria-hidden="true" /></Link></Button><Button asChild variant="outline" className="btn btn-line"><Link to="/">Browse categories<Search aria-hidden="true" /></Link></Button></div></section>
    </div>
  </div></PublicLayout></ReferenceTheme>;
}