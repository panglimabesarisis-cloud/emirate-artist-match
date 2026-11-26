// Invoice data for the payment status page. Callers must already have proved the viewer may see this order
// (artist ownership or the secret booking/chat key); this only reads.
import { buildReceipt, orderLabel, planLater, type Receipt } from "./receipt";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export async function orderReceipt(orderId: string, email?: string | null): Promise<Receipt | null> {
  const database = await db();
  const { data: order } = await database.from("payment_orders").select("id, artist_id, kind, target_id, plan_code, credits, amount_minor, created_at, paid_at, status").eq("id", orderId).single();
  if (!order || order.status !== "paid") return null;
  const { data: artist } = await database.from("artists").select("stage_name, intended_plan").eq("id", order.artist_id).single();
  let billTo = artist?.stage_name ?? "Dealmaker customer";
  let billEmail = email ?? null;
  let artistName: string | null = null;
  let title: string | null = null;
  if (order.kind === "booking" && order.target_id) {
    const { data: booking } = await database.from("bookings").select("client_name, client_email, package_title").eq("id", order.target_id).single();
    billTo = booking?.client_name ?? "Client"; billEmail = booking?.client_email ?? null; artistName = artist?.stage_name ?? null; title = booking?.package_title ?? null;
  } else if (order.kind === "invoice" && order.target_id) {
    const { data: invoice } = await database.from("service_invoices").select("number, booking_id, conversation_id").eq("id", order.target_id).single();
    const booking = invoice?.booking_id ? (await database.from("bookings").select("client_name, client_email").eq("id", invoice.booking_id).single()).data : null;
    const chat = invoice ? (await database.from("conversations").select("client_name, quote_requests(name, email)").eq("id", invoice.conversation_id).single()).data : null;
    billTo = booking?.client_name ?? chat?.quote_requests?.name ?? chat?.client_name ?? "Client";
    billEmail = booking?.client_email ?? chat?.quote_requests?.email ?? null;
    artistName = artist?.stage_name ?? null; title = invoice?.number ?? null;
  } else if (order.kind === "addon" && order.target_id) {
    title = (await database.from("addons").select("name").eq("id", order.target_id).maybeSingle()).data?.name ?? null;
  }
  let later: Receipt["later"] = [];
  if (order.kind === "deposit") {
    const code = artist?.intended_plan ?? order.plan_code ?? "free";
    const { data: tier } = await database.from("plan_tiers").select("name, price_monthly").eq("code", code).maybeSingle();
    later = planLater(tier ? { name: tier.name, monthly: Number(tier.price_monthly) } : null);
  }
  return buildReceipt({ reference: order.id, label: orderLabel(order.kind, { credits: order.credits, title }), totalWithVat: order.amount_minor / 100, issued: order.created_at, paidAt: order.paid_at ?? order.created_at, billTo, billEmail, artist: artistName, later });
}

export async function subscriptionReceipt(artistId: string, email?: string | null): Promise<Receipt | null> {
  const database = await db();
  const { data: sub } = await database.from("artist_subscriptions").select("id, plan_code, billing_interval, period_start, paid_until").eq("artist_id", artistId).eq("environment", "sandbox").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!sub?.paid_until) return null;
  const [{ data: tier }, { data: artist }] = await Promise.all([
    database.from("plan_tiers").select("name, price_monthly, price_yearly").eq("code", sub.plan_code).single(),
    database.from("artists").select("stage_name").eq("id", artistId).single(),
  ]);
  if (!tier) return null;
  const yearly = sub.billing_interval === "year";
  const price = Number(yearly ? tier.price_yearly : tier.price_monthly);
  return buildReceipt({ reference: sub.id, label: `${tier.name} plan subscription (${yearly ? "yearly" : "monthly"})`, detail: `Paid until ${new Date(sub.paid_until).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}`, totalWithVat: Math.round(price * 1.05 * 100) / 100, issued: sub.period_start, paidAt: sub.period_start, billTo: artist?.stage_name ?? "Talent", billEmail: email ?? null });
}
