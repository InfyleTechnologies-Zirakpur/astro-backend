const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveBirthLocationFromPlace,
} = require("../services/birthLocationService");

test("resolveBirthLocationFromPlace resolves coordinates and timezone offset for a place string", async () => {
  const result = await resolveBirthLocationFromPlace(
    "New York, United States",
    new Date("2026-09-14T00:00:00Z"),
  );
  assert.equal(typeof result.latitude, "number");
  assert.equal(typeof result.longitude, "number");
  assert.equal(typeof result.timeZoneOffsetMinutes, "number");
  assert.ok(result.latitude >= -90 && result.latitude <= 90);
  assert.ok(result.longitude >= -180 && result.longitude <= 180);
});
