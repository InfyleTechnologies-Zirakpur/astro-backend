const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateVedicChart } = require("../services/vedicAstrologyService");
const { getDashaTimeline } = require("../services/dashaService");

// End-to-end regression test for the birth data the user reported as broken:
// the chart showed a MARS mahadasha where the reference calculator showed a
// RAHU mahadasha.
//
// Root cause of the original bug: the natal chart computed TOPOCENTRIC
// planetary longitudes whenever birth coordinates were present. The Moon's
// diurnal parallax (~1 deg) pushed it into a different nakshatra, and since
// the whole Vimshottari chain is anchored on the birth Moon, every dasha
// boundary moved by months and the running mahadasha came out as the wrong
// planet.
//
// The chart is now geocentric and the ayanamsha is Swiss-Ephemeris-compatible
// (SE_SIDM_LAHIRI + nutation in longitude), so the Moon's sidereal longitude
// agrees with Swiss Ephemeris to <1 arcsecond and the dasha chain matches the
// reference calculator.
const REFERENCE_BIRTH = {
  dateOfBirth: "1989-08-31",
  timeOfBirth: "18:24",
  timeZoneOffsetMinutes: 330, // Asia/Kolkata
  latitude: 29.5818, // Hanumangarh, Rajasthan
  longitude: 74.3294,
};

const IST = "Asia/Kolkata";
const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-GB", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" });

test("the reported birth data produces the Rahu mahadasha, not Mars", () => {
  const chart = calculateVedicChart(REFERENCE_BIRTH);

  assert.equal(chart.birthInstant, "1989-08-31T12:54:00.000Z");
  assert.equal(chart.positionReference, "geocentric");

  // Swiss Ephemeris sidereal Moon for this instant: 137.7290498724755.
  assert.ok(Math.abs(chart.planets.Moon.longitude - 137.7290498724755) < 0.001);
  assert.equal(chart.planets.Moon.rashi, "Leo");
  assert.equal(chart.moonNakshatra.name, "Purva Phalguni");
  assert.equal(chart.moonNakshatra.pada, 2);

  const timeline = getDashaTimeline({
    moonSiderealLongitude: chart.planets.Moon.longitude,
    birthDate: new Date(chart.birthInstant),
    atDate: new Date("2026-10-22T00:00:00Z"),
    mahadashaCount: 6,
  });

  // The first (partial) period belongs to the birth nakshatra lord: Venus
  // rules Purva Phalguni.
  assert.equal(timeline.balance.lord, "Venus");
  assert.equal(timeline.mahadashas[0].planet, "Venus");
  assert.equal(timeline.mahadashas[0].isPartialAtBirth, true);

  // The running mahadasha on 22 Oct 2026 is Rahu — NOT Mars.
  assert.equal(timeline.current.mahadasha.planet, "Rahu");
  assert.equal(formatDate(timeline.current.mahadasha.start), "27 Jan 2026");
  assert.equal(formatDate(timeline.current.mahadasha.end), "27 Jan 2044");

  // Sub-period boundaries match the reference calculator exactly.
  const rahuAntardasha = timeline.antardashas[0];
  assert.equal(rahuAntardasha.planet, "Rahu");
  assert.equal(formatDate(rahuAntardasha.end), "09 Oct 2028");

  const jupiterPratyantardasha = timeline.pratyantardashas.find((p) => p.planet === "Jupiter");
  assert.equal(formatDate(jupiterPratyantardasha.start), "24 Jun 2026");
  assert.equal(formatDate(jupiterPratyantardasha.end), "02 Nov 2026");

  // The graha order of the chain itself: Venus -> Sun -> Moon -> Mars ->
  // Rahu -> Jupiter.
  assert.deepEqual(
    timeline.mahadashas.map((m) => m.planet),
    ["Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter"]
  );
});

test("the chart and the dasha always agree on the birth nakshatra", () => {
  const chart = calculateVedicChart(REFERENCE_BIRTH);
  const timeline = getDashaTimeline({
    moonSiderealLongitude: chart.planets.Moon.longitude,
    birthDate: new Date(chart.birthInstant),
    atDate: new Date("2026-10-22T00:00:00Z"),
  });

  assert.equal(timeline.balance.nakshatra, chart.moonNakshatra.name);
  assert.equal(timeline.balance.lord, "Venus"); // Purva Phalguni is ruled by Venus
});
