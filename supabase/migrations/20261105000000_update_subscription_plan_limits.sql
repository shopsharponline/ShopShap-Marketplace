UPDATE public.plans
SET product_limit = 30
WHERE name = 'starter';

UPDATE public.plans
SET product_limit = 100
WHERE name = 'pro';
