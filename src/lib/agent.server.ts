import { decodeChatMessage } from "./chat-attachments";
import { clientNameFromMessages } from "./chat-client-name";
import { ensureAgentForm, nextSavedForm, reachableForms } from "./agent-forms";
import { ensureAgentButtons, reachableButtons } from "./agent-buttons";
import { calendarWindow } from "./calendar-rules";
import { decodeInvoice } from "./invoice";
import { agentRates, negotiationFloor, sellingPoints } from "./agent-pricing";
import { clientTravelDistance, travelPrompt } from "./travel-rules";
import { approvalPriceRule, selectedWhatsAppStep } from "./agent-approval";
import { generateResponse, GatewayError, type ResponsesInputItem } from "@lovable.dev/ai-gateway";
import { checkGoogleAvailability } from "./calendar-availability.server";
import { artistApprovalDraft, type CalendarCheck } from "./calendar-rules";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequest } from "@tanstack/react-start/server";
import { extractDraft, priceBreakdown, type BookingDraft } from "./booking-rules";
import { notifyBooking, notifyConversation, artistContact, siteOrigin } from "./notify.server";
import { formatBookingConfirm, formatEventDate } from "./booking-message";
import { incomingFlow, verifiedArtistDecision, artistDecisionBranch, invoiceWorkflow, approvalAction, flowToPrompt, flowKnowledgePrompt, DEFAULT_FLOW, type FlowNode, type FlowEdge } from "./ai-flow";
import { MAX_AI_REPLIES_PER_CONVERSATION, maskContacts } from "./masking";

import { replyLengthRule, languageRule, handoffRule, addUsage, newUsage, type Usage } from "./agent-options";
import { artistAgentModel } from "./agent-task-routing";
import { assertAgentTaskContext } from "./agent-task-cost";
import { catalogModel } from "./chat-model-catalog";
import { AgentPricingUnavailableError, reserveAgentTask, settleAgentTask } from "./agent-task-billing.server";

export async function addMessage(conversationId: string, sender: string, body: string) {
  await supabaseAdmin.from("messages").insert({ conversation_id: conversationId, sender, body: body.slice(0, 4000) });
  await supabaseAdmin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
  if (sender === "client") {
    // Remember the client's name the first time they give it, so the Inbox can show it instead of "Direct chat".
    const name = clientNameFromMessages([decodeChatMessage(body).text]);
    if (name) await supabaseAdmin.from("conversations").update({ client_name: name }).eq("id", conversationId).is("client_name", null);
  }
}

