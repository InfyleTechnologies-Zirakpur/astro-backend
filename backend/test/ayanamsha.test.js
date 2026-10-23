const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getAyanamsha,
  getTrueAyanamsha,
  getNutationInLongitude,
  toSidereal,
} = require("../services/ayanamsha");

// Reference values produced by Swiss Ephemeris 2.10.3 (sweph), which is the
// de-facto standard behind every Indian astrology package. They are pinned
// here as regression anchors so a future change to the ayanamsha model can
// never silently drift away from the community standard.
//
//   swe.set_sid_mode(swe.constants.SE_SIDM_LAHIRI, 0, 0);
//   swe.get_ayanamsa_ut(jd)                     -> mean Lahiri ayanamsha
//   swe.get_ayanamsa_ex_ut(jd, SEFLG_SWIEPH,
//       SE_SIDM_LAHIRI, null).data              -> mean + nutation in longitude
const SWE_J2000 = 2451545.0; // 2000-01-01 12:00 UT
const SWE_MEAN_LAHIRI_J2000 = 23.8570923537089;
const SWE_MEAN_LAHIRI_1989 = 23.712723294658815;
const SWE_TRUE_LAHIRI_1989 = 23.71567650866206;

const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);
const arcsec = (degrees) => Math.abs(degrees) * 3600;

test("the mean Lahiri ayanamsha reproduces Swiss Ephemeris", () => {
  assert.ok(Math.abs(getAyanamsha(jdToDate(SWE_J2000)) - SWE_MEAN_LAHIRI_J2000) < 1e-9);

  // 1989-08-31 12:54 UT — the reference birth instant.
  const birth = new Date("1989-08-31T12:54:00Z");
  assert.ok(arcsec(getAyanamsha(birth) - SWE_MEAN_LAHIRI_1989) < 0.01);
});

test("the true ayanamsha adds the nutation in longitude", () => {
  const birth = new Date("1989-08-31T12:54:00Z");
  assert.ok(arcsec(getTrueAyanamsha(birth) - SWE_TRUE_LAHIRI_1989) < 0.35);

  // The nutation term itself is ~10.6" on that date and stays within the
  // +/-17" envelope the IAU 1980 model allows.
  const dPsi = getNutationInLongitude(birth) * 3600;
  assert.ok(Math.abs(dPsi - 10.63) < 0.35);
});

test("the ayanamsha advances at the precession rate", () => {
  const a = getAyanamsha(new Date("1900-01-01T00:00:00Z"));
  const b = getAyanamsha(new Date("2000-01-01T00:00:00Z"));
  const perCentury = (b - a) * 3600;
  // General precession in longitude is ~50.29"/year; over the interval
  // 1900-2000 the IAU 2006 model gives ~5027.5" (the quadratic term makes it
  // slightly less than the rate at J2000).
  assert.ok(Math.abs(perCentury - 5027.5) < 2, `got ${perCentury}`);
});

test("toSidereal subtracts the true ayanamsha and normalises into 0-360", () => {
  const date = new Date("1989-08-31T12:54:00Z");
  const tropical = 161.4447264; // Swiss Ephemeris Moon, apparent geocentric ecliptic longitude
  const sidereal = toSidereal(tropical, date);

  // Swiss Ephemeris' own sidereal conversion for the same instant.
  assert.ok(Math.abs(sidereal - 137.7290498724755) < 0.001);

  // Normalisation: negative inputs and longitudes past 360 stay in range.
  assert.ok(toSidereal(-10, date) >= 0 && toSidereal(-10, date) < 360);
  assert.ok(toSidereal(400, date) >= 0 && toSidereal(400, date) < 360);
});
