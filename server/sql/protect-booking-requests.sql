-- Applied to Supabase with migration protect_booking_requests_server_only.
-- Booking requests are written and reviewed through the Render server.
-- No browser code should directly read or write customer records.
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.booking_requests FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.booking_requests_id_seq FROM anon, authenticated;
COMMENT ON TABLE public.booking_requests IS 'Booking requests are server-only. The Render backend connects with its privileged database role; public Data API access is intentionally denied.';