/** Runs the artist's AI agent for one reply, charging the artist's credit wallet. */
export async function runAgent(conversationId: string, artistDecisionBookingId?: string) {
  const { data: convo } = await supabaseAdmin.from("conversations").select("*").eq("id", conversationId).single();
  if (!convo || convo.mode !== "ai") return;

  const [{ data: artist }, { data: settings }, { data: wallet }, { data: rates }, { data: quote }, { data: history }, { data: allStats }, { data: badges }] =
    await Promise.all([
      supabaseAdmin.from("artists").select("user_id, stage_name, bio, base_price, languages, travel_radius_km, travel_surcharge_enabled, travel_step_km, travel_fee_per_step, areas(name), subcategories(name)").eq("id", convo.artist_id).single(),
      supabaseAdmin.from("agent_settings").select("*").eq("artist_id", convo.artist_id).maybeSingle(),
      supabaseAdmin.from("credit_wallets").select("balance,balance_fraction").eq("artist_id", convo.artist_id).maybeSingle(),
      supabaseAdmin.from("rate_cards").select("title, price, price_low, price_high, duration_minutes, description, unit_label, rules_of_work, items").eq("artist_id", convo.artist_id).order("sort"),
      convo.quote_request_id
        ? supabaseAdmin.from("quote_requests").select("name, event_date, guests, budget, message, start_time, end_time, perform_minutes, event_types(name), areas(name)").eq("id", convo.quote_request_id).single()
        : Promise.resolve({ data: null }),
      supabaseAdmin.from("messages").select("sender, body").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.rpc("artist_public_stats"),
      supabaseAdmin.from("artist_badges").select("badge").eq("artist_id", convo.artist_id),
    ]);

  history?.reverse(); // Retain the latest progress instead of freezing at the first forty messages.
  const handover = async (why: string) => {
    const { data: changed, error } = await supabaseAdmin.from("conversations").update({ mode: "human", chat_operator_id: null, handover_requested_at: new Date().toISOString() }).eq("id", conversationId).eq("mode", "ai").select("id");
    if (error) throw error;
    if (!changed?.length) return;
    await addMessage(conversationId, "system", why);
    if (convo.quote_request_id || convo.client_user_id) await notifyConversation(conversationId, "chat_takeover", "Apakah Anda ingin mengambil alih chat?", why);
  };

  if (!artist) return;
  const ownerUserId = artist.user_id;
  if (settings && !settings.enabled) return handover(`${artist.stage_name} will reply to you personally.`);
  if (Number(wallet?.balance ?? 0) + Number(wallet?.balance_fraction ?? 0) <= 0) return handover(`${artist.stage_name} will reply to you personally shortly.`);
  if (convo.ai_replies >= MAX_AI_REPLIES_PER_CONVERSATION) return handover(`I've passed this conversation to ${artist.stage_name} directly.`);

  const { data: flows } = await supabaseAdmin.from("ai_flows").select("artist_id, enabled, nodes, edges").or(`artist_id.is.null,artist_id.eq.${convo.artist_id}`);
  const own = flows?.find((f) => f.artist_id === convo.artist_id && f.enabled && Array.isArray(f.nodes) && f.nodes.length);
  const master = flows?.find((f) => f.artist_id === null && Array.isArray(f.nodes) && f.nodes.length);
  const savedFlow = own ?? master;
  const source = convo.entry_source === "incoming_form" || convo.quote_request_id ? "incoming_form" : "incoming_message";
  const selectedFlow = incomingFlow((savedFlow?.nodes ?? DEFAULT_FLOW.nodes) as FlowNode[], (savedFlow?.edges ?? DEFAULT_FLOW.edges) as FlowEdge[], source);
  const flow = savedFlow ? { ...savedFlow, nodes: selectedFlow.nodes, edges: selectedFlow.edges } : null;
  const forms = reachableForms(flow?.nodes as FlowNode[] ?? DEFAULT_FLOW.nodes, flow?.edges as FlowEdge[] ?? DEFAULT_FLOW.edges);
  const buttons = reachableButtons(flow?.nodes as FlowNode[] ?? DEFAULT_FLOW.nodes, flow?.edges as FlowEdge[] ?? DEFAULT_FLOW.edges);
  const flowSteps = flow ? flowToPrompt(flow.nodes as FlowNode[], flow.edges as FlowEdge[]) : flowToPrompt(DEFAULT_FLOW.nodes, DEFAULT_FLOW.edges);
  const action = flow ? approvalAction(flow.nodes as FlowNode[], flow.edges as FlowEdge[]) : null;
  const selectedApproval = flow ? selectedWhatsAppStep(flow.nodes as FlowNode[], flow.edges as FlowEdge[], history ?? []) : null;

  let decisionInstruction = "";
  {
    let decisionQuery = supabaseAdmin.from("bookings").select("id,status,cancelled_by,cancel_reason,package_title,event_date,paid_amount,total").eq("conversation_id", conversationId).eq("artist_id", convo.artist_id);
    if (artistDecisionBookingId) decisionQuery = decisionQuery.eq("id", artistDecisionBookingId);
    const { data: verified, error } = await decisionQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Artist decision unavailable");
    if (artistDecisionBookingId && !verified) throw new Error("Artist decision unavailable");
    if (verified && flow) {
    const decision = verifiedArtistDecision(verified);
    const branch = decision ? artistDecisionBranch(flow.nodes as FlowNode[], flow.edges as FlowEdge[], decision) : null;
    if (decision && branch) decisionInstruction = `VERIFIED ARTIST RESPONSE: ${decision.toUpperCase()} for ${verified.package_title} on ${verified.event_date}. ${decision === "no" ? `Decline reason: ${verified.cancel_reason}. No invoice or payment is allowed for this cancelled booking.` : "The artist approved the invoice; payment is not confirmed."} ${artistDecisionBookingId ? "Resume now" : "Continue from the conversation's progress"} on the WhatsApp ${decision.toUpperCase()} branch, starting with this saved step: ${JSON.stringify({ type: branch.type, instructions: branch.data.text, fields: branch.data.fields, buttons: branch.data.buttons })}. Do not restart the greeting, request approval again for this booking, or follow the opposite branch. Follow its outgoing steps. All pricing, invoice and payment safety rules still apply.`;
    }
  }

  const invoiceAction = invoiceWorkflow(flow?.nodes as FlowNode[] ?? DEFAULT_FLOW.nodes, flow?.edges as FlowEdge[] ?? DEFAULT_FLOW.edges);
  const {data: existingBooking} = await supabaseAdmin.from("bookings").select("status,artist_invoice_required,paid_amount,total").eq("conversation_id",conversationId).is("deleted_at",null).in("status",["inquiry","quoted","confirmed"]).limit(1).maybeSingle();
  const maxDiscount = settings?.max_discount_pct ?? 10;
  const pricing = agentRates(rates ?? [], artist.base_price);
  // An artist-set lowest price wins over the plan discount; createDraft clamps to this.
  const floor = negotiationFloor(rates ?? [], artist.base_price, maxDiscount);

  const confirm = quote ? formatBookingConfirm({ name: quote.name, artistName: artist.stage_name, eventDate: quote.event_date, venue: quote.areas?.name ?? null,
    startTime: quote.start_time?.slice(0, 5) ?? null, endTime: quote.end_time?.slice(0, 5) ?? null, performMinutes: quote.perform_minutes, guests: quote.guests, budget: quote.budget ? Number(quote.budget) : null }) : null;
  const aiCount = (history ?? []).filter((m) => m.sender === "ai").length;
  // First reply is a fixed confirmation of the booking details; no AI call needed.
  if (confirm && aiCount === 0 && !artistDecisionBookingId && !selectedFlow.triggered) {
    const firstClientMessage = (history ?? []).find(message => message.sender === "client")?.body ?? "";
    const summary = `Hi ${quote?.name ?? ""}, thank you for contacting ${artist.stage_name}. I have received your event details.\n${quote?.event_types?.name ? `Event: ${quote.event_types.name}\n` : ""}${confirm.split("\n---\n")[1] ?? ""}\n${firstClientMessage.includes("Packages:") ? firstClientMessage.slice(firstClientMessage.indexOf("Packages:"), firstClientMessage.indexOf("\n---", firstClientMessage.indexOf("Packages:")) > 0 ? firstClientMessage.indexOf("\n---", firstClientMessage.indexOf("Packages:")) : undefined) : ""}\nYour budget is not a confirmed price. Availability and the final offer require verification and artist approval. Would you like to continue with these details, or change anything?\n[BUTTONS: Continue with these details | Change event details]`;
    await addMessage(conversationId, "ai", maskContacts(summary));
    return;
  }
  const MODEL = artistAgentModel(settings?.model, { text: decodeChatMessage((history ?? []).slice().reverse().find(m => m.sender === "client")?.body ?? "").text, privateAgent: false, bookingInProgress: !!existingBooking || !!artistDecisionBookingId });
  const promptAddons = await enabledPromptText(convo.artist_id);
  // A stats or badge read that comes back in an unexpected shape must not end the turn.
  const track = sellingPoints(Array.isArray(allStats) ? allStats.find(r => r.artist_id === convo.artist_id) ?? null : null, Array.isArray(badges) ? badges.map(b => b.badge) : []);
  const instructions = `You are the AI booking assistant for ${artist.stage_name}, a ${artist.subcategories?.name ?? "performer"} based in ${artist.areas?.name ?? "Dubai"}, UAE. Always say you are an AI assistant if asked.
Tone: ${settings?.tone ?? "warm and professional"}. ${languageRule(settings?.languages)} ${replyLengthRule(settings?.reply_length)} Write plain text only — no markdown, asterisks or headings. Today is ${new Date().toISOString().slice(0, 10)} (Asia/Dubai); assume the next upcoming occurrence of any date without a year.
Goal: ${flow ? "Follow the active saved CONVERSATION FLOW, one client-facing step per reply. Do not collect event details, offer packages, or request approval ahead of the card that asks for them. Generic booking goals do not override this flow." : "Collect missing event details following the default conversation flow, one interactive step at a time."}
PRICING RULES (strict):
${invoiceAction ? "Artist-priced invoice workflow: collect schedule and job_detail, confirm client wants to proceed if available. The artist supplies final prices through their approval link. Do not request price agreement yet or invent a payable total." : pricing.text}\n${track}
- Only quote the stored prices above, in AED. Prices exclude 5% VAT.
${approvalPriceRule(!!action, !!invoiceAction, pricing.startingOnly, pricing.minimum, maxDiscount, floor)}
${travelPrompt(artist, clientTravelDistance((history ?? []).filter(m => m.sender === "client").map(m => decodeChatMessage(m.body).text)))}
AVAILABILITY (strict): use check_calendar to check the artist's live Google Calendar for the client's current requested date and hours (Asia/Dubai). Manual blocked dates and old calendar instructions are not availability evidence. Call the tool before claiming available/busy, following a calendar branch, or emitting BOOKING_READY. Recheck whenever the client changes date or hours. If hours are missing, ask for them before booking. A date-only check is preliminary. If status is unknown or Calendar is not connected, keep chatting and collecting details following the configured flow. Never assume available or busy. Explain the artist must confirm the schedule. You may emit BOOKING_READY only as a pending artist approval request after the client consents to proceed subject to artist confirmation; never issue invoices, payment links or reserve dates before artist approval. Do not emit HANDOVER solely because Calendar is missing. Only verified available means the Available branch, verified busy means Busy. Do not reveal private event titles or attendees. Never confirm a booking yourself; the artist must approve.
Never share or ask for phone numbers, emails or social handles — all communication stays on the platform.
BOOKING HAND-OFF: ${action ? "when the client selects the saved choice leading to Send to WhatsApp (for example Book Now), immediately request artist review, without asking for price agreement. Use all previously supplied event/venue details; do not ask again for an area when a venue/address already identifies it" : invoiceAction ? "once the client explicitly agrees to proceed with the schedule (verified available or subject to artist confirmation) (artist will supply invoice prices next)" : "once the client has agreed to a package price (or explicitly accepted the disclosed starting-rate estimate when there are no packages)"} AND you know the event date, area, timing and guest count, call check_calendar on this turn, then tell them you are requesting ${artist.stage_name}'s approval (do not claim WhatsApp delivery), and end your reply with exactly:
[BOOKING_READY {"title":"<package name>","amount":<agreed price in AED excl. VAT, number>,"date":"YYYY-MM-DD","clientName":"<client name>","jobDetail":"<all client job details>","notes":"<event type, area/venue, timing, guests, special requests>","organizing":"<client or organizer>","clientOccupation":"<organization or occupation>","venueName":"<venue name>","venueAddress":"<venue address>","eventType":"<event name/category>","indoorOutdoor":"<indoor or outdoor>","performDuration":"<artist performance duration>","wardrobe":"<wardrobe>","dresscode":"<dress code>","wardrobeRequest":"<wardrobe request>","preEventMeeting":"<pre-event meeting details>","rehearsalDate":"<rehearsal date>","rehearsalStart":"<rehearsal start time>","rehearsalEnd":"<rehearsal end time>","rehearsalLocation":"<rehearsal location>"}]
The keys organizing, clientOccupation, venueName, venueAddress, eventType, indoorOutdoor, performDuration, wardrobe, dresscode, wardrobeRequest, preEventMeeting, rehearsalDate, rehearsalStart, rehearsalEnd and rehearsalLocation are OPTIONAL strings. Fill each only from details the client already gave in this conversation, including saved form answers. Omit a key when unknown; never invent a value or ask extra questions to fill these optional keys. Keep title, amount, date, clientName, jobDetail and notes.
Use this token only once per conversation. ${existingBooking ? `Current server booking state: ${JSON.stringify(existingBooking)}. Do not emit BOOKING_READY again. Await artist invoice when inquiry, direct client to existing invoice/contract when quoted, acknowledge actual paid amount only when confirmed.` : ''}
QUICK REPLIES (strict): When reaching a saved Buttons step, call show_buttons with its nodeId and write only that card's question. The server displays its exact saved choices. NEVER turn choices into a prose list, merge in later event questions, or advance before the client selects an option. If no tool call is used, put the exact [BUTTONS: ...] token on the last line. Available saved buttons: ${JSON.stringify(buttons.map(node => ({ nodeId: node.id, choices: node.data.buttons })))}.
INTERACTIVE FORMS (strict): When reaching a saved Form step, call show_form with its nodeId and write only a brief introduction. The server displays the saved fields. NEVER rewrite the fields as a list of questions or ask for them in plain text. If no tool call is used, append the exact [FORM: ...] token from that step on the final line. A Form is an interactive step, not a prose instruction. Pause for its submission; skip it only if ALL its fields have already been supplied, not just a name or one known detail. Do not show disconnected forms or forms on an unchosen branch. Available saved forms: ${JSON.stringify(forms.map(node => ({ nodeId: node.id, fields: node.data.fields })))}.
VARIABLES: {name} in a flow step means the value the client gave earlier (e.g. {client_name}); write the actual value, never the braces.
Follow the configured Knowledge, Reply instructions and AI Flow for handover. When those rules suggest human help, first ask the client whether they want to speak to the artist. Emit [HANDOVER] only after the client agrees or explicitly requests the artist. Never claim the artist has taken control before they press Take Over.
${handoffRule(settings?.handoff)}
${settings?.extra_instructions ? `ARTIST REPLY INSTRUCTIONS (follow unless they conflict with the pricing or safety rules above):\n${settings.extra_instructions}` : ""}
${settings?.knowledge ? `ARTIST KNOWLEDGE (facts you may use to answer; if something is not covered, say the artist will confirm):\n${settings.knowledge}` : ""}
${flowKnowledgePrompt(flow?.nodes as FlowNode[] ?? DEFAULT_FLOW.nodes)}
${promptAddons}
INCOMING SOURCE: ${source}. ${source === "incoming_form" ? "Use the Original request and supplied client message as saved form values. On the first response summarise name, event type, date, hours, duration, venue, guests, budget and chosen packages without treating budget as a price. Then follow only this trigger’s connected steps; no duplicate questions. Only say Calendar is being checked when the tool is actually called. Unknown availability needs artist confirmation, not a booking promise." : "Follow the Incoming Message connections."}
BOOKING CONFIRMATION: ${confirm ? 'Your first message showed booking details; continue from the saved flow using those known values.' : 'This is a direct chat; start at the saved greeting and follow its connections.'} Check Calendar at its saved step, not ahead of earlier questions or forms.
CONVERSATION FLOW (controls the order of questions; follow outgoing connections, exactly one client-facing step per reply. A greeting may introduce the first question, but STOP at every Question, Form or Buttons card and wait for its answer. Do not skip a form because only one field is known. Do not ask questions from future cards. Reply instructions may change tone but not flow order. Pricing, privacy, verified Calendar, artist approval and payment safety rules above always win):
${flowSteps}
${decisionInstruction}
${selectedApproval && !existingBooking && !artistDecisionBookingId ? `SERVER-RESOLVED NEXT STEP: The client selected the displayed button connected directly to WhatsApp node ${JSON.stringify(selectedApproval.id)}. Execute this step NOW: check_calendar using the saved date/hours, then emit BOOKING_READY with collected details if not busy. Do not display buttons/forms again or ask price consent. STOP pending verified artist YES/NO. Saved WhatsApp message context: ${JSON.stringify(selectedApproval.data.text)}.` : ''}
Original request: ${JSON.stringify(quote ?? {})}`;

  const input: ResponsesInputItem[] = (history ?? [])
    .filter((m) => m.sender !== "system" || decodeInvoice(m.body))
    .map((m) => ({ role: m.sender === "client" ? ("user" as const) : ("assistant" as const), content: invoiceText(m.body) }));

  const usage = newUsage();
  let taskId: string | undefined;
  try {
    let calendarCheck: CalendarCheck | undefined;
    const resolvedForm = artistDecisionBookingId || selectedApproval ? undefined : nextSavedForm(flow?.nodes as FlowNode[] ?? DEFAULT_FLOW.nodes, flow?.edges as FlowEdge[] ?? DEFAULT_FLOW.edges, history ?? []);
    let requestedFormId: string | undefined = resolvedForm?.id;
    let requestedButtonsId: string | undefined;
    const tools = [{ type: "function" as const, name: "check_calendar", description: "Check the artist's live Google Calendar. Use YYYY-MM-DD and HH:mm UAE times, null times for a preliminary whole-day check. No manual blocked dates.", strict: true, parameters: { type: "object", properties: { date: { type: "string" }, startTime: { type: ["string", "null"] }, endTime: { type: ["string", "null"] } }, required: ["date", "startTime", "endTime"], additionalProperties: false } },
      ...(forms.length ? [{ type: "function" as const, name: "show_form", description: "Display the current saved Form step as interactive inputs, never as a question list. Use the saved nodeId and wait for submission.", strict: true, parameters: { type: "object", properties: { nodeId: { type: "string", enum: forms.map(node => node.id) } }, required: ["nodeId"], additionalProperties: false } }] : []),
      ...(buttons.length ? [{ type: "function" as const, name: "show_buttons", description: "Display the current saved Buttons step with exact choices. Stop and wait for selection; never merge later questions.", strict: true, parameters: { type: "object", properties: { nodeId: { type: "string", enum: buttons.map(node => node.id) } }, required: ["nodeId"], additionalProperties: false } }] : [])];
    assertAgentTaskContext(input, instructions, tools);
    taskId = (await reserveAgentTask(convo.artist_id, conversationId, MODEL, input, instructions, 600)).taskId;
    let res = await generateResponse({ model: MODEL, reasoning: { effort: "low" }, instructions: resolvedForm ? `${instructions}\nSERVER-RESOLVED FORM: Display only saved form ${JSON.stringify(resolvedForm.id)}. Do not ask its fields individually or run Calendar before submission.` : instructions, input, tools, ...(resolvedForm ? { tool_choice: "none" as const } : {}), max_output_tokens: 600 });
    addUsage(usage, res);
    for (let round = 0; round < 3; round++) {
      const calls = res.output?.filter(item => item.type === "function_call") ?? [];
      if (!calls.length) break;
      for (const call of calls) {
        input.push({ type: "function_call", name: call.name, call_id: call.call_id, arguments: call.arguments });
        let output: unknown = { status: "unknown", reason: "Invalid calendar request" };
        if (requestedFormId || requestedButtonsId) {
          input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ paused: true, instruction: "An interactive card is already displayed. Wait for the client; do not advance or run actions." }) });
          continue;
        }
        if (call.name === "check_calendar") calendarCheck = undefined;
        try {
          const args: unknown = JSON.parse(call.arguments);
          if (call.name === "show_buttons" && args && typeof args === "object" && "nodeId" in args && typeof args.nodeId === "string") {
            const saved = buttons.find(node => node.id === args.nodeId);
            if (saved) {
              requestedButtonsId = saved.id;
              output = { displayed: true, question: saved.data.text, choices: saved.data.buttons, instruction: "Write only this card's question. The server appends its saved choices. Stop and wait for the client's selection. Do not ask anything from later cards." };
            }
          }
          if (call.name === "show_form" && args && typeof args === "object" && "nodeId" in args && typeof args.nodeId === "string") {
            const saved = forms.find(node => node.id === args.nodeId);
            if (saved) {
              requestedFormId = saved.id;
              output = { displayed: true, instruction: "Write only the brief introduction. The server appends the saved interactive fields. Stop here and wait for the client; do not call more tools or advance steps." };
            }
          }
          if (call.name === "check_calendar" && args && typeof args === "object" && "date" in args && typeof args.date === "string" && "startTime" in args && (args.startTime === null || typeof args.startTime === "string") && "endTime" in args && (args.endTime === null || typeof args.endTime === "string")) {
            calendarCheck = ownerUserId ? await checkGoogleAvailability(ownerUserId, { date: args.date, startTime: args.startTime, endTime: args.endTime }) : { status: "unknown", window: calendarWindow({ date: args.date, startTime: args.startTime, endTime: args.endTime }), reason: "Artist confirmation required; Calendar is not connected." };
            output = calendarCheck;
          }
        } catch { /* Invalid arguments are not evidence of availability. */ }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) });
      }
      assertAgentTaskContext(input, instructions, tools);
      res = await generateResponse({ model: MODEL, reasoning: { effort: "low" }, instructions, input, tools, ...(round === 2 || requestedFormId || requestedButtonsId ? { tool_choice: "none" as const } : {}), max_output_tokens: 600 });
      addUsage(usage, res);
    }
    let text = "";
    for (const item of res.output ?? []) {
      if (item.type === "message") for (const c of item.content) if (c.type === "output_text") text += c.text;
    }
    text = requestedButtonsId ? ensureAgentButtons(text.trim(), buttons, requestedButtonsId) : ensureAgentButtons(ensureAgentForm(text.trim(), forms, history ?? [], requestedFormId), buttons);
    await settleAgentTask(taskId, usage);
    taskId = undefined;
    const ex = extractDraft(text);
    if (ex.draft && !artistApprovalDraft(ex.draft.date, calendarCheck)) {
      await handover("The requested schedule could not be verified as available in Google Calendar. The artist will confirm it personally before a booking or invoice is sent.");
      return;
    }
    text = ex.text;
    const wantsHandover = text.includes("[HANDOVER]");
    text = maskContacts(text.replace("[HANDOVER]", "").replace(/\*\*|__|^#+\s/gm, "").trim());
    if (!text) return;
    const { data: current } = await supabaseAdmin.from("conversations").select("mode").eq("id", conversationId).single();
    if (current?.mode !== "ai") return;
    await addMessage(conversationId, "ai", text);
    await supabaseAdmin.from("conversations").update({ ai_replies: convo.ai_replies + 1 }).eq("id", conversationId);
    if (ex.draft && calendarCheck) {
      const fresh = ownerUserId ? await checkGoogleAvailability(ownerUserId, { date: ex.draft.date, startTime: calendarCheck.window.startTime, endTime: calendarCheck.window.endTime }) : calendarCheck;
      if (!artistApprovalDraft(ex.draft.date, fresh)) await handover("Google Calendar no longer confirms this slot is available. The artist will review the schedule personally.");
      else await createDraft(convo.id, convo.artist_id, ex.draft, floor, action, fresh, invoiceAction, pricing.minimum);
    }
    if (wantsHandover) await handover(`I've requested ${artist.stage_name} to take over this conversation.`);
  } catch (e) {
    if (taskId) {
      try { await settleAgentTask(taskId, usage, !usage.seen && e instanceof GatewayError && e.outcome === "not_started"); }
      catch { console.error("AI task reservation awaits review"); }
    }
    console.error("AI agent failed", e instanceof GatewayError ? { code: e.code, ids: e.ids } : e);
    if (e instanceof AgentPricingUnavailableError) {
      // Configuration failure is not an artist takeover or consent to one.
      // Preserve AI mode so a later message can proceed after rates are configured.
      await addMessage(conversationId, "system", "The AI assistant is temporarily unavailable. Your message is saved. Please try again later.");
      return;
    }
    await handover(`${artist.stage_name} will reply to you personally shortly.`);
  }
}

