-- Allow field staff to submit only a meter photo. The office confirms the number later.
ALTER TABLE public.meter_reading_submissions
  ALTER COLUMN submitted_reading DROP NOT NULL;
