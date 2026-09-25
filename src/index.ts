interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * openSenseMap MCP — citizen-science environmental sensor network (opensensemap.org)
 *
 * Tools:
 * - opensensemap_nearby: senseBox sensor stations near a lat/lon with latest readings
 * - opensensemap_box: full sensor readout for one station by id
 * - opensensemap_area_average: average a phenomenon over a bounding box / radius
 *
 * Keyless. api.opensensemap.org — thousands of community-operated senseBox
 * stations worldwide reporting temperature, humidity, air pressure, PM2.5,
 * PM10, illuminance, UV and noise. Sensors are hobbyist hardware and
 * UNCALIBRATED — quality varies station to station; treat single readings
 * as indicative, and prefer area averages over one box.
 *
 * API quirks (verified live):
 * - `near` takes LON,LAT (GeoJSON order), maxDistance in meters.
 * - Phenomenon names are mostly German: "Temperatur", "rel. Luftfeuchte"
 *   (humidity), "Luftdruck" (pressure), "Beleuchtungsstärke" (illuminance),
 *   "UV-Intensität", "Lautstärke" (noise); "PM2.5"/"PM10" as-is.
 * - Many registered boxes are dead: near Berlin only ~7% reported within
 *   7 days — freshness filtering is essential.
 * - The /boxes list endpoint returns sensor `lastMeasurement` as an opaque
 *   id string; only /boxes/{id} returns the {value, createdAt} object.
 * - /statistics/descriptive is unusably slow; area averages use
 *   /boxes/data (raw measurements) and aggregate client-side.
 */


const BASE_URL = 'https://api.opensensemap.org';
const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const PHENOMENON_HINT =
  'Phenomenon names on openSenseMap are mostly German (exact sensor titles): ' +
  '"Temperatur" (temperature °C), "rel. Luftfeuchte" (relative humidity %), ' +
  '"Luftdruck" (air pressure hPa), "PM2.5" and "PM10" (particulate matter µg/m³), ' +
  '"Beleuchtungsstärke" (illuminance lx), "UV-Intensität" (UV µW/cm²), "Lautstärke" (noise)';

const tools: McpToolExport['tools'] = [
  {
    name: 'opensensemap_nearby',
    description:
      'Find citizen science sensor stations (senseBox, openSenseMap network) near a lat/lon and return their latest readings — hyperlocal temperature, humidity, air pressure, PM2.5/PM10 air quality, illuminance, UV, noise. Answers "sensor readings near me", "what does the local air quality sensor say". Community-operated uncalibrated hardware: quality varies, so cross-check outliers. Filter to one measurement type with `phenomenon` (' +
      PHENOMENON_HINT +
      '). Stations silent for more than 7 days are skipped unless include_stale=true. Example: opensensemap_nearby({ latitude: 52.52, longitude: 13.405, phenomenon: "PM2.5" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        latitude: { type: 'number', description: 'Latitude of the search center, e.g. 52.52' },
        longitude: { type: 'number', description: 'Longitude of the search center, e.g. 13.405' },
        radius_km: { type: 'number', description: 'Search radius in km, 0.1-50 (default 10)' },
        phenomenon: {
          type: 'string',
          description:
            'Optional filter — only stations measuring this phenomenon. Common titles: "Temperatur", "rel. Luftfeuchte", "Luftdruck", "PM2.5", "PM10", "Beleuchtungsstärke", "UV-Intensität", "Lautstärke" (matched case-insensitively as a substring)',
        },
        limit: { type: 'number', description: 'Max stations to return with full readings, 1-10 (default 5)' },
        include_stale: {
          type: 'boolean',
          description: 'Include stations whose last measurement is older than 7 days (default false)',
        },
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'opensensemap_box',
    description:
      'Get one openSenseMap citizen science sensor station (senseBox) by its box id — full sensor readout with latest value, unit, and measurement time per sensor (temperature, humidity, PM2.5/PM10 air quality, pressure, noise...), plus location, exposure (outdoor/indoor/mobile) and station metadata. Box ids come from opensensemap_nearby. Community-operated uncalibrated sensors. Example: opensensemap_box({ box_id: "65e8d93acbf5700007f920ca" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        box_id: { type: 'string', description: '24-char openSenseMap box id, e.g. "65e8d93acbf5700007f920ca"' },
      },
      required: ['box_id'],
    },
  },
  {
    name: 'opensensemap_area_average',
    description:
      'Average one phenomenon across all citizen science sensors (openSenseMap / senseBox network) in an area — hyperlocal neighborhood-level temperature, PM2.5/PM10 air quality, humidity, pressure or noise from many independent community stations. Give either a bounding box or a center point + radius_km. Aggregates the latest reading per sensor over the recent window client-side (the network has no fast server-side aggregation). ' +
      PHENOMENON_HINT +
      ' — the name must match the sensor title exactly (e.g. "Temperatur", not "temperature"). Example: opensensemap_area_average({ phenomenon: "PM2.5", latitude: 52.52, longitude: 13.405, radius_km: 5 })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        phenomenon: {
          type: 'string',
          description:
            'Exact phenomenon / sensor title, e.g. "PM2.5", "PM10", "Temperatur", "rel. Luftfeuchte", "Luftdruck", "Lautstärke"',
        },
        latitude: { type: 'number', description: 'Center latitude (use with longitude + radius_km, instead of bbox)' },
        longitude: { type: 'number', description: 'Center longitude' },
        radius_km: { type: 'number', description: 'Radius in km around the center, 0.1-25 (default 5)' },
        bbox: {
          type: 'string',
          description: 'Bounding box as "west,south,east,north" in degrees, e.g. "13.3,52.45,13.5,52.55" (overrides center+radius)',
        },
        window_hours: {
          type: 'number',
          description: "How far back to look for each sensor's latest reading, 1-24 hours (default 2)",
        },
      },
      required: ['phenomenon'],
    },
  },
];

