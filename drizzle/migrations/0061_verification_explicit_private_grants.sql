REVOKE ALL ON public.verification_otps,public.verification_details,public.verification_files,public.verification_access_log FROM anon,authenticated;
GRANT ALL ON public.verification_otps,public.verification_details,public.verification_files,public.verification_access_log TO service_role;
GRANT SELECT,UPDATE ON public.verification_details TO authenticated;
GRANT SELECT,INSERT ON public.verification_files TO authenticated;
GRANT SELECT ON public.verification_access_log TO authenticated;