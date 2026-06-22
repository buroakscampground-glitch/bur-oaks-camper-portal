-- Restore the dedicated maintenance role record after the go-live reset.

INSERT INTO public.campers (
  email,
  first_name,
  last_name,
  lot_number,
  role,
  active
)
SELECT
  'maintenance@buroaks.com',
  'Maintenance',
  'Team',
  'STAFF',
  'maintenance',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.campers
  WHERE LOWER(email) = 'maintenance@buroaks.com'
);

UPDATE public.campers
SET
  first_name = 'Maintenance',
  last_name = 'Team',
  lot_number = 'STAFF',
  role = 'maintenance',
  active = true
WHERE LOWER(email) = 'maintenance@buroaks.com';
