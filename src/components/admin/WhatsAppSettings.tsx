import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getWhatsAppSettings, saveWhatsAppSettings, testWhatsAppSettings } from "@/lib/whatsapp-settings.functions";
import { whatsappProvider, type WhatsAppProvider } from "@/lib/whatsapp-provider";

export function WhatsAppSettings() {
  const load = useServerFn(getWhatsAppSettings);
  const save = useServerFn(saveWhatsAppSettings);
  const test = useServerFn(testWhatsAppSettings);
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["whatsapp-settings"], queryFn: () => load() });
  const [provider, setProvider] = useState<WhatsAppProvider>("meta");
  const [token, setToken] = useState("");
  // The test only ever goes to the signed-in admin's verified number.
  const own = useQuery({ queryKey: ["admin-own-whatsapp"], queryFn: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const { data } = await supabase.from("profiles").select("phone, phone_verified_at").eq("id", auth.user.id).maybeSingle();
    return data?.phone_verified_at ? data.phone : null;
  } });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  useEffect(() => { if (settings.data) setProvider(settings.data.provider); }, [settings.data]);
  const dirty = provider !== settings.data?.provider || Boolean(token.trim());
  if (settings.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (settings.isError) return <p role="alert" className="text-destructive">Unable to load WhatsApp settings.</p>;
  const saveSettings = async () => {
    setBusy(true); setResult("");
    try {
      await save({ data: { provider, token: token.trim() || undefined } });
      setToken(""); await qc.invalidateQueries({ queryKey: ["whatsapp-settings"] });
      toast.success("WhatsApp settings saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save settings"); }
    finally { setBusy(false); }
  };
  const sendTest = async () => {
    setBusy(true); setResult("");
    try {
      const r = await test({});
      setResult(r.status === "accepted" ? "Request accepted. Check the recipient's WhatsApp; delivery is not yet verified." : r.error ?? "Provider setup is incomplete.");
    } catch (error) { setResult(error instanceof Error ? error.message : "Unable to send test"); }
    finally { setBusy(false); }
  };
  return <div className="adm-set-grid">
    <section className="adm-set-card"><header><h2>WhatsApp gateway</h2><p>The provider that sends booking messages and verification codes.</p></header>
    <div className="space-y-2"><Label htmlFor="wa-provider">Provider</Label>
      <Select value={provider} onValueChange={(v) => { setProvider(whatsappProvider(v)); setResult(""); }} disabled={busy}>
        <SelectTrigger id="wa-provider" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="meta">Meta WhatsApp Cloud API</SelectItem><SelectItem value="fonnte">Fonnte</SelectItem></SelectContent>
      </Select>
    </div>
    {provider === "fonnte" ? <div className="space-y-2">
      <Label htmlFor="fonnte-token">Fonnte token</Label>
      <Input id="fonnte-token" type="password" autoComplete="new-password" value={token} disabled={busy} onChange={(e) => setToken(e.target.value)} placeholder="Enter token to set or replace" />
      <p className="text-sm text-muted-foreground">{settings.data?.tokenConfigured ? "Token configured. Leave blank to keep it." : "Token not configured."}</p>
      <p className="text-xs text-muted-foreground">Fonnte requires a connected WhatsApp device and an active plan. WhatsApp account restrictions remain possible.</p>
    </div> : <p className="text-sm text-muted-foreground">Meta requires a connected account and an approved booking message template.</p>}
    <div className="adm-set-actions"><Button onClick={saveSettings} disabled={busy || !dirty}><Save className="size-4" />Save settings</Button></div>
    </section>
    <section className="adm-set-card"><header><h2>Test notification</h2><p>Sends one message through the saved provider.</p></header>
      <p className="text-sm text-muted-foreground">{own.data ? <>The test goes to your verified number <b dir="ltr" className="text-foreground">{own.data}</b>.</> : <>Verify your own WhatsApp number in <Link to="/account" className="text-gold underline">Account settings</Link> first. Receiving the code also tests the connection.</>}</p>
      <Button variant="outline" onClick={sendTest} disabled={busy || dirty || !own.data}><Send className="size-4" />Send test to my number</Button>
      {result && <p role="status" className="text-sm break-words">{result}</p>}
    </section>
    <section className="adm-set-card is-wide"><OtpRequirement /></section>
  </div>;
}

/** The emergency switch for the one-time code, for when WhatsApp cannot send. */
export function OtpRequirement() {
  const qc = useQueryClient();
  const setting = useQuery({
    queryKey: ["whatsapp-otp-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("value").eq("key", "whatsapp_otp").maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.value ?? {}) as { required?: boolean; since?: string };
    },
  });
  const [busy, setBusy] = useState(false);
  const required = setting.data?.required !== false;
  const change = async (next: boolean) => {
    setBusy(true);
    const value = { required: next, since: setting.data?.since ?? new Date().toISOString() };
    const { error } = await supabase.from("site_settings").upsert({ key: "whatsapp_otp", value, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "WhatsApp verification is required" : "WhatsApp verification is switched off");
    await Promise.all([qc.invalidateQueries({ queryKey: ["whatsapp-otp-admin"] }), qc.invalidateQueries({ queryKey: ["whatsapp-otp"] })]);
  };
  return <div className="space-y-2">
    <h3 className="font-display text-[28px] font-normal leading-tight">Verification codes (OTP)</h3>
    <div className="flex items-center gap-3"><Switch id="wa-otp" checked={required} disabled={busy || setting.isPending || setting.isError} onCheckedChange={(next) => void change(next)} /><Label htmlFor="wa-otp">Require a WhatsApp code for new talent, bookings and chats</Label></div>
    <p className="text-sm text-muted-foreground">Switch this off only while WhatsApp cannot send, so people can still register and book. Codes are sent through Fonnte.</p>
    {setting.isError && <p role="alert" className="text-sm text-destructive">Unable to load this setting.</p>}
  </div>;
}