/** AI-drafted booking: stored as an inquiry that the artist must approve before the client can pay. */
async function createDraft(conversationId: string, artistId: string, d: BookingDraft, floor: number, action: ReturnType<typeof approvalAction>, calendar: CalendarCheck, invoiceAction: ReturnType<typeof invoiceWorkflow>, baseRef: number | null = null) {
  const { count } = await supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).is("deleted_at", null).in("status", ["inquiry", "quoted", "confirmed"]);
  if ((count ?? 0) > 0) return;
  if (!invoiceAction && !Number.isFinite(floor)) throw new Error("Artist pricing requires personal review");
  const amount = invoiceAction ? 0 : Number.isFinite(floor) ? Math.max(d.amount, Math.round(floor)) : d.amount;
  const { data: convo } = await supabaseAdmin.from("conversations").select("client_user_id, quote_requests(name, email, phone, event_type_id, guests, client_user_id)").eq("id", conversationId).single();
  const q = convo?.quote_requests;
  const p = priceBreakdown(amount);
  const { data: b, error: bookingError } = await supabaseAdmin.from("bookings").insert({
    artist_id: artistId, conversation_id: conversationId, client_user_id: convo?.client_user_id ?? q?.client_user_id ?? null, client_name: q?.name ?? maskContacts(d.clientName || "Client"), client_email: q?.email ?? null, client_phone: q?.phone ?? null,
    event_type_id: q?.event_type_id ?? null, guests: q?.guests ?? null, event_date: d.date, package_title: d.title,
    notes: maskContacts([d.notes, d.organizing ? `Client entity type: ${d.organizing}` : null, d.clientOccupation ? `Organization: ${d.clientOccupation}` : null, d.venueName ? `Venue: ${d.venueName}` : null, d.venueAddress ? `Venue address: ${d.venueAddress}` : null, d.performDuration ? `Performance duration: ${d.performDuration}` : null].filter(Boolean).join("\n")) || null,
    start_time: calendar.window.startTime, end_time: calendar.window.endTime, job_detail: maskContacts(d.jobDetail || d.notes), artist_invoice_required: !!invoiceAction, deposit_pct: invoiceAction ? 20 : 100,
    invoice_items: invoiceAction ? [{title:maskContacts(invoiceAction.description),qty:1,price:invoiceAction.price}] : [],
    amount: p.subtotal, vat_amount: p.vat, total: p.total, status: "inquiry", drafted_by: "ai", send_invoice_after_approval: action?.sendInvoice ?? false,
  }).select("id, artist_key").single();
  if (bookingError || !b) throw new Error(bookingError?.message ?? "Could not save approval request");
  // What the agent asked versus what the floor allowed. Never block a booking on the audit row.
  if (!invoiceAction) {
    const { error: auditError } = await supabaseAdmin.from("quote_negotiations").insert({
      booking_id: b.id, artist_id: artistId, conversation_id: conversationId,
      quoted: d.amount, final: amount, base: baseRef, floor: Number.isFinite(floor) ? floor : null,
    });
    if (auditError) console.error("quote_negotiations insert failed", auditError.message);
  }
  await addMessage(conversationId, "system", "Your booking is awaiting artist approval. An invoice or payment link will appear here once approved.");
  const c = await artistContact(artistId);
  if (action?.phone) c.phone = action.phone;
  const link = `${siteOrigin(getRequest())}/approve/${b.id}?k=${b.artist_key}`;
  const approvalBody = approvalMessageBody({
    ...d,
    subtotal: p.subtotal,
    name: q?.name, email: q?.email, phone: q?.phone,
    startTime: calendar.window.startTime, endTime: calendar.window.endTime,
  });
  await notifyBooking(b.id, "artist", "approval_request", c, `${invoiceAction ? "Fill invoice for booking" : "New booking to approve"}: ${d.title} on ${d.date}`,
    approvalBody, link);
}

