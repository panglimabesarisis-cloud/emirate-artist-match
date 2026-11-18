ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS status_at timestamptz;
CREATE INDEX IF NOT EXISTS notifications_provider_msg ON public.notifications(provider_message_id);

CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read" ON public.whatsapp_webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX whatsapp_events_pending ON public.whatsapp_webhook_events(received_at) WHERE processed_at IS NULL;