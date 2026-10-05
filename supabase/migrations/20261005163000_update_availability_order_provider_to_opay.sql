-- The public availability conversion function delegates order creation to this
-- internal function. Update its default provider after the OPay switch.

do $$
declare
  function_definition text;
begin
  if to_regprocedure('public.convert_availability_request_to_order_unchecked(uuid,uuid)') is not null then
    select pg_get_functiondef('public.convert_availability_request_to_order_unchecked(uuid,uuid)'::regprocedure)
      into function_definition;
    if position('moniepoint_transfer' in function_definition) > 0 then
      execute replace(function_definition, '''moniepoint_transfer''', '''opay_transfer''');
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
