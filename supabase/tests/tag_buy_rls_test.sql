begin;
select plan(19);

select has_table('public', 'tag_batches', 'tag_batches exists');
select has_table('public', 'tag_commitments', 'tag_commitments exists');
select has_view('public', 'tag_batch_progress', 'safe progress view exists');
select has_column('public', 'product_variants', 'tag_buy_eligible', 'variant eligibility flag exists');
select has_column('public', 'product_variants', 'tag_buy_purchase_mode', 'variant shopper purchase mode exists');
select has_column('public', 'product_variants', 'tag_buy_priority_tier', 'variant priority tier exists');
select has_column('public', 'tag_batches', 'purchase_mode', 'batch snapshots shopper purchase mode');
select has_trigger('public', 'tag_batches', 'tag_batches_variant_eligibility', 'batch eligibility is database-enforced');
select ok((select relrowsecurity from pg_class where oid = 'public.tag_batches'::regclass), 'tag_batches has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.tag_commitments'::regclass), 'tag_commitments has RLS');
select ok(has_table_privilege('anon', 'public.tag_batches', 'select'), 'anon can read public batch states');
select ok(not has_table_privilege('anon', 'public.tag_batches', 'insert,update,delete'), 'anon cannot mutate batches');
select ok(has_table_privilege('authenticated', 'public.tag_commitments', 'select'), 'authenticated can read commitments through ownership RLS');
select ok(not has_table_privilege('authenticated', 'public.tag_commitments', 'insert,update,delete'), 'authenticated cannot mutate commitments directly');
select ok(not has_table_privilege('anon', 'public.tag_batch_progress', 'select'), 'progress aggregation is server-only');
select ok(has_function_privilege('service_role', 'public.reserve_tag_capacity(uuid,uuid,numeric,text,integer)', 'execute'), 'service role can reserve capacity');
select ok(not has_function_privilege('authenticated', 'public.reserve_tag_capacity(uuid,uuid,numeric,text,integer)', 'execute'), 'shopper cannot call reservation RPC directly');
select ok(has_function_privilege('service_role', 'public.close_tag_batch(uuid,uuid)', 'execute'), 'service role can close batches');
select ok(not has_function_privilege('authenticated', 'public.close_tag_batch(uuid,uuid)', 'execute'), 'shopper cannot close batches');

select * from finish();
rollback;
