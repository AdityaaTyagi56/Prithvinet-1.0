DROP TABLE IF EXISTS staging_official_air_import;
CREATE TABLE staging_official_air_import (
  avg_value text,
  city text,
  country text,
  last_update text,
  latitude text,
  longitude text,
  max_value text,
  min_value text,
  pollutant_id text,
  state text,
  station text
);

COPY staging_official_air_import
FROM '/tmp/official_air.csv'
WITH (FORMAT csv, HEADER true);

INSERT INTO monitoring_units (id, parameter, unit, description)
SELECT gen_random_uuid(), p.parameter, p.unit, p.description
FROM (
  VALUES
    ('PM10','ug/m3','Official CPCB PM10'),
    ('PM2.5','ug/m3','Official CPCB PM2.5'),
    ('SO2','ug/m3','Official CPCB SO2'),
    ('NO2','ug/m3','Official CPCB NO2'),
    ('CO','mg/m3','Official CPCB CO'),
    ('NH3','ug/m3','Official CPCB NH3'),
    ('OZONE','ug/m3','Official CPCB OZONE')
) AS p(parameter, unit, description)
WHERE NOT EXISTS (
  SELECT 1 FROM monitoring_units mu WHERE UPPER(mu.parameter) = UPPER(p.parameter)
);

INSERT INTO monitoring_locations (id, name, location, type, industry_id, region_id, iot_device_id, is_active)
SELECT
  gen_random_uuid(),
  s.station,
  CASE WHEN COALESCE(TRIM(s.latitude), '') <> '' AND COALESCE(TRIM(s.longitude), '') <> ''
    THEN s.latitude || ',' || s.longitude
    ELSE NULL
  END,
  CAST('air' AS locationtype),
  NULL,
  (SELECT id FROM regional_offices WHERE LOWER(state) LIKE '%chhattisgarh%' ORDER BY created_at ASC LIMIT 1),
  'govapi-air-' || md5(LOWER(s.station)),
  TRUE
FROM staging_official_air_import s
WHERE COALESCE(TRIM(s.station), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM monitoring_locations ml WHERE LOWER(ml.name) = LOWER(s.station)
  )
GROUP BY s.station, s.latitude, s.longitude;

INSERT INTO sensor_readings (id, location_id, parameter_id, value, unit_id, recorded_at, source, quality_flag)
SELECT
  gen_random_uuid(),
  ml.id,
  mu.id,
  NULLIF(s.avg_value, '')::double precision,
  mu.id,
  to_timestamp(s.last_update, 'DD-MM-YYYY HH24:MI:SS')::timestamptz,
  CAST('manual' AS sourcetype),
  'govapi-official'
FROM staging_official_air_import s
JOIN monitoring_locations ml ON LOWER(ml.name) = LOWER(s.station)
JOIN monitoring_units mu ON UPPER(mu.parameter) = UPPER(s.pollutant_id)
WHERE NULLIF(s.avg_value, '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sensor_readings sr
    WHERE sr.location_id = ml.id
      AND sr.parameter_id = mu.id
      AND sr.recorded_at = to_timestamp(s.last_update, 'DD-MM-YYYY HH24:MI:SS')::timestamptz
  );

DROP TABLE IF EXISTS staging_official_air_import;

SELECT COUNT(*) AS official_locations
FROM monitoring_locations
WHERE iot_device_id LIKE 'govapi-air-%';

SELECT COUNT(*) AS official_readings
FROM sensor_readings
WHERE quality_flag = 'govapi-official';
