-- Seed the practical emergency stock list for Bur Oaks maintenance.
-- Safe to run more than once: existing item names are not duplicated.
-- Current stock starts at zero; the office can update counts as items are purchased.

WITH seed_items (
  item_name,
  category,
  unit,
  stock_quantity,
  reorder_level,
  location,
  notes
) AS (
  VALUES
    -- 50-amp RV site electrical
    ('50A 2-pole breaker — match existing panel', 'Electric', 'each', 0, 1, 'Electric stock', 'Record the exact panel manufacturer, breaker family, and catalog number before purchasing. Breaker families are not interchangeable.'),
    ('50A 2-pole GFCI breaker — match existing panel', 'Electric', 'each', 0, 1, 'Electric stock', 'Record the exact panel manufacturer, breaker family, and catalog number. Use where required by the adopted code and the existing installation.'),
    ('50A RV receptacle — NEMA 14-50R weather-resistant', 'Electric', 'each', 0, 1, 'Electric stock', '50 amp, 125/250 volt, 4-wire grounding RV receptacle. Match the pedestal and enclosure listing.'),
    ('50A RV receptacle weatherproof box and cover', 'Electric', 'set', 0, 1, 'Electric stock', 'Outdoor-rated enclosure/cover sized and listed for the NEMA 14-50R receptacle and existing pedestal.'),
    ('#6 copper THHN/THWN-2 wire — black', 'Electric', 'foot', 0, 50, 'Electric stock', 'Common 50A current-carrying conductor in conduit. Final size depends on terminals, distance, derating, installation, and adopted code.'),
    ('#6 copper THHN/THWN-2 wire — red', 'Electric', 'foot', 0, 50, 'Electric stock', 'Common 50A current-carrying conductor in conduit. Final size depends on terminals, distance, derating, installation, and adopted code.'),
    ('#6 copper THHN/THWN-2 wire — white', 'Electric', 'foot', 0, 50, 'Electric stock', 'Common full-size neutral for a 50A RV circuit in conduit. Verify the existing installation and adopted code.'),

    -- 30-amp RV site electrical
    ('30A 1-pole breaker — match existing panel', 'Electric', 'each', 0, 1, 'Electric stock', 'Record the exact panel manufacturer, breaker family, and catalog number before purchasing. Breaker families are not interchangeable.'),
    ('30A 1-pole GFCI breaker — match existing panel', 'Electric', 'each', 0, 1, 'Electric stock', 'Record the exact panel manufacturer, breaker family, and catalog number. Use where required by the adopted code and the existing installation.'),
    ('30A RV receptacle — NEMA TT-30R weather-resistant', 'Electric', 'each', 0, 1, 'Electric stock', '30 amp, 125 volt, 3-wire grounding receptacle specifically for RV use.'),
    ('30A RV receptacle weatherproof box and cover', 'Electric', 'set', 0, 1, 'Electric stock', 'Outdoor-rated enclosure/cover sized and listed for the NEMA TT-30R receptacle and existing pedestal.'),
    ('#10 copper THHN/THWN-2 wire — black', 'Electric', 'foot', 0, 50, 'Electric stock', 'Common 30A hot conductor in conduit. Verify distance, terminals, installation, and adopted code.'),
    ('#10 copper THHN/THWN-2 wire — white', 'Electric', 'foot', 0, 50, 'Electric stock', 'Common 30A neutral conductor in conduit. Verify distance, terminals, installation, and adopted code.'),
    ('#10 copper THHN/THWN-2 wire — green', 'Electric', 'foot', 0, 50, 'Electric stock', 'Equipment grounding conductor stock. Verify the required size for the circuit and installation.'),

    -- Common pedestal and aerial electrical emergency stock
    ('20A weather-resistant self-test GFCI receptacle', 'Electric', 'each', 0, 2, 'Electric stock', 'Outdoor-rated 125V GFCI receptacle for campground pedestal convenience outlets; match existing configuration.'),
    ('Weatherproof single-gang box and in-use cover', 'Electric', 'set', 0, 2, 'Electric stock', 'Outdoor-rated box and extra-duty in-use cover for compatible 15A/20A receptacles.'),
    ('Wet-location wire connector assortment', 'Electric', 'kit', 0, 1, 'Electric stock', 'Listed connectors specifically rated for wet locations and the conductor material/gauge being joined.'),
    ('Insulated multi-tap connector — match conductor size', 'Electric', 'each', 0, 2, 'Electric stock', 'Polaris-style or equivalent listed connector. Stock only after recording the conductor material and gauge used at Bur Oaks.'),
    ('Aerial service-line connector — match conductor size', 'Electric', 'each', 0, 2, 'Electric stock', 'For qualified electrical work on de-energized lines only. Must match overhead conductor type, material, and gauge; record exact SKU after confirming the existing aerial line.'),
    ('Aluminum-to-copper rated mechanical connector', 'Electric', 'each', 0, 2, 'Electric stock', 'Listed AL/CU connector sized for the actual conductors. Do not substitute a connector outside its marked range.'),
    ('Anti-oxidant electrical joint compound', 'Electric', 'bottle', 0, 1, 'Electric stock', 'For aluminum conductor terminations only where permitted or required by the connector manufacturer.'),
    ('Professional electrical tape', 'Electric', 'roll', 0, 3, 'Electric stock', 'General emergency stock; use listed wet-location splicing products where exposed to moisture.'),

    -- 1/2-inch and 3/4-inch Schedule 40 pressure PVC
    ('1/2 in Schedule 40 pressure PVC pipe', 'Plumbing', '10-ft stick', 0, 2, 'Plumbing stock', 'Cold-water pressure pipe; confirm pressure rating and application.'),
    ('3/4 in Schedule 40 pressure PVC pipe', 'Plumbing', '10-ft stick', 0, 2, 'Plumbing stock', 'Cold-water pressure pipe; confirm pressure rating and application.'),
    ('1/2 in PVC straight coupling', 'Plumbing', 'each', 0, 4, 'Plumbing stock', 'Schedule 40 pressure fitting.'),
    ('3/4 in PVC straight coupling', 'Plumbing', 'each', 0, 4, 'Plumbing stock', 'Schedule 40 pressure fitting.'),
    ('1/2 in PVC slip repair coupling', 'Plumbing', 'each', 0, 2, 'Plumbing stock', 'No-stop or telescoping repair coupling for emergency line repairs.'),
    ('3/4 in PVC slip repair coupling', 'Plumbing', 'each', 0, 2, 'Plumbing stock', 'No-stop or telescoping repair coupling for emergency line repairs.'),
    ('1/2 in PVC 90-degree elbow', 'Plumbing', 'each', 0, 4, 'Plumbing stock', 'Schedule 40 pressure fitting.'),
    ('3/4 in PVC 90-degree elbow', 'Plumbing', 'each', 0, 4, 'Plumbing stock', 'Schedule 40 pressure fitting.'),
    ('1/2 in PVC tee', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Schedule 40 pressure fitting.'),
    ('3/4 in PVC tee', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Schedule 40 pressure fitting.'),
    ('1/2 in PVC male adapter', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Slip x male pipe thread pressure fitting.'),
    ('3/4 in PVC male adapter', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Slip x male pipe thread pressure fitting.'),
    ('1/2 in PVC female adapter', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Slip x female pipe thread pressure fitting; avoid overtightening threaded connections.'),
    ('3/4 in PVC female adapter', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Slip x female pipe thread pressure fitting; avoid overtightening threaded connections.'),
    ('1/2 in PVC cap', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Slip cap for isolating a damaged line.'),
    ('3/4 in PVC cap', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Slip cap for isolating a damaged line.'),
    ('1/2 in PVC union', 'Plumbing', 'each', 0, 2, 'Plumbing stock', 'Schedule 40 pressure union for serviceable repairs.'),
    ('3/4 in PVC union', 'Plumbing', 'each', 0, 2, 'Plumbing stock', 'Schedule 40 pressure union for serviceable repairs.'),
    ('1/2 in PVC slip ball valve', 'Plumbing', 'each', 0, 2, 'Plumbing stock', 'Full-port cold-water shutoff valve.'),
    ('3/4 in PVC slip ball valve', 'Plumbing', 'each', 0, 2, 'Plumbing stock', 'Full-port cold-water shutoff valve.'),
    ('PVC purple primer', 'Plumbing', 'can', 0, 1, 'Plumbing stock', 'Use with compatible pressure-rated PVC cement and follow cure times.'),
    ('PVC pressure-pipe cement', 'Plumbing', 'can', 0, 1, 'Plumbing stock', 'Use cement approved for the pipe size, pressure service, and temperature.'),

    -- 1/2-inch and 3/4-inch PEX plus fast emergency repair fittings
    ('1/2 in PEX tubing', 'Plumbing', 'foot', 0, 50, 'Plumbing stock', 'Match the campground PEX type and listing.'),
    ('3/4 in PEX tubing', 'Plumbing', 'foot', 0, 50, 'Plumbing stock', 'Match the campground PEX type and listing.'),
    ('1/2 in PEX straight coupling', 'Plumbing', 'each', 0, 4, 'Plumbing stock', 'Match the connection system used at Bur Oaks.'),
    ('3/4 in PEX straight coupling', 'Plumbing', 'each', 0, 4, 'Plumbing stock', 'Match the connection system used at Bur Oaks.'),
    ('1/2 in PEX 90-degree elbow', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Match the connection system used at Bur Oaks.'),
    ('3/4 in PEX 90-degree elbow', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Match the connection system used at Bur Oaks.'),
    ('1/2 in PEX tee', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Match the connection system used at Bur Oaks.'),
    ('3/4 in PEX tee', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Match the connection system used at Bur Oaks.'),
    ('1/2 in PEX rings or clamps', 'Plumbing', 'each', 0, 25, 'Plumbing stock', 'Stock the exact crimp-ring or cinch-clamp system that matches the campground tool and fittings.'),
    ('3/4 in PEX rings or clamps', 'Plumbing', 'each', 0, 25, 'Plumbing stock', 'Stock the exact crimp-ring or cinch-clamp system that matches the campground tool and fittings.'),
    ('1/2 in PEX shutoff valve', 'Plumbing', 'each', 0, 2, 'Plumbing stock', 'Full-port valve matching the campground connection system.'),
    ('3/4 in PEX shutoff valve', 'Plumbing', 'each', 0, 2, 'Plumbing stock', 'Full-port valve matching the campground connection system.'),
    ('1/2 in PEX plug or cap', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'For quickly isolating a damaged branch.'),
    ('3/4 in PEX plug or cap', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'For quickly isolating a damaged branch.'),
    ('1/2 in push-to-connect emergency coupling', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Listed for the pipe material in use; useful for fast wet-line repairs without special tools.'),
    ('3/4 in push-to-connect emergency coupling', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Listed for the pipe material in use; useful for fast wet-line repairs without special tools.'),
    ('1/2 in push-to-connect emergency cap', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Listed for the pipe material in use; quickly isolates a damaged branch.'),
    ('3/4 in push-to-connect emergency cap', 'Plumbing', 'each', 0, 3, 'Plumbing stock', 'Listed for the pipe material in use; quickly isolates a damaged branch.'),
    ('1/2 in PVC-to-PEX transition coupling', 'Plumbing', 'each', 0, 2, 'Plumbing stock', 'Use a listed transition fitting specifically approved for Schedule 40 PVC and the campground PEX type.'),
    ('3/4 in PVC-to-PEX transition coupling', 'Plumbing', 'each', 0, 2, 'Plumbing stock', 'Use a listed transition fitting specifically approved for Schedule 40 PVC and the campground PEX type.'),
    ('PTFE thread-seal tape', 'Plumbing', 'roll', 0, 3, 'Plumbing stock', 'For compatible threaded water fittings; follow the fitting manufacturer instructions.'),
    ('Potable-water pipe thread sealant', 'Plumbing', 'tube', 0, 1, 'Plumbing stock', 'Use a sealant listed for potable water and compatible with the fitting materials.')
)
INSERT INTO public.maintenance_inventory_items (
  item_name,
  category,
  unit,
  stock_quantity,
  reorder_level,
  location,
  notes,
  active
)
SELECT
  seed.item_name,
  seed.category,
  seed.unit,
  seed.stock_quantity,
  seed.reorder_level,
  seed.location,
  seed.notes,
  true
FROM seed_items seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.maintenance_inventory_items existing
  WHERE lower(trim(existing.item_name)) = lower(trim(seed.item_name))
);

SELECT category, count(*) AS active_items
FROM public.maintenance_inventory_items
WHERE active = true
  AND category IN ('Electric', 'Plumbing')
GROUP BY category
ORDER BY category;
