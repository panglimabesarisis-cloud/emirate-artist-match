CREATE OR REPLACE FUNCTION public.guard_agent_model() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tier text;
BEGIN
IF NEW.model IS NOT NULL AND (TG_OP='INSERT' OR NEW.model IS DISTINCT FROM OLD.model) THEN
 tier := CASE
 WHEN NEW.model IN ('fast','balanced','advanced') THEN NEW.model
 WHEN NEW.model='openai/gpt-5.4-mini' THEN 'fast'
 WHEN NEW.model IN ('openai/chat-latest','openai/gpt-5.6-luna') THEN 'balanced'
 WHEN NEW.model IN ('openai/gpt-5.4','openai/gpt-5.5','openai/gpt-5.5-pro','openai/gpt-5.6-sol','openai/gpt-5.6-terra','openai/gpt-6-astra','openai/gpt-6-luna','openai/gpt-6-sol','openai/gpt-6.1-sol','openai/gpt-6.1-terra','openai/gpt-6.2-astra','openai/gpt-6.2-sol') THEN 'advanced'
 ELSE NULL END;
 IF tier IS NULL OR NOT EXISTS (SELECT 1 FROM public.plan_tiers WHERE code=public.effective_artist_plan(NEW.artist_id) AND tier=ANY(allowed_models)) THEN RAISE EXCEPTION 'This AI model is not included in your plan'; END IF;
END IF;
RETURN NEW;
END $$;