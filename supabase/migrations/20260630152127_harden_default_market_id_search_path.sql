-- Harden the default-market helper against search_path object shadowing.
-- The function body references public.markets explicitly, so an empty
-- search_path does not change its behavior.
alter function public.default_market_id() set search_path = '';
