create index if not exists delivery_access_tokens_partner_idx
  on public.delivery_access_tokens(delivery_partner_id);

create index if not exists delivery_audit_logs_route_stop_idx
  on public.delivery_audit_logs(route_stop_id)
  where route_stop_id is not null;

create index if not exists delivery_audit_logs_actor_idx
  on public.delivery_audit_logs(actor_user_id)
  where actor_user_id is not null;

create index if not exists delivery_routes_created_by_idx
  on public.delivery_routes(created_by)
  where created_by is not null;

create index if not exists delivery_routes_payment_approved_by_idx
  on public.delivery_routes(payment_approved_by)
  where payment_approved_by is not null;

create index if not exists rider_current_locations_partner_idx
  on public.rider_current_locations(delivery_partner_id);

notify pgrst, 'reload schema';;