// ---------------------------------------------------------------------------

async function api(path: string, tool: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(
        `${tool}: api.opensensemap.org did not respond within 10s. The community API can be slow — retry, or narrow the area/radius.`,
      );
    }
    throw new Error(`${tool}: could not reach api.opensensemap.org (${(err as Error).message}). Retry shortly.`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) {
    throw new Error(`${tool}: not found. Check the box_id — ids are 24-char hex strings from opensensemap_nearby.`);
  }
  if (res.status === 422 || res.status === 400) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `${tool}: openSenseMap rejected the request (${res.status}): ${body.slice(0, 200)}. Check parameter formats (coordinates as decimal degrees, ISO dates).`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `${tool}: openSenseMap API error ${res.status}. Retry shortly; the community-run API has occasional hiccups.`,
    );
  }
  return res.json();
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function requireNumber(args: Record<string, unknown>, key: string, tool: string): number {
  const alias = key === 'latitude' ? args.lat : key === 'longitude' ? (args.lon ?? args.lng) : undefined;
  const v = Number(args[key] ?? alias);
  if (!Number.isFinite(v)) {
    throw new Error(`${tool} requires numeric ${key} (decimal degrees), e.g. latitude: 52.52, longitude: 13.405.`);
  }
  return v;
}

interface OsmSensor {
  _id: string;
  title: string;
  unit?: string;
  sensorType?: string;
  // list endpoints: opaque measurement-id string; /boxes/{id}: object or null
  lastMeasurement?: string | null | { value: string; createdAt: string };
}

interface OsmBox {
  _id: string;
  name: string;
  exposure?: string;
  model?: string;
  description?: string;
  grouptag?: string[];
  currentLocation?: { coordinates: number[] };
  lastMeasurementAt?: string;
  sensors?: OsmSensor[];
}

function shapeSensor(s: OsmSensor) {
  const lm = s.lastMeasurement && typeof s.lastMeasurement === 'object' ? s.lastMeasurement : undefined;
  return {
    sensor_id: s._id,
    phenomenon: s.title,
    unit: s.unit,
    sensor_type: s.sensorType,
    last_value: lm ? Number(lm.value) : undefined,
    last_measured_at: lm?.createdAt,
  };
}

function shapeBox(b: OsmBox, distanceKm?: number) {
  const [lon, lat] = b.currentLocation?.coordinates ?? [];
  return {
    box_id: b._id,
    name: b.name,
    exposure: b.exposure,
    latitude: lat,
    longitude: lon,
    distance_km: distanceKm !== undefined ? Math.round(distanceKm * 100) / 100 : undefined,
    last_measurement_at: b.lastMeasurementAt,
    sensors: (b.sensors ?? []).map(shapeSensor),
  };
}

