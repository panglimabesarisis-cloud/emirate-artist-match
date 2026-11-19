import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RateCardTable } from "@/components/dashboard/RateCardTable";
import { useI18n } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AdminRatecards() {
  const {t}=useI18n();
  const [artistId,setArtistId]=useState("all");
  const {data=[],error}=useQuery({queryKey:["admin-ratecard-artists"],queryFn:async()=>{const result=await supabase.from("artists").select("id,stage_name").order("stage_name");if(result.error)throw result.error;return result.data ?? [];}});
  return <section className="space-y-4">{error && <p role="alert" className="text-destructive">{t("Could not load artists.")}</p>}<Select value={artistId} onValueChange={setArtistId}><SelectTrigger className="w-full sm:w-72" aria-label={t("Artist")}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{t("All artists")}</SelectItem>{data.map(artist=><SelectItem key={artist.id} value={artist.id}>{artist.stage_name}</SelectItem>)}</SelectContent></Select><RateCardTable key={artistId} artistId={artistId === "all" ? undefined : artistId} adminMode/></section>;
}