import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  const [phone, setPhone] = useState("");
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
      const r = await test({ data: { phone } });
      setResult(r.status === "accepted" ? "Request accepted. Check the recipient's WhatsApp; delivery is not yet verified." : r.error ?? "Provider setup is incomplete.");
    } catch (error) { setResult(error instanceof Error ? error.message : "Unable to send test"); }
    finally { setBusy(false); }
  };
  return <div className="max-w-3xl space-y-6">
    <h2 className="font-semibold">WhatsApp notifications</h2>
    <div className="space-y-2"><Label htmlFor="wa-provider">Provider</Label>
      <Select value={provider} onValueChange={(v) => { setProvider(whatsappProvider(v)); setResult(""); }} disabled={busy}>
        <SelectTrigger id="wa-provider" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="meta">Meta WhatsApp Cloud API</SelectItem><SelectItem value="fonnte">Fonnte</SelectItem></SelectContent>
      </Select>
    </div>
    {provider === "fonnte" ? <div className="space-y-2">
      <Label htmlFor="fonnte-token">Fonnte token</Label>
      <Input id="fonnte-token" type="password" autoComplete="new-password" value={token} disabled={busy} onChange={(e) => setToken(e.target.value)} placeholder="Enter token to set or replace" />
      <p className="text-sm text-muted-foreground">{settings.data?.tokenConfigured ? "Token configured. Leave blank to keep it." : "Token not configured."}</p>
      <p className="text-xs text-muted-foreground">Fonnte requires a connected WhatsApp device and an active plan. WhatsApp account restrictions remain possible.</p>
    </div> : <p className="text-sm text-muted-foreground">Meta requires a connected account and an approved booking message template.</p>}
    <Button onClick={saveSettings} disabled={busy || !dirty}><Save className="size-4" />Save settings</Button>
    <div className="space-y-3 border-t pt-5">
      <h3 className="font-medium">Test notification</h3>
      <Label htmlFor="wa-test-phone">Recipient WhatsApp number</Label>
      <Input id="wa-test-phone" type="tel" placeholder="+971501234567" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
      <Button variant="outline" onClick={sendTest} disabled={busy || dirty || !phone.trim()}><Send className="size-4" />Send test</Button>
      {result && <p role="status" className="text-sm break-words">{result}</p>}
    </div>
    <OtpRequirement />
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
  return <div className="space-y-2 border-t pt-5">
    <h3 className="font-medium">Verification codes (OTP)</h3>
    <div className="flex items-center gap-3"><Switch id="wa-otp" checked={required} disabled={busy || setting.isPending || setting.isError} onCheckedChange={(next) => void change(next)} /><Label htmlFor="wa-otp">Require a WhatsApp code for new talent, bookings and chats</Label></div>
    <p className="text-sm text-muted-foreground">Switch this off only while WhatsApp cannot send, so people can still register and book. Codes are sent through Fonnte.</p>
    {setting.isError && <p role="alert" className="text-sm text-destructive">Unable to load this setting.</p>}
  </div>;
}
