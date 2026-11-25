/** A new invoice number with the prefix saved in Admin → Settings → Invoice ("DM" when none can be read). */
export async function newInvoiceNumber(now = new Date()) {
  let prefix = "DM";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("invoice_prefix");
    if (typeof data === "string" && /^[A-Z0-9]{1,8}$/.test(data)) prefix = data;
  } catch { /* the default prefix still gives a unique number */ }
  return `${prefix}-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}
