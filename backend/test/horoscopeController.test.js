const test = require("node:test");
const assert = require("node:assert/strict");
const { hydrateBirthLocation, buildDashaPayload } = require("../controllers/horoscopeController");
const { calculateVedicChart } = require("../services/vedicAstrologyService");

test("a birth place overrides a client-default zero timezone offset", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const hostname = new URL(url).hostname;
    if (hostname === "nominatim.openstreetmap.org") {
      return {
        ok: true,
        json: async () => [{ lat: "30.7333", lon: "76.7794", display_name: "Chandigarh, India" }],
      };
    }
    if (hostname === "api.open-meteo.com") {
      return {
        ok: true,
        json: async () => ({ timezone: "Asia/Kolkata", utc_offset_seconds: 19800 }),
      };
    }
    throw new Error(`Unexpected request to ${hostname}`);
  };

  try {
    const data = await hydrateBirthLocation({
      birthDate: "2001-12-02",
      birthTime: "4:45 PM",
      birthPlace: "Chandigarh, India",
      timeZoneOffsetMinutes: 0,
    });

    assert.equal(data.timeZoneOffsetMinutes, 330);
    assert.equal(data.timeZoneId, "Asia/Kolkata");
    assert.equal(data.timeZonePrecision, "historical");
    assert.equal(data.latitude, 30.7333);
    assert.equal(data.longitude, 76.7794);
  } finally {
    global.fetch = originalFetch;
  }
});

test("the chart endpoint carries the running dasha with it", () => {
  // The dasha travels with the chart so the app needs one request for
  // "chart + dasha" instead of two.
  const birth = {
    dateOfBirth: "1989-08-31",
    timeOfBirth: "18:24",
    timeZoneOffsetMinutes: 330,
    latitude: 29.5818,
    longitude: 74.3294,
  };
  const chart = calculateVedicChart(birth);

  const dasha = buildDashaPayload(
    { ...birth, dateOfBirth: new Date("1989-08-31T00:00:00Z"), vedicChart: chart },
    new Date("2026-10-22T00:00:00Z")
  );

  assert.ok(dasha, "a dasha is produced");
  assert.equal(dasha.current.mahadasha.planet, "Rahu");
  assert.equal(dasha.current.antardasha.planet, "Rahu");
  assert.equal(dasha.current.pratyantardasha.planet, "Jupiter");
  assert.equal(dasha.balanceAtBirth.nakshatra, chart.moonNakshatra.name);
  assert.ok(Array.isArray(dasha.antardashas) && dasha.antardashas.length === 9);
  assert.ok(Array.isArray(dasha.pratyantardashas) && dasha.pratyantardashas.length === 9);
});

test("a horoscope without a chart yields no dasha rather than a guess", () => {
  assert.equal(buildDashaPayload({ dateOfBirth: "1990-01-15" }), null);
});