begin;
select plan(31);

select has_table('public', 'tag_batches', 'tag_batches exists');
select has_table('public', 'tag_commitments', 'tag_commitments exists');
select has_table('public', 'tag_batch_variants', 'normalized batch members exist');
select has_view('public', 'tag_batch_progress', 'safe progress view exists');
select has_column('public', 'product_variants', 'tag_buy_eligible', 'variant eligibility flag exists');
select has_column('public', 'product_variants', 'tag_buy_purchase_mode', 'variant shopper purchase mode exists');
select has_column('public', 'product_variants', 'tag_buy_priority_tier', 'variant priority tier exists');
select has_column('public', 'tag_batches', 'purchase_mode', 'batch snapshots shopper purchase mode');
select has_column('public', 'tag_batches', 'contribution_unit', 'batch declares its canonical contribution unit');
select has_column('public', 'tag_batch_variants', 'contribution_quantity', 'option contribution factor exists');
select has_trigger('public', 'tag_batches', 'tag_batches_variant_eligibility', 'batch eligibility is database-enforced');
select ok((select relrowsecurity from pg_class where oid = 'public.tag_batches'::regclass), 'tag_batches has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.tag_commitments'::regclass), 'tag_commitments has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.tag_batch_variants'::regclass), 'tag_batch_variants has RLS');
select ok(has_table_privilege('anon', 'public.tag_batches', 'select'), 'anon can read public batch states');
select ok(not has_table_privilege('anon', 'public.tag_batches', 'insert,update,delete'), 'anon cannot mutate batches');
select ok(has_table_privilege('authenticated', 'public.tag_commitments', 'select'), 'authenticated can read commitments through ownership RLS');
select ok(not has_table_privilege('authenticated', 'public.tag_commitments', 'insert,update,delete'), 'authenticated cannot mutate commitments directly');
select ok(not has_table_privilege('anon', 'public.tag_batch_variants', 'select,insert,update,delete'), 'batch membership is server-only');
select ok(not has_table_privilege('anon', 'public.tag_batch_progress', 'select'), 'progress aggregation is server-only');
select ok(has_function_privilege('service_role', 'public.reserve_tag_capacity(uuid,uuid,numeric,text,integer)', 'execute'), 'service role can reserve capacity');
select ok(not has_function_privilege('authenticated', 'public.reserve_tag_capacity(uuid,uuid,numeric,text,integer)', 'execute'), 'shopper cannot call reservation RPC directly');
select ok(has_function_privilege('service_role', 'public.close_tag_batch(uuid,uuid)', 'execute'), 'service role can close batches');
select ok(not has_function_privilege('authenticated', 'public.close_tag_batch(uuid,uuid)', 'execute'), 'shopper cannot close batches');
select ok(has_function_privilege('service_role', 'public.create_tag_batch_pool(bigint,numeric,numeric,numeric,numeric,timestamp with time zone,timestamp with time zone,text,uuid,text,uuid)', 'execute'), 'service role can create normalized pools');
select ok(not has_function_privilege('authenticated', 'public.create_tag_batch_pool(bigint,numeric,numeric,numeric,numeric,timestamp with time zone,timestamp with time zone,text,uuid,text,uuid)', 'execute'), 'shopper cannot create normalized pools');
select ok(has_function_privilege('service_role', 'public.reserve_tag_capacity_v2(uuid,uuid,jsonb,text,integer)', 'execute'), 'service role can reserve normalized capacity');
select ok(not has_function_privilege('authenticated', 'public.reserve_tag_capacity_v2(uuid,uuid,jsonb,text,integer)', 'execute'), 'shopper cannot reserve normalized capacity directly');
select ok(has_function_privilege('service_role', 'public.close_due_tag_batches()', 'execute'), 'service role can evaluate due pools');
select ok(not has_function_privilege('authenticated', 'public.close_due_tag_batches()', 'execute'), 'shopper cannot evaluate due pools');
select ok(exists(
  select 1 from cron.job where jobname = 'close_due_meal05_tag_buys'
), 'due-pool evaluation is scheduled');

select * from finish();
rollback;