/** Artist approval message: labelled lines, empty values dropped, sections split by "-----". */
function approvalMessageBody(f: BookingDraft & { subtotal: number; name: string | null | undefined; email: string | null | undefined; phone: string | null | undefined; startTime: string | null | undefined; endTime: string | null | undefined }) {
  const line = (label: string, value: unknown) => {
    const v = String(value ?? "").trim();
    return v ? `${label}: ${v}` : "";
  };
  const time = f.startTime || f.endTime ? `${f.startTime ?? ""}-${f.endTime ?? ""}` : "";
  return [
    ["Dealmaker Management"],
    [`Payment: AED ${f.subtotal.toLocaleString("en-US")} + 5% VAT`, line("PIC", f.name), line("Email", f.email), line("Phone", f.phone)],
    [line("Client", f.organizing), line("Organization", f.clientOccupation)],
    [line("Job Detail", f.jobDetail?.replace(/,\s*(?=(?:durasi\s+performa|\d[\d,.]*\s+tamu|pukul)\b)/gi, "\n" ).replace(/\n(?=durasi\s+performa)/i, "\n-----\n"))],
    [line("Venue Name", f.venueName), line("Event Name", f.eventType), line("Date Event", formatEventDate(f.date)), line("Event Time", time), line("Event Type", f.indoorOutdoor), line("Venue Address", f.venueAddress), line("Artist Perform Duration", f.performDuration)],
    [line("Wardrobe", f.wardrobe), line("DressCode", f.dresscode), line("Wardrobe request", f.wardrobeRequest)],
    [line("Pre-Event Meeting", f.preEventMeeting)],
    [line("Rehearsal Date", f.rehearsalDate), line("Time Start", f.rehearsalStart), line("End Time", f.rehearsalEnd), line("Location", f.rehearsalLocation)],
  ].map((section) => section.filter(Boolean).join("\n")).filter(Boolean).join("\n-----\n");
}

