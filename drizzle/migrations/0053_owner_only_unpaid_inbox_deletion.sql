CREATE OR REPLACE FUNCTION public.inbox_deletable_conversations(_artist uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(c.id ORDER BY c.id), ARRAY[]::uuid[])
  FROM public.conversations c
  WHERE c.artist_id = _artist AND public.is_artist_owner(c.artist_id) AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.conversation_id=c.id AND (b.paid_amount>0 OR b.paid_at IS NOT NULL))
  AND NOT EXISTS (SELECT 1 FROM public.service_invoices i WHERE i.conversation_id=c.id AND (i.status='paid' OR i.paid_at IS NOT NULL))
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_orders o
    WHERE o.artist_id=c.artist_id AND (o.status='paid' OR o.paid_at IS NOT NULL)
    AND ((o.kind='booking' AND EXISTS(SELECT 1 FROM public.bookings b WHERE b.id=o.target_id AND b.conversation_id=c.id))
      OR (o.kind='invoice' AND EXISTS(SELECT 1 FROM public.service_invoices i WHERE i.id=o.target_id AND i.conversation_id=c.id)))
  );
$$;
REVOKE ALL ON FUNCTION public.inbox_deletable_conversations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_deletable_conversations(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_conversations(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hidden integer;
BEGIN
  IF coalesce(cardinality(_ids),0)>200 THEN RAISE EXCEPTION 'At most 200 ids are allowed'; END IF;
  -- Match settlement lock order: payment order, booking, invoice, conversation.
  -- Never modify money records; wait for in-flight settlement before eligibility checks.
  PERFORM o.id FROM public.payment_orders o
  WHERE o.kind IN ('booking','invoice') AND (
    (o.kind='booking' AND EXISTS(SELECT 1 FROM public.bookings b JOIN public.conversations c ON c.id=b.conversation_id WHERE b.id=o.target_id AND c.id=ANY(_ids) AND public.is_artist_owner(c.artist_id)))
    OR (o.kind='invoice' AND EXISTS(SELECT 1 FROM public.service_invoices i JOIN public.conversations c ON c.id=i.conversation_id WHERE i.id=o.target_id AND c.id=ANY(_ids) AND public.is_artist_owner(c.artist_id)))
  ) ORDER BY o.id FOR UPDATE;
  PERFORM b.id FROM public.bookings b JOIN public.conversations c ON c.id=b.conversation_id
  WHERE c.id=ANY(_ids) AND public.is_artist_owner(c.artist_id) ORDER BY b.id FOR UPDATE OF b;
  PERFORM i.id FROM public.service_invoices i JOIN public.conversations c ON c.id=i.conversation_id
  WHERE c.id=ANY(_ids) AND public.is_artist_owner(c.artist_id) ORDER BY i.id FOR UPDATE OF i;
  PERFORM c.id FROM public.conversations c
  WHERE c.id=ANY(_ids) AND public.is_artist_owner(c.artist_id) ORDER BY c.id FOR UPDATE;
  UPDATE public.conversations c SET deleted_at=now(),deleted_reason='manual'
  WHERE c.id=ANY(_ids) AND c.deleted_at IS NULL AND public.is_artist_owner(c.artist_id)
    AND c.id=ANY(public.inbox_deletable_conversations(c.artist_id));
  GET DIAGNOSTICS hidden=ROW_COUNT;
  RETURN hidden;
END;
$$;
REVOKE ALL ON FUNCTION public.soft_delete_conversations(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_conversations(uuid[]) TO authenticated;