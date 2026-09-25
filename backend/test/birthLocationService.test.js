const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveBirthLocationFromPlace,
  resolveTimeZoneInfo,
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

test("returns the HISTORICAL offset for a summer New York birth (EDT = -240)", async () => {
  const result = await resolveBirthLocationFromPlace(
    "New York, United States",
    new Date("2026-07-14T00:00:00Z"),
  );
  assert.equal(result.timeZonePrecision, "historical");
  assert.equal(result.timeZoneOffsetMinutes, -240);
  assert.equal(result.timeZoneId, "America/New_York");
});

test("returns the HISTORICAL offset for a winter New York birth (EST = -300)", async () => {
  const result = await resolveBirthLocationFromPlace(
    "New York, United States",
    new Date("2026-01-14T00:00:00Z"),
  );
  assert.equal(result.timeZonePrecision, "historical");
  assert.equal(result.timeZoneOffsetMinutes, -300);
  assert.equal(result.timeZoneId, "America/New_York");
});

test("returns IST (+330) for an India birth", async () => {
  const result = await resolveBirthLocationFromPlace(
    "Mumbai, India",
    new Date("2026-07-14T00:00:00Z"),
  );
  assert.equal(result.timeZonePrecision, "historical");
  assert.equal(result.timeZoneOffsetMinutes, 330);
  assert.equal(result.timeZoneId, "Asia/Kolkata");
});

test("returns null for an unresolvable place (no silent UTC-0)", async () => {
  const result = await resolveBirthLocationFromPlace(
    "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogochxzx",
    new Date("2026-07-14T00:00:00Z"),
  );
  assert.equal(result, null);
});

test("resolveTimeZoneInfo returns null for invalid coordinates", async () => {
  const result = await resolveTimeZoneInfo({ latitude: "not-a-number", longitude: 10 });
  assert.equal(result, null);
});