const DATA_QUALITY_NOTE =
  'openSenseMap stations are community-operated hobbyist sensors (senseBox and DIY builds) — uncalibrated, unvalidated, quality varies per station. Cross-check outliers against neighboring stations or official monitors.';

// ---------------------------------------------------------------------------

async function nearby(args: Record<string, unknown>) {
  const tool = 'opensensemap_nearby';
  const lat = requireNumber(args, 'latitude', tool);
  const lon = requireNumber(args, 'longitude', tool);
  const radiusKm = Math.min(Math.max(Number(args.radius_km) || 10, 0.1), 50);
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
  const includeStale = args.include_stale === true;
  const phenomenon = typeof args.phenomenon === 'string' ? args.phenomenon.trim().toLowerCase() : '';

  // NOTE: openSenseMap `near` is LON,LAT (GeoJSON order), maxDistance in meters.
  const list = (await api(
    `/boxes?near=${lon},${lat}&maxDistance=${Math.round(radiusKm * 1000)}&format=json`,
    tool,
  )) as OsmBox[];

  const now = Date.now();
  let candidates = list.filter((b) => Array.isArray(b.currentLocation?.coordinates));
  const total = candidates.length;

  if (phenomenon) {
    candidates = candidates.filter((b) =>
      (b.sensors ?? []).some((s) => s.title?.toLowerCase().includes(phenomenon)),
    );
  }
  const matchingPhenomenon = candidates.length;

  if (!includeStale) {
    candidates = candidates.filter(
      (b) => b.lastMeasurementAt && now - Date.parse(b.lastMeasurementAt) <= STALE_MS,
    );
  }

  const sorted = candidates
    .map((b) => ({
      box: b,
      dist: haversineKm(lat, lon, b.currentLocation!.coordinates[1], b.currentLocation!.coordinates[0]),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);

  // The list endpoint doesn't include measurement values — fetch box details
  // in parallel for the winners to get {value, createdAt} per sensor.
  const details = await Promise.all(
    sorted.map(async ({ box, dist }) => {
      try {
        const full = (await api(`/boxes/${box._id}`, tool)) as OsmBox;
        return shapeBox(full, dist);
      } catch {
        return shapeBox(box, dist); // degrade gracefully: metadata without values
      }
    }),
  );

  return {
    center: { latitude: lat, longitude: lon },
    radius_km: radiusKm,
    phenomenon_filter: phenomenon || undefined,
    stations_in_radius: total,
    ...(phenomenon ? { stations_matching_phenomenon: matchingPhenomenon } : {}),
    stations_reporting_last_7d: includeStale ? undefined : candidates.length,
    count: details.length,
    stations: details,
    note:
      details.length === 0
        ? `No ${includeStale ? '' : 'active '}stations found within ${radiusKm} km${phenomenon ? ` measuring "${args.phenomenon}"` : ''}. Many registered boxes are dead (near Berlin only ~7% reported within 7 days) — try include_stale: true, a larger radius_km, or drop the phenomenon filter. ${PHENOMENON_HINT}.`
        : DATA_QUALITY_NOTE,
  };
}

async function boxDetail(args: Record<string, unknown>) {
  const tool = 'opensensemap_box';
  const id = String(args.box_id ?? args.id ?? '').trim();
  if (!/^[0-9a-f]{24}$/i.test(id)) {
    throw new Error(`${tool} requires box_id — a 24-char hex id from opensensemap_nearby (got "${id}").`);
  }
  const b = (await api(`/boxes/${id}`, tool)) as OsmBox;
  const now = Date.now();
  const stale = !b.lastMeasurementAt || now - Date.parse(b.lastMeasurementAt) > STALE_MS;
  return {
    ...shapeBox(b),
    model: b.model,
    description: b.description,
    group_tags: b.grouptag?.filter(Boolean),
    is_stale: stale,
    note: stale
      ? `This station last reported at ${b.lastMeasurementAt ?? 'unknown'} (>7 days ago) — readings below are historical, not current. ${DATA_QUALITY_NOTE}`
      : DATA_QUALITY_NOTE,
  };
}

interface OsmMeasurement {
  createdAt: string;
  value: string;
  sensorId: string;
  lat?: number;
  lon?: number;
}

async function areaAverage(args: Record<string, unknown>) {
  const tool = 'opensensemap_area_average';
  const phenomenon = String(args.phenomenon ?? '').trim();
  if (!phenomenon) {
    throw new Error(
      `${tool} requires phenomenon — the exact sensor title, e.g. "PM2.5", "PM10", "Temperatur". ${PHENOMENON_HINT}.`,
    );
  }

  let bbox = typeof args.bbox === 'string' ? args.bbox.trim() : '';
  if (bbox) {
    const parts = bbox.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      throw new Error(`${tool}: bbox must be "west,south,east,north" in decimal degrees, e.g. "13.3,52.45,13.5,52.55".`);
    }
  } else {
    const lat = requireNumber(args, 'latitude', tool);
    const lon = requireNumber(args, 'longitude', tool);
    const radiusKm = Math.min(Math.max(Number(args.radius_km) || 5, 0.1), 25);
    const dLat = radiusKm / 111.32;
    const dLon = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.05));
    bbox = `${(lon - dLon).toFixed(5)},${(lat - dLat).toFixed(5)},${(lon + dLon).toFixed(5)},${(lat + dLat).toFixed(5)}`;
  }

  const windowHours = Math.min(Math.max(Number(args.window_hours) || 2, 1), 24);
  const fromDate = new Date(Date.now() - windowHours * 3600_000).toISOString();

  // /boxes/data returns raw measurements in the window; openSenseMap's
  // server-side aggregation (/statistics/descriptive) is too slow to use,
  // so we aggregate here: latest reading per sensor, then average (cap 50).
  const rows = (await api(
    `/boxes/data?phenomenon=${encodeURIComponent(phenomenon)}&bbox=${bbox}&from-date=${encodeURIComponent(fromDate)}&format=json`,
    tool,
  )) as OsmMeasurement[];

  const latestPerSensor = new Map<string, OsmMeasurement>();
  for (const r of rows) {
    const prev = latestPerSensor.get(r.sensorId);
    if (!prev || r.createdAt > prev.createdAt) latestPerSensor.set(r.sensorId, r);
  }

  const SENSOR_CAP = 50;
  const totalSensors = latestPerSensor.size;
  const readings = [...latestPerSensor.values()]
    .map((r) => ({ ...r, num: Number(r.value) }))
    .filter((r) => Number.isFinite(r.num))
    .slice(0, SENSOR_CAP);

  if (readings.length === 0) {
    return {
      phenomenon,
      bbox,
      window_hours: windowHours,
      sensor_count: 0,
      average: null,
      note: `No "${phenomenon}" measurements in this area in the last ${windowHours}h. The phenomenon name must match the sensor title exactly and is often German — ${PHENOMENON_HINT}. Also try a larger area or window_hours.`,
    };
  }

  const values = readings.map((r) => r.num);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  // Broken community sensors do report physically impossible values (we've
  // seen -141 °C) — the median is the outlier-resistant number to trust.
  const sortedVals = [...values].sort((a, b) => a - b);
  const mid = sortedVals.length >> 1;
  const median = sortedVals.length % 2 ? sortedVals[mid] : (sortedVals[mid - 1] + sortedVals[mid]) / 2;

  return {
    phenomenon,
    bbox,
    window_hours: windowHours,
    sensor_count: readings.length,
    ...(totalSensors > SENSOR_CAP
      ? { sensors_in_area: totalSensors, note_cap: `Averaged the first ${SENSOR_CAP} of ${totalSensors} sensors.` }
      : {}),
    measurements_in_window: rows.length,
    average: Math.round(avg * 100) / 100,
    median: Math.round(median * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values),
    newest_reading_at: readings.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt,
    stations: readings.map((r) => ({
      sensor_id: r.sensorId,
      value: r.num,
      measured_at: r.createdAt,
      latitude: r.lat,
      longitude: r.lon,
    })),
    note: `Client-side average of each sensor's latest reading within the last ${windowHours}h (openSenseMap has no fast server-side aggregation). Prefer the median when min/max look implausible — broken sensors do report impossible values. ${DATA_QUALITY_NOTE}`,
  };
}

// ---------------------------------------------------------------------------

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'opensensemap_nearby':
      return nearby(args);
    case 'opensensemap_box':
      return boxDetail(args);
    case 'opensensemap_area_average':
      return areaAverage(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
