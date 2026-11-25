CREATE OR REPLACE FUNCTION public.artist_team_can(_artist uuid, _page text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT public.is_artist_owner(_artist) OR EXISTS (
  SELECT 1 FROM public.artist_members m LEFT JOIN public.team_roles r ON r.id=m.role_id AND r.artist_id=m.artist_id
  WHERE m.artist_id=_artist AND m.user_id=auth.uid() AND m.status='active'
   AND CASE WHEN m.role_id IS NULL THEN _page='inbox' ELSE _page=ANY(r.menus) END
 );
$$;
REVOKE ALL ON FUNCTION public.artist_team_can(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.artist_team_can(uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.artist_has_page(_page text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.artists a WHERE public.artist_team_can(a.id,_page));
$$;
REVOKE ALL ON FUNCTION public.artist_has_page(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.artist_has_page(text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.is_any_artist_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.artists WHERE user_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_any_artist_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_any_artist_owner() TO authenticated,service_role;

-- Rewrite only the team branch of each existing policy; preserve every other branch,
-- command, role and restrictive/permissive setting.
DO $migration$
DECLARE p record; page text; q text; c text; replacement text; statement text;
BEGIN
 FOR p IN SELECT schemaname,tablename,policyname,qual,with_check FROM pg_policies
 WHERE coalesce(qual,'') ~ 'is_artist_team|is_any_artist_team' OR coalesce(with_check,'') ~ 'is_artist_team|is_any_artist_team'
 LOOP
  IF p.tablename='artists' THEN CONTINUE; END IF;
  IF p.tablename='team_roles' THEN
   EXECUTE format('ALTER POLICY %I ON public.team_roles USING (public.is_artist_owner(artist_id) OR EXISTS (SELECT 1 FROM public.artist_members m WHERE m.artist_id=team_roles.artist_id AND m.role_id=team_roles.id AND m.user_id=auth.uid() AND m.status=''active''))',p.policyname);
   CONTINUE;
  END IF;
  page := CASE p.tablename WHEN 'conversations' THEN 'inbox' WHEN 'messages' THEN 'inbox'
    WHEN 'quote_requests' THEN 'quotes' WHEN 'bookings' THEN 'bookings' WHEN 'disputes' THEN 'bookings'
    WHEN 'availability' THEN 'calendar' WHEN 'schedule_items' THEN 'calendar'
    WHEN 'service_invoices' THEN 'invoices' WHEN 'contract_templates' THEN 'contracts'
    WHEN 'contract_template_purchases' THEN 'contracts' WHEN 'artist_media' THEN 'media'
    WHEN 'objects' THEN CASE WHEN coalesce(p.qual,p.with_check) LIKE '%artist-media%' THEN 'media' END END;
  replacement := CASE WHEN page IS NULL THEN 'is_artist_owner(\1)' ELSE 'artist_team_can(\1, '||quote_literal(page)||')' END;
  q:=regexp_replace(p.qual,'\mis_artist_team\(([^()]*)\)',replacement,'g');
  c:=regexp_replace(p.with_check,'\mis_artist_team\(([^()]*)\)',replacement,'g');
  IF p.tablename='objects' AND page='media' THEN
   q:=replace(q,'is_artist_team(((storage.foldername(name))[1])::uuid)','artist_team_can(((storage.foldername(name))[1])::uuid, ''media'')');
   c:=replace(c,'is_artist_team(((storage.foldername(name))[1])::uuid)','artist_team_can(((storage.foldername(name))[1])::uuid, ''media'')');
  END IF;
  q:=replace(q,'is_any_artist_team()',CASE WHEN page='contracts' THEN 'artist_has_page(''contracts'')' ELSE 'is_any_artist_owner()' END);
  c:=replace(c,'is_any_artist_team()',CASE WHEN page='contracts' THEN 'artist_has_page(''contracts'')' ELSE 'is_any_artist_owner()' END);
  statement:=format('ALTER POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
  IF q IS NOT NULL THEN statement:=statement||' USING ('||q||')'; END IF;
  IF c IS NOT NULL THEN statement:=statement||' WITH CHECK ('||c||')'; END IF;
  EXECUTE statement;
 END LOOP;
END $migration$;

-- Update existing SQL bodies in place, retaining signatures and execution grants.
DO $migration$
DECLARE f record; page text; definition text; replacement text;
BEGIN
 FOR f IN SELECT p.oid,p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.prosrc LIKE '%is_artist_team(%' OR p.prosrc LIKE '%is_any_artist_team()%')
  AND p.proname NOT IN ('is_artist_team','is_any_artist_team')
 LOOP
  IF f.proname='storage_artist_team' THEN
   definition:=replace(f.definition,'public.is_artist_team(split_part(_name,''/'',1)::uuid)','public.is_artist_owner(split_part(_name,''/'',1)::uuid)');
  ELSE
   page:=CASE WHEN f.proname IN ('set_conversation_label','restore_conversations','soft_delete_conversations') THEN 'inbox'
    WHEN f.proname IN ('soft_delete_quote_requests','restore_quote_requests') THEN 'quotes'
    WHEN f.proname IN ('soft_delete_bookings','restore_bookings') THEN 'bookings'
    WHEN f.proname IN ('soft_delete_invoices','restore_invoices','set_invoices_hidden') THEN 'invoices'
    WHEN f.proname IN ('booking_contract_terms','list_contract_templates') THEN 'contracts' END;
   IF f.proname='can_use_library_item' THEN
    replacement:='(CASE WHEN _kind=''contract_template'' THEN public.artist_team_can(_artist,''contracts'') ELSE public.is_artist_owner(_artist) END)';
    definition:=replace(f.definition,'public.is_artist_team(_artist)',replacement);
   ELSE
    replacement:=CASE WHEN page IS NULL THEN 'is_artist_owner(\1)' ELSE 'artist_team_can(\1, '||quote_literal(page)||')' END;
    definition:=regexp_replace(f.definition,'\mis_artist_team\(([^()]*)\)',replacement,'g');
   END IF;
   definition:=replace(definition,'is_any_artist_team()','is_any_artist_owner()');
  END IF;
  EXECUTE definition;
 END LOOP;
END $migration$;

-- Lookup projections intentionally exclude access keys, contacts and contract bodies.
CREATE OR REPLACE FUNCTION public.team_inbox_context(_artist uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.artist_team_can(_artist,'inbox') THEN RAISE EXCEPTION 'Inbox access required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'quotes',coalesce((SELECT jsonb_agg(jsonb_build_object('conversation_id',c.id,'name',q.name,'event_date',q.event_date)) FROM conversations c JOIN quote_requests q ON q.id=c.quote_request_id AND q.artist_id=c.artist_id WHERE c.artist_id=_artist AND c.deleted_at IS NULL AND q.deleted_at IS NULL),'[]'::jsonb),
 'bookings',coalesce((SELECT jsonb_agg(jsonb_build_object('conversation_id',b.conversation_id,'client_name',b.client_name,'status',b.status,'total',b.total,'paid_amount',b.paid_amount,'event_date',b.event_date)) FROM bookings b JOIN conversations c ON c.id=b.conversation_id AND c.artist_id=b.artist_id WHERE b.artist_id=_artist AND b.deleted_at IS NULL AND c.deleted_at IS NULL),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.team_invoice_context(_artist uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.artist_team_can(_artist,'invoices') THEN RAISE EXCEPTION 'Invoice access required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'convos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'quote_requests',jsonb_build_object('name',coalesce(q.name,c.client_name),'email',q.email,'event_date',q.event_date)) ORDER BY c.last_message_at DESC) FROM conversations c LEFT JOIN quote_requests q ON q.id=c.quote_request_id AND q.artist_id=c.artist_id AND q.deleted_at IS NULL WHERE c.artist_id=_artist AND c.deleted_at IS NULL),'[]'::jsonb),
 'bookings',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'conversation_id',b.conversation_id,'package_title',b.package_title,'event_date',b.event_date,'amount',b.amount,'status',b.status)) FROM bookings b WHERE b.artist_id=_artist AND NOT b.is_seed AND b.deleted_at IS NULL AND b.conversation_id IS NOT NULL AND b.status<>'cancelled'),'[]'::jsonb),
 'sent',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'body',m.body,'created_at',m.created_at) ORDER BY m.created_at DESC) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.artist_id=_artist AND c.deleted_at IS NULL AND m.body LIKE '[[INVOICE]]%'),'[]'::jsonb),
 'links',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'bookings',CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('client_name',b.client_name,'client_email',b.client_email,'total',b.total,'paid_amount',b.paid_amount,'deposit_pct',b.deposit_pct) END,'conversations',jsonb_build_object('quote_requests',jsonb_build_object('name',coalesce(q.name,c.client_name))))) FROM service_invoices i LEFT JOIN bookings b ON b.id=i.booking_id AND b.artist_id=i.artist_id LEFT JOIN conversations c ON c.id=i.conversation_id AND c.artist_id=i.artist_id LEFT JOIN quote_requests q ON q.id=c.quote_request_id AND q.artist_id=i.artist_id WHERE i.artist_id=_artist AND i.deleted_at IS NULL),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.team_contract_bookings(_artist uuid)
