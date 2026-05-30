-- ============================================================
-- estimate_rent — Supabase RPC function
-- Run this in Supabase SQL Editor after listing_rent.sql.
--
-- Methodology mirrors estimate_price, but reads monthly rent
-- comparables from listing_rent and returns monthly rent levels.
-- ============================================================

DROP FUNCTION IF EXISTS estimate_rent(
  text,
  text,
  int,
  numeric,
  int,
  boolean,
  boolean,
  int,
  text,
  text,
  int,
  int,
  boolean,
  boolean
);

DROP FUNCTION IF EXISTS estimate_rent(
  text,
  text,
  int,
  numeric,
  int,
  boolean,
  boolean,
  int,
  text,
  text,
  int,
  int,
  numeric,
  numeric,
  boolean,
  boolean
);

DROP FUNCTION IF EXISTS estimate_rent(
  text,
  text[],
  int,
  numeric,
  int,
  boolean,
  boolean,
  int,
  text,
  text,
  int,
  int,
  boolean,
  boolean
);

DROP FUNCTION IF EXISTS estimate_rent(
  text,
  text[],
  int,
  numeric,
  int,
  boolean,
  boolean,
  int,
  text,
  text,
  int,
  int,
  numeric,
  numeric,
  boolean,
  boolean
);

DROP FUNCTION IF EXISTS estimate_rent(
  text,
  text[],
  int,
  numeric,
  int,
  boolean,
  boolean,
  int,
  text[],
  text,
  int,
  int,
  boolean,
  boolean
);

