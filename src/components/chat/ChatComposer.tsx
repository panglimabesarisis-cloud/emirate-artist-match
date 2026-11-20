import { useEffect, useRef } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { ATTACHMENT_TYPES, type ChatAttachment } from "@/lib/chat-attachments";

export function ChatComposer({ text, onChange, onSend, busy, files = [], onFiles, onRemove }: { text: string; onChange: (text: string) => void; onSend: () => void; busy: boolean; files?: ChatAttachment[]; onFiles?: (files: FileList) => void; onRemove?: (path: string) => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => { const el = input.current; if (el) { el.style.height = "0px"; el.style.height = `${Math.min(192, Math.max(44, el.scrollHeight))}px`; } }, [text]);
  return <div className="rounded-2xl border bg-card p-2 shadow-card focus-within:border-gold">
    {files.length > 0 && <div className="flex flex-wrap gap-2 p-1">{files.map(file => <div key={file.path} className="flex min-w-0 max-w-full items-center gap-1 rounded-md bg-muted ps-2 text-xs"><span className="truncate">{file.name}</span><Button variant="ghost" size="icon" className="size-7 shrink-0" disabled={busy} aria-label={t("Remove attachment")} title={t("Remove attachment")} onClick={() => onRemove?.(file.path)}><X className="size-3" /></Button></div>)}</div>}
    <Textarea ref={input} rows={1} value={text} maxLength={1000} onChange={e => onChange(e.target.value)} placeholder={t("Type your message…")} aria-label={t("Type your message…")} className="min-h-11 max-h-48 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend(); } }} />
    <div className="flex items-center justify-between gap-2">
      {onFiles ? <><input ref={upload} type="file" accept={ATTACHMENT_TYPES.join(",")} multiple className="hidden" onChange={e => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} /><Button type="button" size="icon" variant="ghost" disabled={busy || files.length >= 3} aria-label={t("Attach file")} title={t("Attach file")} onClick={() => upload.current?.click()}><Paperclip className="size-5" /></Button></> : <span />}
      <Button type="button" onClick={onSend} disabled={busy || (!text.trim() && !files.length)} size="icon" aria-label={t("Send")} title={t("Send")} className="size-9 shrink-0 rounded-full"><Send className="size-4" /></Button>
    </div>
  </div>;
}