RETURNS TABLE(id uuid,client_name text,package_title text,event_date date,start_time time,end_time time,job_detail text,notes text,total numeric,paid_amount numeric,escrow_status text,contract_accepted_at timestamptz,contract_template_id uuid,status text,invoice_no text,artists jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.artist_team_can(_artist,'contracts') THEN RAISE EXCEPTION 'Contract access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT b.id,b.client_name,b.package_title,b.event_date,b.start_time,b.end_time,b.job_detail,b.notes,b.total,b.paid_amount,b.escrow_status,b.contract_accepted_at,b.contract_template_id,b.status,b.invoice_no,jsonb_build_object('stage_name',a.stage_name)
 FROM bookings b JOIN artists a ON a.id=b.artist_id WHERE b.artist_id=_artist AND b.deleted_at IS NULL AND b.status IN ('quoted','confirmed','completed','cancelled','disputed') ORDER BY b.created_at DESC;
END $$;
CREATE OR REPLACE FUNCTION public.team_calendar_bookings(_artist uuid)
RETURNS TABLE(id uuid,client_name text,package_title text,event_date date,start_time time,end_time time,status text,total numeric,paid_amount numeric,notes text,job_detail text,escrow_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.artist_team_can(_artist,'calendar') THEN RAISE EXCEPTION 'Calendar access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT b.id,b.client_name,b.package_title,b.event_date,b.start_time,b.end_time,b.status,b.total,b.paid_amount,b.notes,b.job_detail,b.escrow_status FROM bookings b WHERE b.artist_id=_artist AND b.deleted_at IS NULL AND b.status<>'cancelled' ORDER BY b.event_date LIMIT 500;
END $$;
REVOKE ALL ON FUNCTION public.team_inbox_context(uuid),public.team_invoice_context(uuid),public.team_contract_bookings(uuid),public.team_calendar_bookings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_inbox_context(uuid),public.team_invoice_context(uuid),public.team_contract_bookings(uuid),public.team_calendar_bookings(uuid) TO authenticated,service_role;