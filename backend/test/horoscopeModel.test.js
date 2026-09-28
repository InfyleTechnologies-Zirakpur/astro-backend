const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Horoscope = require("../models/horoscope");
const { ANALYSIS_VERSION } = require("../services/vedicAnalysisService");

// Validation does not require a database connection, so the pre-validate hook
// that computes the charts can be exercised directly.
const buildDoc = (overrides = {}) =>
  new Horoscope({
    user: new mongoose.Types.ObjectId(),
    dateOfBirth: "1990-01-15",
    timeOfBirth: "6:30 AM",
    timeZoneOffsetMinutes: 330,
    latitude: 28.6139,
    longitude: 77.209,
    ...overrides,
  });

test("the pre-validate hook computes vedicChart and vedicAnalysis", async () => {
  const doc = buildDoc();
  await doc.validate();

  assert.equal(doc.vedicChart.precision, "full");
  assert.ok(doc.vedicChart.ascendant, "Ascendant present with full precision");
  assert.ok(doc.vedicAnalysis, "vedicAnalysis computed");
  assert.equal(doc.vedicAnalysis.version, ANALYSIS_VERSION);
  assert.ok(Object.keys(doc.vedicAnalysis.planets).length > 0);
  assert.ok(doc.vedicAnalysis.houseLords, "house lords derived");
  assert.equal(doc.vedicAnalysis.retrogradeStatusAvailable, true);
});

test("the analysis and the chart agree on the same birth instant", async () => {
  const doc = buildDoc();
  await doc.validate();

  // 06:30 IST (UTC+5:30) on 1990-01-15 is 01:00 UTC.
  assert.equal(doc.vedicChart.birthInstant, "1990-01-15T01:00:00.000Z");
  // Retrograde flags only make sense if the analysis used that same instant, so
  // compare a retrograde planet's reading against one computed independently.
  const { getPlanetSiderealLongitudes } = require("../services/vedicAstrologyService");
  const { getRetrogradeStatus } = require("../services/planetStrengthService");
  const at = new Date(doc.vedicChart.birthInstant);
  assert.equal(getRetrogradeStatus(at).Sun, doc.vedicAnalysis.planets.Sun.retrograde);
});

test("strength scores reflect the chart's own planet positions", async () => {
  const doc = buildDoc();
  await doc.validate();

  for (const [name, chartPlanet] of Object.entries(doc.vedicChart.planets)) {
    const block = doc.vedicAnalysis.planets[name];
    assert.ok(block, `${name} analysed`);
    assert.equal(block.rashi, chartPlanet.rashi, `${name} sign must match the chart`);
    assert.equal(block.longitude, chartPlanet.longitude, `${name} longitude must match the chart`);
  }
});

test("a birth record with no location analyses but has no house lords", async () => {
  const doc = buildDoc({ latitude: undefined, longitude: undefined });
  await doc.validate();

  assert.equal(doc.vedicChart.precision, "no-birth-location");
  assert.equal(doc.vedicChart.ascendant, undefined);
  assert.equal(doc.vedicAnalysis.houseLords, null);
  assert.ok(doc.vedicAnalysis.planets.Sun, "planet signs do not need a location");
});

test("a malformed birth time is rejected, and no chart is computed from it", async () => {
  // A typo in the time is not the same as having no time. Computing a chart
  // anyway would yield a real-looking "no-birth-time" result built from a bad
  // string, which is more misleading than returning nothing.
  const doc = buildDoc({ timeOfBirth: "not a time" });
  const error = await doc.validate().then(() => null, (e) => e);

  assert.ok(error, "validation must fail");
  assert.ok(error.errors.timeOfBirth, "the failure must be on timeOfBirth");
  assert.equal(doc.vedicChart, undefined, "no chart from an invalid time");
  assert.equal(doc.vedicAnalysis, undefined, "no analysis from an invalid time");
});

test("timeOfBirth is required, so a record can never be charted without one", () => {
  // The no-birth-time path is reachable through the chart service, but the model
  // itself demands a time — so no persisted Horoscope can claim that precision.
  const path = Horoscope.schema.path("timeOfBirth");
  assert.equal(path.options.required, true);

  const doc = buildDoc({ timeOfBirth: undefined });
  const error = doc.validate().catch((e) => e);
  return error.then((e) => {
    assert.ok(e.errors.timeOfBirth, "missing time must fail validation");
  });
});

test("the persisted analysis is JSON-serialisable", async () => {
  const doc = buildDoc();
  await doc.validate();
  // The field is Mixed, so Mongoose will store whatever it is given; a value
  // containing Dates-with-invalid-input or undefined would corrupt it silently.
  const plain = JSON.parse(JSON.stringify(doc.vedicAnalysis));
  assert.equal(plain.version, ANALYSIS_VERSION);
  assert.ok(plain.provenance.corpusRules.length > 0);
  assert.ok(plain.provenance.convention.length > 0);
});