CREATE OR REPLACE FUNCTION estimate_rent(
  p_city text,
  p_districts text[],
  p_rooms_count int,
  p_area_m2 numeric,
  p_floor int DEFAULT NULL,
  p_first_floor boolean DEFAULT false,
  p_last_floor boolean DEFAULT false,
  p_total_floors int DEFAULT NULL,
  p_building_types text[] DEFAULT ARRAY[]::text[],
  p_renovation text DEFAULT NULL,
  p_bathrooms_count int DEFAULT NULL,
  p_balconies_count int DEFAULT NULL,
  p_include_district_comparison boolean DEFAULT true,
  p_include_relevant_listings boolean DEFAULT true
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
  selected_districts text[] := ARRAY[]::text[];
  selected_building_types text[] := ARRAY[]::text[];
  primary_district text := NULL;

  wants_first_floor boolean := COALESCE(p_first_floor, false);
  wants_last_floor boolean := COALESCE(p_last_floor, false);
  use_floor boolean := (p_floor IS NOT NULL OR wants_first_floor OR wants_last_floor);
  has_input_area boolean := (p_area_m2 IS NOT NULL AND p_area_m2 > 0);
  use_area boolean := has_input_area;
  area_tolerance numeric := 0.20;
  use_renovation boolean := (p_renovation IS NOT NULL);
  renovation_filters text[] := CASE
    WHEN p_renovation = 'Euroreparație' THEN ARRAY['Euroreparație', 'Design individual']
    WHEN p_renovation = 'Reparație cosmetică' THEN ARRAY['Reparație cosmetică']
    WHEN p_renovation = 'Fără reparație' THEN ARRAY[
      'Fără reparație',
      'Construcție nefinisată',
      'Are nevoie de reparație',
      'Variantă sură',
      'Dat în exploatare'
    ]
    WHEN p_renovation IS NOT NULL THEN ARRAY[p_renovation]
    ELSE NULL
  END;
  use_building_type boolean := false;
  use_district boolean := false;

  district_coeff numeric;
  city_median_ppm numeric;
  district_median_ppm numeric;
  used_district_coeff boolean := false;

  estimated_ppm numeric;
  low_rent numeric;
  market_rent numeric;
  high_rent numeric;

  district_comparison jsonb;
  rent_level_listings jsonb;
  relevant_listings jsonb;
BEGIN
  selected_districts := COALESCE(
    ARRAY(SELECT DISTINCT trim(d) FROM unnest(p_districts) AS d WHERE trim(d) <> ''),
    ARRAY[]::text[]
  );
  selected_building_types := COALESCE(
    ARRAY(SELECT DISTINCT trim(bt) FROM unnest(p_building_types) AS bt WHERE trim(bt) <> ''),
    ARRAY[]::text[]
  );
  primary_district := selected_districts[1];
  use_district := array_length(selected_districts, 1) IS NOT NULL;
  use_building_type := array_length(selected_building_types, 1) IS NOT NULL;

  LOOP
    SELECT
      count(*)                                                        AS total,
      avg(COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0))) AS avg_ppm,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0))
      )                                                              AS median_ppm,
      min(COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0))) AS min_ppm,
      max(COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0))) AS max_ppm,
      avg(price_amount)                                               AS avg_price,
      min(price_amount)                                               AS min_price,
      max(price_amount)                                               AS max_price,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_amount)       AS median_price,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY price_amount)      AS p25_price,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY price_amount)      AS p75_price,
      percentile_cont(0.10) WITHIN GROUP (
        ORDER BY COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0))
      )                                                              AS p10_ppm,
      percentile_cont(0.25) WITHIN GROUP (
        ORDER BY COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0))
      )                                                              AS p25_ppm,
      percentile_cont(0.75) WITHIN GROUP (
        ORDER BY COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0))
      )                                                              AS p75_ppm,
      percentile_cont(0.90) WITHIN GROUP (
        ORDER BY COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0))
      )                                                              AS p90_ppm
    INTO base_stats
    FROM listing_rent
    WHERE is_active = true
      AND price_amount IS NOT NULL AND price_amount > 0
      AND COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0)) > 0
      AND city = p_city
      AND (NOT use_district OR district = ANY(selected_districts))
      AND (p_rooms_count IS NULL OR rooms_count = p_rooms_count)
      AND (NOT use_building_type OR building_type = ANY(selected_building_types))
      AND (NOT use_renovation OR renovation = ANY(renovation_filters) OR renovation IS NULL OR trim(renovation) = '')
      AND (NOT use_floor OR (
        CASE
          WHEN wants_first_floor OR wants_last_floor THEN
            (
              (wants_first_floor AND floor = 1)
              OR (wants_last_floor AND floor IS NOT NULL AND total_floors IS NOT NULL AND floor = total_floors)
            )
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
    ELSE
      EXIT;
    END IF;
  END LOOP;

  IF comparable_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'insufficient_data',
      'message', 'Not enough comparable rent listings found',
      'comparable_count', 0
    );
  END IF;

  estimated_ppm := base_stats.median_ppm;

  IF NOT use_district AND primary_district IS NOT NULL AND array_length(selected_districts, 1) = 1 THEN
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0))
    )
    INTO city_median_ppm
    FROM listing_rent
    WHERE is_active = true
      AND price_amount IS NOT NULL AND price_amount > 0
      AND COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0)) > 0
      AND city = p_city;

    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0))
    )
    INTO district_median_ppm
    FROM listing_rent
    WHERE is_active = true
      AND price_amount IS NOT NULL AND price_amount > 0
      AND COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0)) > 0
      AND city = p_city
      AND district = primary_district;

    IF city_median_ppm > 0 AND district_median_ppm IS NOT NULL THEN
      district_coeff := district_median_ppm / city_median_ppm;
      district_coeff := GREATEST(0.50, LEAST(1.60, district_coeff));
      estimated_ppm := estimated_ppm * district_coeff;
      used_district_coeff := true;
    END IF;
  END IF;

  IF has_input_area THEN
    market_rent := round((estimated_ppm * p_area_m2)::numeric, -1);
  ELSE
    market_rent := round((base_stats.median_price *
      CASE WHEN used_district_coeff THEN district_coeff ELSE 1 END)::numeric, -1);
  END IF;

  WITH matched_listings AS (
    SELECT
      external_id,
      title,
      price_amount,
      COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0)) AS price_per_m2,
      area_m2,
      rooms_count,
      floor,
      total_floors,
      building_type,
      renovation,
      city,
      district,
      sector,
      images_count
    FROM listing_rent
    WHERE is_active = true
      AND price_amount IS NOT NULL AND price_amount > 0
      AND COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0)) > 0
      AND city = p_city
      AND (NOT use_district OR district = ANY(selected_districts))
      AND (p_rooms_count IS NULL OR rooms_count = p_rooms_count)
      AND (NOT use_building_type OR building_type = ANY(selected_building_types))
      AND (NOT use_renovation OR renovation = ANY(renovation_filters) OR renovation IS NULL OR trim(renovation) = '')
      AND (NOT use_floor OR (
        CASE
          WHEN wants_first_floor OR wants_last_floor THEN
            (
              (wants_first_floor AND floor = 1)
              OR (wants_last_floor AND floor IS NOT NULL AND total_floors IS NOT NULL AND floor = total_floors)
            )
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
      AND (NOT use_area OR area_m2 BETWEEN p_area_m2 * (1 - area_tolerance) AND p_area_m2 * (1 + area_tolerance))
  ),
  boundary_listings AS (
    SELECT 'low' AS level, ml.*
    FROM matched_listings ml
    ORDER BY ml.price_amount ASC, ml.external_id ASC
    LIMIT 1
  ),
  high_boundary_listing AS (
    SELECT 'high' AS level, ml.*
    FROM matched_listings ml
    ORDER BY ml.price_amount DESC, ml.external_id ASC
    LIMIT 1
  ),
  combined_boundary_listings AS (
    SELECT * FROM boundary_listings
    UNION ALL
    SELECT * FROM high_boundary_listing
  )
  SELECT
    min(price_amount) FILTER (WHERE level = 'low'),
    max(price_amount) FILTER (WHERE level = 'high'),
    jsonb_build_object(
      'low', COALESCE(
        (SELECT jsonb_build_object(
          'external_id', c.external_id,
          'title', c.title,
          'price_amount', c.price_amount,
          'price_per_m2', c.price_per_m2,
          'area_m2', c.area_m2,
          'rooms_count', c.rooms_count,
          'floor', c.floor,
          'total_floors', c.total_floors,
          'building_type', c.building_type,
          'renovation', c.renovation,
          'city', c.city,
          'district', c.district,
          'sector', c.sector,
          'images_count', c.images_count
        ) FROM combined_boundary_listings c WHERE c.level = 'low' LIMIT 1),
        'null'::jsonb
      ),
      'high', COALESCE(
        (SELECT jsonb_build_object(
          'external_id', c.external_id,
          'title', c.title,
          'price_amount', c.price_amount,
          'price_per_m2', c.price_per_m2,
          'area_m2', c.area_m2,
          'rooms_count', c.rooms_count,
          'floor', c.floor,
          'total_floors', c.total_floors,
          'building_type', c.building_type,
          'renovation', c.renovation,
          'city', c.city,
          'district', c.district,
          'sector', c.sector,
          'images_count', c.images_count
        ) FROM combined_boundary_listings c WHERE c.level = 'high' LIMIT 1),
        'null'::jsonb
      )
    )
  INTO low_rent, high_rent, rent_level_listings
  FROM combined_boundary_listings;

  IF p_include_district_comparison THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'district', d.district,
        'median_price', round(d.median_price::numeric, 2),
        'count', d.cnt
      ) ORDER BY d.median_price DESC
    )
    INTO district_comparison
    FROM (
      SELECT
        l.district,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY l.price_amount) AS median_price,
        count(*) AS cnt
      FROM listing_rent l
      WHERE l.is_active = true
        AND l.price_amount IS NOT NULL AND l.price_amount > 0
        AND COALESCE(l.price_per_m2, l.price_amount / NULLIF(l.area_m2, 0)) > 0
        AND l.city = p_city
        AND l.district IS NOT NULL
        AND (p_rooms_count IS NULL OR l.rooms_count = p_rooms_count)
        AND (array_length(selected_building_types, 1) IS NULL OR l.building_type = ANY(selected_building_types))
        AND (p_renovation IS NULL OR l.renovation = ANY(renovation_filters) OR l.renovation IS NULL OR trim(l.renovation) = '')
      GROUP BY l.district
      HAVING count(*) >= 3
    ) d;
  ELSE
    district_comparison := '[]'::jsonb;
  END IF;

  IF p_include_relevant_listings THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'external_id', l.external_id,
        'title', l.title,
        'price_amount', l.price_amount,
        'price_per_m2', l.price_per_m2,
        'area_m2', l.area_m2,
        'rooms_count', l.rooms_count,
        'floor', l.floor,
        'total_floors', l.total_floors,
        'building_type', l.building_type,
        'renovation', l.renovation,
        'city', l.city,
        'district', l.district,
        'sector', l.sector,
        'images_count', l.images_count
      ) ORDER BY l.random_sort
    ), '[]'::jsonb)
    INTO relevant_listings
    FROM (
      SELECT
        external_id,
        title,
        price_amount,
        COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0)) AS price_per_m2,
        area_m2,
        rooms_count,
        floor,
        total_floors,
        building_type,
        renovation,
        city,
        district,
        sector,
        images_count,
        random() AS random_sort
      FROM listing_rent
      WHERE is_active = true
        AND price_amount IS NOT NULL AND price_amount > 0
        AND COALESCE(price_per_m2, price_amount / NULLIF(area_m2, 0)) > 0
        AND city = p_city
        AND (NOT use_district OR district = ANY(selected_districts))
        AND (p_rooms_count IS NULL OR rooms_count = p_rooms_count)
        AND (NOT use_building_type OR building_type = ANY(selected_building_types))
        AND (NOT use_renovation OR renovation = ANY(renovation_filters) OR renovation IS NULL OR trim(renovation) = '')
        AND (NOT use_floor OR (
          CASE
            WHEN wants_first_floor OR wants_last_floor THEN
              (
                (wants_first_floor AND floor = 1)
                OR (wants_last_floor AND floor IS NOT NULL AND total_floors IS NOT NULL AND floor = total_floors)
              )
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
        AND (NOT use_area OR area_m2 BETWEEN p_area_m2 * (1 - area_tolerance) AND p_area_m2 * (1 + area_tolerance))
      ORDER BY random_sort
      LIMIT 3
    ) l;
  ELSE
    relevant_listings := '[]'::jsonb;
  END IF;

  result := jsonb_build_object(
    'estimate_type', 'rent',
    'estimate', jsonb_build_object(
      'low', low_rent,
      'market_rate', market_rent,
      'high', high_rent,
      'price_per_m2', round(estimated_ppm::numeric, 2),
      'period', 'monthly',
      'confidence', CASE
        WHEN comparable_count >= 20 AND use_district THEN 'high'
        WHEN comparable_count >= 10 THEN 'medium'
        ELSE 'low'
      END
    ),
    'range', jsonb_build_object(
      'low', CASE
        WHEN has_input_area THEN round((base_stats.p25_ppm * p_area_m2 *
          CASE WHEN used_district_coeff THEN district_coeff ELSE 1 END)::numeric, -1)
        ELSE round((base_stats.p25_price *
          CASE WHEN used_district_coeff THEN district_coeff ELSE 1 END)::numeric, -1)
      END,
      'high', CASE
        WHEN has_input_area THEN round((base_stats.p75_ppm * p_area_m2 *
          CASE WHEN used_district_coeff THEN district_coeff ELSE 1 END)::numeric, -1)
        ELSE round((base_stats.p75_price *
          CASE WHEN used_district_coeff THEN district_coeff ELSE 1 END)::numeric, -1)
      END
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
      'districts', use_district,
      'rooms_count', (p_rooms_count IS NOT NULL),
      'building_type', use_building_type,
      'renovation', use_renovation,
      'floor', use_floor,
      'first_floor', wants_first_floor,
      'last_floor', wants_last_floor,
      'area', use_area,
      'area_tolerance', CASE WHEN use_area THEN area_tolerance ELSE null END
    ),
    'district_coefficient', CASE
      WHEN used_district_coeff THEN jsonb_build_object(
        'applied', true,
        'value', round(district_coeff::numeric, 3),
        'district_median_ppm', round(district_median_ppm::numeric, 2),
        'city_median_ppm', round(city_median_ppm::numeric, 2)
      )
      ELSE jsonb_build_object('applied', false)
    END,
    'district_comparison', COALESCE(district_comparison, '[]'::jsonb),
    'rent_level_listings', COALESCE(rent_level_listings, jsonb_build_object('low', null, 'high', null)),
    'relevant_listings', relevant_listings,
    'input', jsonb_build_object(
      'city', p_city,
      'district', primary_district,
      'districts', selected_districts,
      'rooms_count', p_rooms_count,
      'area_m2', p_area_m2,
      'floor', p_floor,
      'first_floor', wants_first_floor,
      'last_floor', wants_last_floor,
      'total_floors', p_total_floors,
      'building_type', selected_building_types[1],
      'building_types', selected_building_types,
      'renovation', p_renovation,
      'bathrooms_count', p_bathrooms_count,
      'balconies_count', p_balconies_count
    )
  );

  RETURN result;
END;
$$;
