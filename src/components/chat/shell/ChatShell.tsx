import { useState, type ReactNode } from "react";
import { CalendarCheck, ChevronUp, CircleAlert, CircleCheck, CreditCard, PanelLeft, Settings, Trophy, UserCog, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import "@/components/dashboard/studio.css";
import "@/components/dashboard/chat-fields.css";
import "./ai-chat.css";

export const CHAT_SETTINGS = [
  { id: "booking", label: "Booking Info", icon: CalendarCheck },
  { id: "unpaid", label: "Unpaid Invoice", icon: CircleAlert },
  { id: "paid", label: "Paid Invoice", icon: CircleCheck },
  { id: "account", label: "Account Setting", icon: UserCog },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "commission", label: "Komisi Fee", icon: Trophy },
] as const;
export type ChatSetting = (typeof CHAT_SETTINGS)[number]["id"];

export type RecentChat = { id: string; title: string; active: boolean; onOpen: () => void; onRemove?: () => void };

/**
 * The full-screen, AI-style chat layout: history and Settings on the left, one chat or settings page beside it.
 * There is no site header on these pages.
 */
export function ChatShell({ brand, top, recent, page, onPage, settings, hidden = [], children }: {
  brand: ReactNode;
  /** The main button above the history. */
  top: ReactNode;
  recent: RecentChat[];
  /** The settings page in view, or null for the chat. */
  page: ChatSetting | null;
  onPage: (page: ChatSetting | null) => void;
  settings: (page: ChatSetting) => ReactNode;
  /** Settings pages this side of the chat does not have. */
  hidden?: ChatSetting[];
  /** The chat. It receives the button that opens the sidebar on small screens. */
  children: (sidebarButton: ReactNode) => ReactNode;
}) {
  const { t } = useI18n();
  const [side, setSide] = useState(false);
  const [menu, setMenu] = useState(false);
  const sidebarButton = <Button type="button" size="icon" variant="outline" className="dmc-burger" aria-label={t("Chat history")} aria-expanded={side} onClick={() => setSide(true)}><PanelLeft className="h-[18px] w-[18px]" /></Button>;
  const current = CHAT_SETTINGS.find((item) => item.id === page);
  return (
    <div className="dmc">
      {side && <button type="button" className="dmc-scrim" aria-label={t("Close menu")} onClick={() => setSide(false)} />}
      <aside className={`dmc-side ${side ? "is-open" : ""}`} aria-label={t("Chat history")}>
        <div className="dmc-brand">{brand}</div>
        <div className="dmc-top">{top}</div>
        <div className="dmc-label">{t("Recent")}</div>
        <ul className="dmc-hist">
          {recent.length === 0 && <li className="dmc-none">{t("No chats yet.")}</li>}
          {recent.map((chat) => (
            <li key={chat.id} className={chat.active && !page ? "on" : ""}>
              <button type="button" className="dmc-open" aria-current={chat.active && !page ? "page" : undefined} onClick={() => { setSide(false); onPage(null); chat.onOpen(); }}>{chat.title}</button>
              {chat.onRemove && !chat.active && <button type="button" className="dmc-del" aria-label={`${t("Remove")} ${chat.title}`} onClick={chat.onRemove}><X className="h-3.5 w-3.5" /></button>}
            </li>
          ))}
        </ul>
        <div className="dmc-settings">
          {menu && (
            <nav className="dmc-menu" aria-label={t("Settings")}>
              {CHAT_SETTINGS.filter((item) => !hidden.includes(item.id)).map(({ id, label, icon: Icon }) => (
                <button type="button" key={id} aria-current={page === id ? "page" : undefined} onClick={() => { onPage(id); setSide(false); }}><Icon className="h-4 w-4" aria-hidden />{t(label)}</button>
              ))}
            </nav>
          )}
          <button type="button" className="dmc-toggle" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <Settings className="h-4 w-4" aria-hidden /><span>{t("Settings")}</span><ChevronUp className={`h-4 w-4 ${menu ? "rotate-180" : ""}`} aria-hidden />
          </button>
        </div>
      </aside>
      <section className="dmc-main">
        {/* The chat stays mounted behind a settings page, so a half-written message is not lost. */}
        <div className="dmc-chat" hidden={!!page}>{children(sidebarButton)}</div>
        {page && current && (
          <div className="dmc-page">
            <header className="dmc-hd">
              {sidebarButton}
              <h1 className="font-display">{t(current.label)}</h1>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => onPage(null)}>{t("Back to chat")}</Button>
            </header>
            <div className="dmc-body"><div className="dmc-col">{settings(page)}</div></div>
          </div>
        )}
      </section>
    </div>
  );
}
