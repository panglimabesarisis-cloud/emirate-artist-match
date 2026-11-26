-- Agent chat attachments up to 500 MB, including video and audio.
ALTER TABLE public.agent_chat_files DROP CONSTRAINT agent_chat_files_bytes_check;
ALTER TABLE public.agent_chat_files ADD CONSTRAINT agent_chat_files_bytes_check CHECK (bytes > 0 AND bytes <= 524288000);
ALTER TABLE public.agent_chat_files DROP CONSTRAINT agent_chat_files_mime_check;
ALTER TABLE public.agent_chat_files ADD CONSTRAINT agent_chat_files_mime_check CHECK (mime IN (
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav'));
UPDATE storage.buckets SET file_size_limit = 524288000 WHERE id = 'agent-chat';
