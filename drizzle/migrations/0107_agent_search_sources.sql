-- Websites the Personal AI Agent checks first, per topic.
CREATE TABLE public.agent_search_sources (
  topic text NOT NULL CHECK (topic IN ('flight', 'hotel', 'hospital', 'research')),
  domain text NOT NULL CHECK (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic, domain)
);
REVOKE ALL ON public.agent_search_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_search_sources TO authenticated;
GRANT ALL ON public.agent_search_sources TO service_role;
ALTER TABLE public.agent_search_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_search_sources_read ON public.agent_search_sources FOR SELECT TO authenticated USING (public.admin_can('settings', 'read'));
CREATE POLICY agent_search_sources_insert ON public.agent_search_sources FOR INSERT TO authenticated WITH CHECK (public.admin_can('settings', 'edit'));
CREATE POLICY agent_search_sources_update ON public.agent_search_sources FOR UPDATE TO authenticated USING (public.admin_can('settings', 'edit')) WITH CHECK (public.admin_can('settings', 'edit'));
CREATE POLICY agent_search_sources_delete ON public.agent_search_sources FOR DELETE TO authenticated USING (public.admin_can('settings', 'delete'));
INSERT INTO public.agent_search_sources (topic, domain) VALUES
  ('flight', 'wego.com.sg'), ('flight', 'flightconnections.com'), ('flight', 'flyteam.jp'), ('flight', 'emirates.com'),
  ('flight', 'aviability.com'), ('flight', 'traveloka.com'), ('flight', 'airpaz.com');
