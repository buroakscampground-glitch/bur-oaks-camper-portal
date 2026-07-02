-- Maintenance inventory, parts used on work orders, and receipt photo records.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
WHERE id = 'maintenance-photos';

CREATE TABLE IF NOT EXISTS public.maintenance_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  unit text NOT NULL DEFAULT 'each',
  sku text,
  location text,
  stock_quantity numeric(10,2) NOT NULL DEFAULT 0,
  reorder_level numeric(10,2) NOT NULL DEFAULT 0,
  unit_cost numeric(10,2),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_inventory_items_active_idx
  ON public.maintenance_inventory_items (active, item_name);

CREATE TABLE IF NOT EXISTS public.maintenance_ticket_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.maintenance_inventory_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'each',
  unit_cost numeric(10,2),
  used_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_ticket_parts_ticket_idx
  ON public.maintenance_ticket_parts (ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.maintenance_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text,
  vendor text,
  amount numeric(10,2),
  purchased_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_receipts_ticket_idx
  ON public.maintenance_receipts (ticket_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_maintenance_inventory_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_inventory_items_touch ON public.maintenance_inventory_items;
CREATE TRIGGER maintenance_inventory_items_touch
  BEFORE UPDATE ON public.maintenance_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_maintenance_inventory_item();

CREATE OR REPLACE FUNCTION public.apply_maintenance_part_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.inventory_item_id IS NOT NULL THEN
      UPDATE public.maintenance_inventory_items
      SET stock_quantity = stock_quantity - NEW.quantity
      WHERE id = NEW.inventory_item_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.inventory_item_id IS NOT NULL THEN
      UPDATE public.maintenance_inventory_items
      SET stock_quantity = stock_quantity + OLD.quantity
      WHERE id = OLD.inventory_item_id;
    END IF;

    IF NEW.inventory_item_id IS NOT NULL THEN
      UPDATE public.maintenance_inventory_items
      SET stock_quantity = stock_quantity - NEW.quantity
      WHERE id = NEW.inventory_item_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.inventory_item_id IS NOT NULL THEN
      UPDATE public.maintenance_inventory_items
      SET stock_quantity = stock_quantity + OLD.quantity
      WHERE id = OLD.inventory_item_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_ticket_parts_inventory ON public.maintenance_ticket_parts;
CREATE TRIGGER maintenance_ticket_parts_inventory
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_ticket_parts
  FOR EACH ROW EXECUTE FUNCTION public.apply_maintenance_part_inventory();

ALTER TABLE public.maintenance_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_ticket_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_inventory_admin_full_access ON public.maintenance_inventory_items;
CREATE POLICY maintenance_inventory_admin_full_access ON public.maintenance_inventory_items
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS maintenance_inventory_maintenance_select ON public.maintenance_inventory_items;
CREATE POLICY maintenance_inventory_maintenance_select ON public.maintenance_inventory_items
  FOR SELECT TO authenticated
  USING ((SELECT public.is_maintenance_user()));

DROP POLICY IF EXISTS maintenance_ticket_parts_admin_full_access ON public.maintenance_ticket_parts;
CREATE POLICY maintenance_ticket_parts_admin_full_access ON public.maintenance_ticket_parts
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS maintenance_ticket_parts_maintenance_select ON public.maintenance_ticket_parts;
CREATE POLICY maintenance_ticket_parts_maintenance_select ON public.maintenance_ticket_parts
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_maintenance_user())
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_tickets t
      WHERE t.id = maintenance_ticket_parts.ticket_id
        AND t.admin_approved = true
    )
  );

DROP POLICY IF EXISTS maintenance_ticket_parts_maintenance_insert ON public.maintenance_ticket_parts;
CREATE POLICY maintenance_ticket_parts_maintenance_insert ON public.maintenance_ticket_parts
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_maintenance_user())
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_tickets t
      WHERE t.id = maintenance_ticket_parts.ticket_id
        AND t.admin_approved = true
    )
  );

DROP POLICY IF EXISTS maintenance_receipts_admin_full_access ON public.maintenance_receipts;
CREATE POLICY maintenance_receipts_admin_full_access ON public.maintenance_receipts
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS maintenance_receipts_maintenance_select ON public.maintenance_receipts;
CREATE POLICY maintenance_receipts_maintenance_select ON public.maintenance_receipts
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_maintenance_user())
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_tickets t
      WHERE t.id = maintenance_receipts.ticket_id
        AND t.admin_approved = true
    )
  );

DROP POLICY IF EXISTS maintenance_receipts_maintenance_insert ON public.maintenance_receipts;
CREATE POLICY maintenance_receipts_maintenance_insert ON public.maintenance_receipts
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_maintenance_user())
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_tickets t
      WHERE t.id = maintenance_receipts.ticket_id
        AND t.admin_approved = true
    )
  );
