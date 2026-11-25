/** The two WhatsApp messages sent when a client's chat opens. */
export type ChatSource = "form" | "chat";
export const chatTitle = (source: ChatSource) => (source === "form" ? "New Form Booking" : "New Chat Income");
const FOOTER = "---\nThank You\nDealmaker Team";

export const artistInquiry = (source: ChatSource) => ({
  headline: `NEW INCOMING INQUIRY\nDEALMAKER TALENT\n${chatTitle(source)}`,
  details: "You have one inquiry from a client. You can monitor it with this link:",
  footer: FOOTER,
});

export const clientWelcome = (source: ChatSource) => ({
  headline: `DEALMAKER TALENT\n${chatTitle(source)}`,
  details: "Thank you for choosing us as your partner in finding talent and artists. It is a pleasure to work with you. You can view your conversation at the following link:",
  footer: FOOTER,
});