function invoiceText(body: string) {
  const inv = decodeInvoice(body);
  if (!inv) { const parsed = decodeChatMessage(body); return parsed.attachments.length ? `${parsed.text}\n[Client attached: ${parsed.attachments.map(file => `${file.name} (${file.type})`).join(", ")}. Files are available to the artist in Inbox. Do not claim to have read file contents.]` : body; }
  return `I sent invoice ${inv.no}: ${inv.items.map((i) => `${i.qty} x ${i.title} AED ${i.price}`).join(", ")}. Total AED ${inv.total} incl. 5% VAT${inv.due ? `, due ${inv.due}` : ""}.`;
}

const PROMPT_PRIORITY: Record<string, number> = { high: 0, medium: 1, low: 2 };
/** Enabled library prompts, appended below pricing/safety rules so those always win. */
async function enabledPromptText(artistId: string): Promise<string> {
  const { data: enabled } = await supabaseAdmin.from("agent_prompt_enabled").select("prompt_id").eq("artist_id", artistId);
  const ids = (enabled ?? []).map((e) => e.prompt_id);
  const { data: personal } = await supabaseAdmin.from("artist_own_prompts").select("kind,title,body,priority,applies_when").eq("artist_id", artistId).eq("enabled", true);
  const personalText = (personal ?? []).sort((a,b) => (PROMPT_PRIORITY[a.priority] ?? 1) - (PROMPT_PRIORITY[b.priority] ?? 1)).map(p => `[${p.kind}: ${p.title}; applies when ${p.applies_when}]\n${p.body}`).join("\n\n");
  if (!ids.length) return personalText;
  const [{ data: prompts }, { data: bought }] = await Promise.all([
    supabaseAdmin.from("agent_prompts").select("id,kind,title,body,priority,price_aed,is_active").in("id", ids).eq("is_active", true),
    supabaseAdmin.from("agent_prompt_purchases").select("prompt_id").eq("artist_id", artistId).not("paid_at", "is", null).is("refunded_at", null),
  ]);
  const owned = new Set((bought ?? []).map((b) => b.prompt_id));
  const usable = (prompts ?? []).filter((p) => p.body.trim() && (Number(p.price_aed) <= 0 || owned.has(p.id)))
    .sort((a, b) => (PROMPT_PRIORITY[a.priority] ?? 1) - (PROMPT_PRIORITY[b.priority] ?? 1));
  if (!usable.length) return personalText;
  return `ADDITIONAL ARTIST PROMPTS (follow only where they do not conflict with the pricing, privacy, calendar, approval or payment safety rules above):\n${personalText}\n${usable.map((p) => `[${p.kind === "know" ? "Knowledge" : "Instruction"}: ${p.title}]\n${p.body.slice(0, 4000)}`).join("\n\n")}`;
}

/** Ledger usage columns priced with the active rate snapshot; never throws. */
export async function usageColumns(u: Usage, MODEL: string) {
  if (!u.seen) return { model: MODEL, kind: "reply" };
  try {
    const { data: rate } = await supabaseAdmin.from("ai_model_rates").select("*").eq("model", MODEL).eq("is_active", true).maybeSingle();
    const billableIn = Math.max(0, u.inTok - u.cached);
    const cost = rate ? Math.round(billableIn * Number(rate.usd_in_per_mtok) + u.cached * Number(rate.usd_cached_per_mtok) + u.outTok * Number(rate.usd_out_per_mtok)) : null;
    return { model: MODEL, kind: "reply", tokens_in: u.inTok, tokens_cached: u.cached, tokens_out: u.outTok, cost_usd_micros: cost, rate_snapshot: rate ?? null };
  } catch {
    return { model: MODEL, kind: "reply", tokens_in: u.inTok, tokens_cached: u.cached, tokens_out: u.outTok };
  }
}
