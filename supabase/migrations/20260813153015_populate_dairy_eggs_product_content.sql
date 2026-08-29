update public.products p
set description = 'Fresh chicken eggs suitable for frying, boiling, scrambling, baking and a wide range of everyday meals. Eggs are highly perishable and should be handled carefully, kept free from cracks and stored under consistent cool conditions to maintain freshness and quality.',
    handling_protocols = array[
      'Inspect shells before storage or use and discard eggs that are cracked, leaking or badly damaged.',
      'Do not wash eggs before storage; uncontrolled washing can remove the shell''s natural protective coating and increase contamination risk.',
      'Keep hands, utensils and work surfaces clean when handling raw eggs and prevent raw egg from contaminating ready-to-eat foods.',
      'For the lowest food-safety risk, cook eggs thoroughly until the white and yolk are firm.'
    ]::text[],
    storage_tips = array[
      'Refrigerate promptly after delivery where reliable refrigeration is available and keep refrigerated eggs consistently cold.',
      'For best quality under refrigeration, use within about 2–3 weeks after Meal05 delivery.',
      'Without refrigeration, keep eggs cool, shaded and dry and aim to use within about 7–10 days, preferably sooner in very hot conditions.',
      'Avoid repeatedly moving chilled eggs into warm humid conditions; condensation on the shell can increase contamination risk.'
    ]::text[]
where p.name = 'Chicken Eggs'
  and p.category_id = (select id from public.product_categories where name = 'Dairy & Eggs');;
