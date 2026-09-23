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

const resolveTimeZoneOffsetMinutes = async ({ latitude, longitude }) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 0;

  try {
    const timezoneUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`;
    const weather = await fetchJson(timezoneUrl);
    if (!weather || !Number.isFinite(weather.utc_offset_seconds)) return 0;

    return Math.round(weather.utc_offset_seconds / 60);
  } catch (error) {
    return 0;
  }
};

const resolveBirthLocationFromPlace = async (placeOfBirth) => {
  const resolvedPlace = await lookupPlace(placeOfBirth);
  if (!resolvedPlace) {
    return { latitude: null, longitude: null, timeZoneOffsetMinutes: 0, placeOfBirth };
  }

  const timeZoneOffsetMinutes = await resolveTimeZoneOffsetMinutes(resolvedPlace);
  return {
    ...resolvedPlace,
    timeZoneOffsetMinutes,
  };
};

module.exports = {
  lookupPlace,
  resolveTimeZoneOffsetMinutes,
  resolveBirthLocationFromPlace,
};
