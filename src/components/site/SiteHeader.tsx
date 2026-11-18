import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DemoBanner } from "./DemoBanner";

export function SiteHeader() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <header className="sticky top-0 z-40">
      <DemoBanner />
      <div className="bg-night text-night-foreground">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-gradient-gold grid place-items-center font-display font-bold text-gold-foreground">D</span>
            <span className="font-display text-xl font-semibold">Dealmaker<span className="text-gold">.</span></span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm opacity-90">
            <Link to="/$category" params={{ category: "musicians" }} className="hover:text-gold">Musicians</Link>
            <Link to="/$category" params={{ category: "djs" }} className="hover:text-gold">DJs</Link>
            <Link to="/$category" params={{ category: "arabic-cultural-acts" }} className="hover:text-gold">Cultural Acts</Link>
            <Link to="/how-it-works" className="hover:text-gold">How it works</Link>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {isAdmin && (
                  <Button asChild variant="ghost" size="sm" className="text-night-foreground hover:bg-sidebar-accent hover:text-gold">
                    <Link to="/admin">Admin</Link>
                  </Button>
                )}
                <Button asChild size="sm" className="bg-gradient-gold text-gold-foreground hover:opacity-90">
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={signOut} className="text-night-foreground hover:bg-sidebar-accent hover:text-gold">
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="text-night-foreground hover:bg-sidebar-accent hover:text-gold">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm" className="bg-gradient-gold text-gold-foreground hover:opacity-90">
                  <Link to="/auth" search={{ mode: "signup" }}>Join as talent</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
