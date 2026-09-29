const test = require("node:test");
const assert = require("node:assert/strict");
const Astronomy = require("astronomy-engine");
const { calculateVedicChart, getPlanetSiderealLongitudes } = require("../services/vedicAstrologyService");
const { toSidereal } = require("../services/ayanamsha");

const BIRTH = {
  dateOfBirth: "1990-01-15",
  timeOfBirth: "06:30",
  timeZoneOffsetMinutes: 330,
  latitude: 28.6139,
  longitude: 77.209,
};

const angularDifference = (first, second) => {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
};

test("full Vedic charts use topocentric planetary positions when birth coordinates exist", () => {
  const chart = calculateVedicChart(BIRTH);
  assert.equal(chart.positionReference, "topocentric");

  const instant = new Date(chart.birthInstant);
  const observer = new Astronomy.Observer(BIRTH.latitude, BIRTH.longitude, 0);
  const moonEquatorial = Astronomy.Equator(Astronomy.Body.Moon, instant, observer, true, true);
  const moonEcliptic = Astronomy.RotateVector(Astronomy.Rotation_EQD_ECT(instant), moonEquatorial.vec);
  const expectedMoonLongitude = toSidereal(
    ((Math.atan2(moonEcliptic.y, moonEcliptic.x) * (180 / Math.PI)) % 360 + 360) % 360,
    instant
  );
  assert.ok(angularDifference(chart.planets.Moon.longitude, expectedMoonLongitude) < 1e-10);

  const geocentric = getPlanetSiderealLongitudes(instant);
  assert.equal(geocentric.positionReference, "geocentric");
  assert.ok(angularDifference(chart.planets.Moon.longitude, geocentric.sidereal.Moon) > 0.1);
});

test("charts without coordinates are explicitly marked geocentric", () => {
  const chart = calculateVedicChart({
    dateOfBirth: BIRTH.dateOfBirth,
    timeOfBirth: BIRTH.timeOfBirth,
    timeZoneOffsetMinutes: BIRTH.timeZoneOffsetMinutes,
  });

  assert.equal(chart.positionReference, "geocentric");
  assert.equal(chart.precision, "no-birth-location");
});

test("Chandigarh birth details use IST for the ascendant and whole-sign houses", () => {
  const chart = calculateVedicChart({
    dateOfBirth: "2001-12-02",
    timeOfBirth: "16:45",
    timeZoneOffsetMinutes: 330,
    latitude: 30.7333,
    longitude: 76.7794,
  });

  assert.equal(chart.birthInstant, "2001-12-02T11:15:00.000Z");
  assert.equal(chart.ascendant.rashi, "Taurus");
  assert.equal(chart.planets.Sun.rashi, "Scorpio");
  assert.equal(chart.planets.Sun.house, 7);
  assert.equal(chart.planets.Moon.rashi, "Gemini");
  assert.equal(chart.planets.Moon.house, 2);
});