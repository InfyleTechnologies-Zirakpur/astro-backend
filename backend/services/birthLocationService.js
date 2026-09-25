const moment = require("moment-timezone");
const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { "User-Agent": "backend-astrology-service" },
  });

  if (!response.ok) {
    throw new Error(`Geocoding request failed with status ${response.status}`);
  }

  return response.json();
};

const lookupPlace = async (placeOfBirth) => {
  const query = encodeURIComponent(String(placeOfBirth || "").trim());
  if (!query) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`;
  const rows = await fetchJson(url);
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const row = rows[0];
  const latitude = Number.parseFloat(row.lat);
  const longitude = Number.parseFloat(row.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    placeOfBirth: row.display_name || row.name || placeOfBirth,
  };
};

// Resolves the timezone for a coordinate pair, preferring the HISTORICAL
// UTC offset that was in effect at the birth moment over the CURRENT offset.
// Open-Meteo reports the IANA timezone name (necessary for DST history) plus
// today's utc_offset_seconds. moment-timezone then converts the birth
// moment's offset using its full IANA (default) timezone database.
const resolveTimeZoneInfo = async ({ latitude, longitude, birthDate }) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  let weather;
  try {
    const timezoneUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`;
    weather = await fetchJson(timezoneUrl);
  } catch (error) {
    return null;
  }
  if (!weather || !Number.isFinite(weather.utc_offset_seconds)) return null;

  const currentOffsetMinutes = Math.round(weather.utc_offset_seconds / 60);
  const timeZoneId = typeof weather.timezone === "string" ? weather.timezone : null;

  const birthInstant = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const hasUsableZone = timeZoneId && moment.tz.zone(timeZoneId);
  const birthYear = Number.isNaN(birthInstant.getTime()) ? NaN : birthInstant.getUTCFullYear();
  const canResolveHistorical =
    hasUsableZone &&
    Number.isFinite(birthYear) &&
    birthYear >= 1900 &&
    birthYear <= 2038; // moment-timezone's IANA historical data is reliable in this range.

  if (canResolveHistorical) {
    const year = birthInstant.getUTCFullYear();
    const month = String(birthInstant.getUTCMonth() + 1).padStart(2, "0");
    const day = String(birthInstant.getUTCDate()).padStart(2, "0");
    const noonLocal = `${year}-${month}-${day}T12:00:00`;
    const historicalOffset = moment.tz(noonLocal, timeZoneId).utcOffset();
    if (Number.isFinite(historicalOffset)) {
      return { timeZoneOffsetMinutes: historicalOffset, timeZoneId, timeZonePrecision: "historical" };
    }
  }

  return {
    timeZoneOffsetMinutes: currentOffsetMinutes,
    timeZoneId: timeZoneId || null,
    timeZonePrecision: "current-estimate",
  };
};

// Resolves a place string into { latitude, longitude, placeOfBirth,
// timeZoneOffsetMinutes, timeZoneId, timeZonePrecision }.
// Returns null when the place (or its timezone) cannot be resolved — callers
// must treat null as a hard failure rather than silently assume UTC.
const resolveBirthLocationFromPlace = async (placeOfBirth, birthDate) => {
  const resolvedPlace = await lookupPlace(placeOfBirth);
  if (!resolvedPlace) return null;

  const timeZoneInfo = await resolveTimeZoneInfo({ ...resolvedPlace, birthDate });
  if (!timeZoneInfo) return null;

  return {
    ...resolvedPlace,
    ...timeZoneInfo,
  };
};

module.exports = {
  lookupPlace,
  resolveTimeZoneInfo,
  resolveBirthLocationFromPlace,
};