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

test("full Vedic charts use geocentric planetary positions even when birth coordinates exist", () => {
  const chart = calculateVedicChart(BIRTH);
  assert.equal(chart.positionReference, "geocentric");

  const instant = new Date(chart.birthInstant);

  // The chart's Moon is the geocentric apparent position, converted to the
  // sidereal zodiac with the true (nutation-corrected) Lahiri ayanamsha.
  const moonTropical = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Moon, instant, true)).elon;
  const expectedMoonLongitude = toSidereal(moonTropical, instant);
  assert.ok(angularDifference(chart.planets.Moon.longitude, expectedMoonLongitude) < 1e-10);

  // A topocentric Moon would differ by up to ~1 deg (the Moon's diurnal
  // parallax). That is enough to move it into a neighbouring nakshatra and
  // shift the whole Vimshottari dasha chain by months, so the chart must
  // never drift back to it.
  const observer = new Astronomy.Observer(BIRTH.latitude, BIRTH.longitude, 0);
  const topocentricEquatorial = Astronomy.Equator(Astronomy.Body.Moon, instant, observer, true, true);
  const topocentricEcliptic = Astronomy.RotateVector(Astronomy.Rotation_EQD_ECT(instant), topocentricEquatorial.vec);
  const topocentricLongitude = toSidereal(
    ((Math.atan2(topocentricEcliptic.y, topocentricEcliptic.x) * (180 / Math.PI)) % 360 + 360) % 360,
    instant
  );
  assert.ok(angularDifference(chart.planets.Moon.longitude, topocentricLongitude) > 0.1);

  const geocentric = getPlanetSiderealLongitudes(instant);
  assert.equal(geocentric.positionReference, "geocentric");
  assert.ok(angularDifference(chart.planets.Moon.longitude, geocentric.sidereal.Moon) < 1e-10);
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