import { FileText } from "lucide-react";
import type { ChatAttachment } from "@/lib/chat-attachments";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ChatAttachments({ files }: { files: ChatAttachment[] }) {
  return <div className="mt-2 grid gap-2">{files.map(file => <div key={file.path} className="min-w-0 overflow-hidden rounded-lg border bg-card text-card-foreground">
    {file.url && file.type.startsWith("image/") ? <Dialog><DialogTrigger asChild><Button variant="ghost" className="h-auto w-full p-0" aria-label={file.name}><img src={file.url} alt={file.name} className="max-h-52 w-full object-contain" /></Button></DialogTrigger><DialogContent className="max-w-3xl"><DialogTitle className="break-words">{file.name}</DialogTitle><img src={file.url} alt={file.name} className="max-h-[70dvh] w-full object-contain" /></DialogContent></Dialog> : file.url && file.type.startsWith("video/") ? <video src={file.url} controls preload="metadata" className="max-h-52 w-full" /> : null}
    <div className="flex min-w-0 items-center gap-2 p-2 text-xs"><FileText className="size-4 shrink-0" />{file.url ? <a href={file.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words underline">{file.name}</a> : <span className="break-words">{file.name}</span>}</div>
  </div>)}</div>;
}