const test = require("node:test");
const assert = require("node:assert/strict");
const { hydrateBirthLocation } = require("../controllers/horoscopeController");

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