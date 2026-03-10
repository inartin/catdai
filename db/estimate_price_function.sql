-- ============================================================
-- estimate_price — Supabase RPC function
-- Run this in Supabase SQL Editor
--
-- Methodology: Pure Comparable Filtering + District Coefficient
--
-- 1. All user inputs become WHERE filters with progressive widening
-- 2. When district has too few comparables, uses city-wide data
--    multiplied by a district price coefficient
-- 3. Returns district comparison: median prices across all districts
--    with the same filters (rooms, building_type, renovation)
-- ============================================================

CREATE OR REPLACE FUNCTION estimate_price(
  p_city text,
  p_district text,
  p_rooms_count int,
  p_area_m2 numeric,
  p_floor int DEFAULT NULL,
  p_total_floors int DEFAULT NULL,
  p_building_type text DEFAULT NULL,
  p_renovation text DEFAULT NULL,
  p_bathrooms_count int DEFAULT NULL,
  p_balconies_count int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  base_stats record;
  comparable_count int;
  min_comparables int := 5;

  -- Track which filters are active (order = widening priority)
  -- Balconies & bathrooms: NOT used as filters (sparse data, shown in impact only)
  use_floor boolean := (p_floor IS NOT NULL);
  use_area boolean := (p_area_m2 IS NOT NULL AND p_area_m2 > 0);
  area_tolerance numeric := 0.20;  -- ±20%, widens to ±35%, then drops
  use_renovation boolean := (p_renovation IS NOT NULL);
  use_building_type boolean := (p_building_type IS NOT NULL);
  use_district boolean := (p_district IS NOT NULL);

  -- District coefficient fallback
  district_coeff numeric;
  city_median_ppm numeric;
  district_median_ppm numeric;
  used_district_coeff boolean := false;

  -- Price calculations
  estimated_ppm numeric;
  fast_sale numeric;
  market_rate numeric;
  premium numeric;

  -- District comparison
  district_comparison jsonb;

BEGIN

  -- ============================================================
  -- Step 1: Progressive comparable search
  -- ============================================================
  LOOP
    SELECT
      count(*)                                                        AS total,
      avg(price_per_m2)                                               AS avg_ppm,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_m2)      AS median_ppm,
      min(price_per_m2)                                               AS min_ppm,
      max(price_per_m2)                                               AS max_ppm,
      avg(price_amount)                                               AS avg_price,
      min(price_amount)                                               AS min_price,
      max(price_amount)                                               AS max_price,
      percentile_cont(0.10) WITHIN GROUP (ORDER BY price_per_m2)     AS p10_ppm,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY price_per_m2)     AS p25_ppm,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY price_per_m2)     AS p75_ppm,
      percentile_cont(0.90) WITHIN GROUP (ORDER BY price_per_m2)     AS p90_ppm
    INTO base_stats
    FROM listing
    WHERE is_active = true
      AND price_per_m2 IS NOT NULL AND price_per_m2 > 0
      AND price_amount IS NOT NULL AND price_amount > 0
      AND city = p_city
      AND (NOT use_district OR district = p_district)
      AND (p_rooms_count IS NULL OR rooms_count = p_rooms_count)
      AND (NOT use_building_type OR building_type = p_building_type)
      AND (NOT use_renovation OR renovation = p_renovation)
      AND (NOT use_floor OR (
        CASE
          WHEN p_floor = 1 THEN
            floor = 1
          WHEN p_total_floors IS NOT NULL AND p_floor = p_total_floors THEN
            floor = total_floors
          ELSE
            floor BETWEEN GREATEST(2, p_floor - 2) AND (
              CASE WHEN p_total_floors IS NOT NULL
                THEN LEAST(p_total_floors - 1, p_floor + 2)
                ELSE p_floor + 2
              END
            )
        END
      ))
      AND (NOT use_area OR area_m2 BETWEEN p_area_m2 * (1 - area_tolerance) AND p_area_m2 * (1 + area_tolerance));

    comparable_count := COALESCE(base_stats.total, 0);

    EXIT WHEN comparable_count >= min_comparables;

    -- Widen progressively (least important first)
    IF use_floor THEN
      use_floor := false;
    ELSIF use_renovation THEN
      use_renovation := false;
    ELSIF use_building_type THEN
      use_building_type := false;
    ELSIF use_area AND area_tolerance < 0.30 THEN
      area_tolerance := 0.35;
    ELSIF use_area THEN
      use_area := false;
    ELSIF use_district THEN
      use_district := false;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  IF comparable_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'insufficient_data',
      'message', 'Not enough comparable listings found',
      'comparable_count', 0
    );
  END IF;

  estimated_ppm := base_stats.median_ppm;

  -- ============================================================
  -- Step 2: District coefficient fallback
  --         If district was dropped, apply district price ratio
  -- ============================================================
  IF NOT use_district AND p_district IS NOT NULL THEN
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_m2)
    INTO city_median_ppm
    FROM listing
    WHERE is_active = true
      AND price_per_m2 IS NOT NULL AND price_per_m2 > 0
      AND city = p_city;

    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_m2)
    INTO district_median_ppm
    FROM listing
    WHERE is_active = true
      AND price_per_m2 IS NOT NULL AND price_per_m2 > 0
      AND city = p_city
      AND district = p_district;

    IF city_median_ppm > 0 AND district_median_ppm IS NOT NULL THEN
      district_coeff := district_median_ppm / city_median_ppm;
      -- Clamp to reasonable range
      district_coeff := GREATEST(0.50, LEAST(1.60, district_coeff));
      estimated_ppm := estimated_ppm * district_coeff;
      used_district_coeff := true;
    END IF;
  END IF;

  -- ============================================================
  -- Step 3: Compute price tiers
  -- ============================================================
  fast_sale   := round(((estimated_ppm * 0.90) * p_area_m2)::numeric, -2);
  market_rate := round((estimated_ppm * p_area_m2)::numeric, -2);
  premium     := round(((estimated_ppm * 1.08) * p_area_m2)::numeric, -2);

  -- ============================================================
  -- Step 4: District comparison
  --         Same filters (rooms, building_type, renovation) across
  --         all districts in the city. Shows ≥3 listings only.
  -- ============================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'district', d.district,
      'median_ppm', round(d.median_ppm::numeric, 0),
      'count', d.cnt
    ) ORDER BY d.median_ppm DESC
  )
  INTO district_comparison
  FROM (
    SELECT
      l.district,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY l.price_per_m2) AS median_ppm,
      count(*) AS cnt
    FROM listing l
    WHERE l.is_active = true
      AND l.price_per_m2 IS NOT NULL AND l.price_per_m2 > 0
      AND l.city = p_city
      AND l.district IS NOT NULL
      AND (p_rooms_count IS NULL OR l.rooms_count = p_rooms_count)
      AND (p_building_type IS NULL OR l.building_type = p_building_type)
      AND (p_renovation IS NULL OR l.renovation = p_renovation)
    GROUP BY l.district
    HAVING count(*) >= 3
  ) d;

  -- ============================================================
  -- Step 5: Build result
  -- ============================================================
  result := jsonb_build_object(
    'estimate', jsonb_build_object(
      'fast_sale', fast_sale,
      'market_rate', market_rate,
      'premium', premium,
      'price_per_m2', round(estimated_ppm::numeric, 2),
      'confidence', CASE
        WHEN comparable_count >= 20 AND use_district THEN 'high'
        WHEN comparable_count >= 10 THEN 'medium'
        ELSE 'low'
      END
    ),
    'range', jsonb_build_object(
      'low', round((base_stats.p25_ppm * p_area_m2 *
        CASE WHEN used_district_coeff THEN district_coeff ELSE 1 END)::numeric, -2),
      'high', round((base_stats.p75_ppm * p_area_m2 *
        CASE WHEN used_district_coeff THEN district_coeff ELSE 1 END)::numeric, -2)
    ),
    'market_stats', jsonb_build_object(
      'comparable_count', comparable_count,
      'avg_price', round(base_stats.avg_price::numeric, 2),
      'avg_price_per_m2', round(base_stats.avg_ppm::numeric, 2),
      'median_price_per_m2', round(base_stats.median_ppm::numeric, 2),
      'min_price_per_m2', round(base_stats.min_ppm::numeric, 2),
      'max_price_per_m2', round(base_stats.max_ppm::numeric, 2),
      'p10_price_per_m2', round(base_stats.p10_ppm::numeric, 2),
      'p90_price_per_m2', round(base_stats.p90_ppm::numeric, 2)
    ),
    'filters_used', jsonb_build_object(
      'city', true,
      'district', use_district,
      'rooms_count', (p_rooms_count IS NOT NULL),
      'building_type', use_building_type,
      'renovation', use_renovation,
      'floor', use_floor,
      'area', use_area,
      'area_tolerance', CASE WHEN use_area THEN area_tolerance ELSE null END
    ),
    'district_coefficient', CASE
      WHEN used_district_coeff THEN jsonb_build_object(
        'applied', true,
        'value', round(district_coeff::numeric, 3),
        'district_median_ppm', round(district_median_ppm::numeric, 0),
        'city_median_ppm', round(city_median_ppm::numeric, 0)
      )
      ELSE jsonb_build_object('applied', false)
    END,
    'district_comparison', COALESCE(district_comparison, '[]'::jsonb),
    'input', jsonb_build_object(
      'city', p_city,
      'district', p_district,
      'rooms_count', p_rooms_count,
      'area_m2', p_area_m2,
      'floor', p_floor,
      'total_floors', p_total_floors,
      'building_type', p_building_type,
      'renovation', p_renovation,
      'bathrooms_count', p_bathrooms_count,
      'balconies_count', p_balconies_count
    )
  );

  RETURN result;
END;
$$;
