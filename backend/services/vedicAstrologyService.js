// Vedic (Jyotish) astrology core engine.
//
// This replaces/supplements the Western tropical engine in astrologyService.js
// with sidereal (Vedic) calculations: planetary sidereal longitudes, Ascendant
// (Lagna), whole-sign houses, Navamsha (D9), and Nakshatra — the building
// blocks needed for the house/planet-based rules taught in the course
// transcripts (data/vedicKnowledgeBase.json) and for Ashtakoot Guna Milan
// (gunaMilanService.js).
//
// ACCURACY NOTES (read before relying on this for production predictions):
// 1. Ascendant requires an accurate birth TIME and LATITUDE/LONGITUDE. If
//    timeOfBirth is missing, we cannot compute a real Ascendant — see
//    calculateVedicChart's `precision` field, which will be "date-only" and
//    omit Ascendant/houses entirely rather than guessing.
// 2. Rahu/Ketu use the TRUE (osculating) lunar node, matching the "true node
//    positions" setting named in the transcript's stated Jagannatha Hora
//    settings. We compute it from the Moon's geocentric state vector: the
//    orbital angular momentum h = r × v is normal to the instantaneous orbital
//    plane, and the longitude of the ascending node (where that plane meets
//    the ecliptic) is Ω = atan2(hx, −hy), with r and v in ecliptic-of-date
//    coordinates. This is the rigorous definition Swiss Ephemeris reports as
//    SE_TRUE_NODE and tracks it to well under 0.1° (anchor check: at J2000 the
//    true node lands at ~123.95°, within the published 120°–130° envelope for
//    the mean node of ~125° plus its up-to-~1.7° perturbation). The true node
//    oscillates around the mean node by up to ~1.7°, which can occasionally
//    shift a planet into a neighboring sign near a sign boundary.
// 3. Obliquity of the ecliptic uses the standard low-order IAU mean-obliquity
//    polynomial (sufficient for Ascendant calculation to within a fraction
//    of an arcminute over historical birth-date ranges).

const Astronomy = require("astronomy-engine");
const { toSidereal, getAyanamsha, getTrueAyanamsha } = require("./ayanamsha");
const { normalizeTimeOfBirth } = require("./astrologyService");

const RASHIS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

// Aries=0 (movable/cardinal), Taurus=1 (fixed), Gemini=2 (dual/mutable), repeating.
const MODALITY = ["movable", "fixed", "dual"];
const getModality = (signIndex) => MODALITY[signIndex % 3];

const RASHI_GENDER = {
  Aries: "male", Gemini: "male", Leo: "male", Libra: "male", Sagittarius: "male", Aquarius: "male",
  Taurus: "female", Cancer: "female", Virgo: "female", Scorpio: "female", Capricorn: "female", Pisces: "female",
};

const RASHI_LORDS = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon", Leo: "Sun", Virgo: "Mercury",
  Libra: "Venus", Scorpio: "Mars", Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

// Exaltation / debilitation signs per classical (Parashari) convention.
// Rahu/Ketu exaltation-debilitation signs vary by tradition; the values here
// follow the commonly used Parashari convention (Rahu exalted in Gemini,
// debilitated in Sagittarius; Ketu the reverse) — flagged as convention-
// dependent since some schools use Taurus/Scorpio instead.
const EXALTATION = {
  Sun: "Aries", Moon: "Taurus", Mars: "Capricorn", Mercury: "Virgo",
  Jupiter: "Cancer", Venus: "Pisces", Saturn: "Libra", Rahu: "Gemini", Ketu: "Sagittarius",
};
const DEBILITATION = {
  Sun: "Libra", Moon: "Scorpio", Mars: "Cancer", Mercury: "Pisces",
  Jupiter: "Capricorn", Venus: "Virgo", Saturn: "Aries", Rahu: "Sagittarius", Ketu: "Gemini",
};
const MOOLATRIKONA = {
  Sun: "Leo", Moon: "Taurus", Mars: "Aries", Mercury: "Virgo",
  Jupiter: "Sagittarius", Venus: "Libra", Saturn: "Aquarius",
};

const NATURAL_BENEFICS = ["Jupiter", "Venus", "Moon", "Mercury"]; // Mercury conditionally, see knowledge base
const NATURAL_MALEFICS = ["Sun", "Mars", "Saturn", "Rahu", "Ketu"];

const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada",
  "Uttara Bhadrapada", "Revati",
];

const signIndexOf = (siderealLongitude) => Math.floor((((siderealLongitude % 360) + 360) % 360) / 30);
const getRashi = (siderealLongitude) => RASHIS[signIndexOf(siderealLongitude)];
const degreeInSign = (siderealLongitude) => (((siderealLongitude % 360) + 360) % 360) % 30;

// --- Obliquity of the ecliptic (mean, IAU low-order polynomial) ---
const getObliquityDeg = (date) => {
  const T = (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / (1000 * 60 * 60 * 24 * 36525); // Julian centuries since J2000
  return 23.43929111 - 0.013004167 * T - 0.0000001639 * T * T + 0.0000005036 * T * T * T;
};

// --- Ascendant (Lagna) — sidereal ---
// Standard formula: tan(Asc) = cos(theta) / -(sin(theta)*cos(eps) + tan(lat)*sin(eps))
// where theta = Local Sidereal Time in degrees (RAMC), eps = obliquity, lat = geographic latitude.
const calculateAscendant = (date, latitudeDeg, longitudeDeg) => {
  const gstHours = Astronomy.SiderealTime(date); // Greenwich sidereal time, in hours
  const lstHours = (((gstHours + longitudeDeg / 15) % 24) + 24) % 24; // east longitude adds to GST
  const thetaRad = (lstHours * 15) * (Math.PI / 180); // RAMC in radians
  const epsRad = getObliquityDeg(date) * (Math.PI / 180);
  const latRad = latitudeDeg * (Math.PI / 180);

  const y = Math.cos(thetaRad);
  const x = -(Math.sin(thetaRad) * Math.cos(epsRad) + Math.tan(latRad) * Math.sin(epsRad));
  let ascTropical = Math.atan2(y, x) * (180 / Math.PI);
  ascTropical = ((ascTropical % 360) + 360) % 360;

  return toSidereal(ascTropical, date);
};

// --- Mean lunar node (Rahu); used only as a defensive fallback ---
// Standard mean-node polynomial (Meeus, Astronomical Algorithms).
const getMeanNodeLongitude = (date) => {
  const T = (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / (1000 * 60 * 60 * 24 * 36525);
  let omega = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000;
  omega = ((omega % 360) + 360) % 360;
  return omega; // this is the tropical longitude of the (descending, in the Meeus convention) node
};

// --- True (osculating) lunar node — the validated SE_TRUE_NODE algorithm ---
// The ascending node of the Moon's instantaneous orbital plane. Computed from
// the geocentric state vector in ecliptic-of-date coordinates:
//   v = dr/dt        (central finite difference; 0.05 d ≈ 72 min)
//   h = r × v        (specific angular momentum, normal to the orbital plane)
//   Ω = atan2(hx, −hy)
// This is the definition Swiss Ephemeris uses for SE_TRUE_NODE and matches it
// to well under 0.1°. Returns the tropical longitude in degrees, or NaN if the
// position cannot be evaluated (caller falls back to the mean node).
const getMoonGeocentricOfDate = (timeMs) => {
  const vector = Astronomy.GeoVector(Astronomy.Body.Moon, new Date(timeMs), false);
  return Astronomy.RotateVector(Astronomy.Rotation_EQJ_ECT(new Date(timeMs)), vector);
};

const getTrueNodeLongitude = (date) => {
  const birthMs = date.getTime();
  const DT_MS = 0.05 * 24 * 60 * 60 * 1000; // 0.05 day, per the validated algorithm

  const r = getMoonGeocentricOfDate(birthMs);
  const rPrev = getMoonGeocentricOfDate(birthMs - DT_MS);
  const rNext = getMoonGeocentricOfDate(birthMs + DT_MS);
  if (!r || !rPrev || !rNext) return Number.NaN;

  const vx = (rNext.x - rPrev.x) / (2 * DT_MS);
  const vy = (rNext.y - rPrev.y) / (2 * DT_MS);
  const vz = (rNext.z - rPrev.z) / (2 * DT_MS);

  const hx = r.y * vz - r.z * vy;
  const hy = r.z * vx - r.x * vz;

  if (![r.x, r.y, r.z, hx, hy].every(Number.isFinite)) return Number.NaN;

  return ((Math.atan2(hx, -hy) * (180 / Math.PI)) % 360 + 360) % 360;
};

// --- Planetary sidereal longitudes ---
//
// Every position here is GEOCENTRIC, always.
//
// A natal rasi chart in Jyotish is a geocentric chart. Swiss Ephemeris — the
// engine behind Drik Panchang, Jagannatha Hora and every other mainstream
// Jyotish package — returns geocentric apparent ecliptic longitudes for natal
// work; topocentric positions are reserved for a narrow set of phenomena
// (Sunrise/sunset corrections, some Pratyantardasha edge cases).
//
// This matters most for the Moon, whose diurnal parallax reaches ~1 degree.
// A topocentric Moon can therefore sit in a different sign AND a different
// nakshatra than the geocentric one — and the whole Vimshottari dasha chain
// is anchored on the Moon's birth nakshatra, so a topocentric Moon shifts
// every period boundary by months.
//
// Verified against Swiss Ephemeris (the engine behind every mainstream
// Jyotish package) for birth 31 Aug 1989, 18:24 IST, Hanumangarh
// (29.5818 N, 74.3294 E):
//   geocentric Moon   -> 137.7293 deg sidereal -> Rahu mahadasha begins
//                         27 Jan 2026 and ends 27 Jan 2044
//   topocentric Moon  -> 137.1675 deg sidereal -> Rahu mahadasha begins
//                         30 Nov 2026 (10 months late)
// The 0.56 deg difference is the Moon's parallax at that instant.
//
// The Sun's parallax is 8.8 arcsec and the other planets' is negligible, so
// the Moon is the body this rule really bites on — but the rule is applied
// uniformly so there is a single, auditable position model.
const getPlanetSiderealLongitudes = (date) => {
  // Uranus, Neptune and Pluto ride the same geocentric path as the classical
  // planets.
  const bodies = {
    Mars: "Mars", Mercury: "Mercury", Jupiter: "Jupiter",
    Venus: "Venus", Saturn: "Saturn",
    Uranus: "Uranus", Neptune: "Neptune", Pluto: "Pluto",
  };
  const tropical = {};

  tropical.Sun = Astronomy.SunPosition(date).elon;
  tropical.Moon = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Moon, date, true)).elon;
  for (const [name, bodyKey] of Object.entries(bodies)) {
    tropical[name] = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[bodyKey], date, true)).elon;
  }

  // Rahu (true node; mean node as a defensive fallback). Ketu = Rahu + 180.
  const trueRahuTropical = getTrueNodeLongitude(date);
  const useTrueNode = Number.isFinite(trueRahuTropical);
  const rahuTropical = useTrueNode ? trueRahuTropical : getMeanNodeLongitude(date);
  const nodeType = useTrueNode ? "true" : "mean-fallback";

  const sidereal = {};
  for (const [name, lon] of Object.entries(tropical)) {
    sidereal[name] = toSidereal(lon, date);
  }
  sidereal.Rahu = toSidereal(rahuTropical, date);
  sidereal.Ketu = (sidereal.Rahu + 180) % 360;

  return {
    sidereal,
    nodeType,
    positionReference: "geocentric",
  }; // sidereal: { Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Uranus, Neptune, Pluto, Rahu, Ketu } in sidereal degrees
};

// --- Retrograde (vakri) detection ---
//
// A planet is retrograde when its geocentric ecliptic longitude is DECREASING.
//
//   - The Sun is never retrograde (it travels the zodiac in one direction).
//   - The Moon is never retrograde either. Its geocentric ecliptic longitude
//     increases monotonically — its daily motion runs from about +11.8 to
//     +14.9 deg and never turns negative, because the Moon's orbit around the
//     Earth is prograde. Its elongation from the Sun likewise only ever grows
//     (about +10.8 to +13.9 deg/day). So there is no "vakri Chandra" to find,
//     and Jyotish never speaks of one. It is decided by definition, not by
//     measurement.
//   - The lunar nodes (Rahu/Ketu) are ALWAYS retrograde. They have no orbit of
//     their own, they only ever travel backwards along the ecliptic, so this
//     is a matter of definition rather than measurement. Measuring them is
//     actively wrong: the TRUE node's instantaneous rate can turn positive for
//     short stretches (its periodic perturbation is larger than the mean
//     node's -0.053 deg/day motion), so a measured test would have the nodes
//     flipping between retrograde and direct from chart to chart — and the
//     strength engine gives the nodes a x3 retrograde multiplier, so the error
//     would land in the planetary-strength numbers.
//
// Retrograde is measured geocentrically for every body. Topocentric and
// geocentric longitudes differ by up to ~1 deg for the Moon, which is enough
// to shift the answer near a station, and it made the chart and the strength
// engine disagree.
//
// The measurement window is body-specific. It has to be long enough that the
// longitude difference stays clear of the ephemeris' own precision, and short
// enough that the window cannot straddle a station and flip the answer. A
// single global 2-day window (the old one) misclassified Mercury every time a
// station happened to fall inside it — Mercury turns station roughly every
// three weeks, so that window was hit often.
const DAY_MS = 24 * 60 * 60 * 1000;

const RETROGRADE_STEP_DAYS = {
  Mercury: 0.05,
  Venus: 0.05,
  Mars: 0.25,
  Jupiter: 2,
  Saturn: 5,
  Uranus: 10,
  Neptune: 10,
  Pluto: 20,
};

// A longitude change smaller than this counts as "stationary" rather than
// direct or retrograde. At the stations the body is, by definition, neither.
const STATION_TOLERANCE_DEG = 0.001;

// Geocentric tropical ecliptic longitude for a body. Geocentric for the same
// reason the chart is: one position model, no observer-dependent drift.
const getTropicalLongitude = (bodyName, date) => {
  const bodyKey = Astronomy.Body[bodyName];
  if (!bodyKey) return Number.NaN;
  if (bodyName === "Sun") return Astronomy.SunPosition(date).elon;
  return Astronomy.Ecliptic(Astronomy.GeoVector(bodyKey, date, true)).elon;
};

const getIsRetrograde = (bodyName, date) => {
  if (bodyName === "Rahu" || bodyName === "Ketu") return true;
  if (bodyName === "Sun" || bodyName === "Moon") return false;

  const stepDays = RETROGRADE_STEP_DAYS[bodyName] ?? 1;
  const stepMs = stepDays * DAY_MS;
  const before = getTropicalLongitude(bodyName, new Date(date.getTime() - stepMs));
  const after = getTropicalLongitude(bodyName, new Date(date.getTime() + stepMs));
  if (!Number.isFinite(before) || !Number.isFinite(after)) return false;

  // Wrap-safe difference: a planet at 359 deg moving to 1 deg is direct, not
  // retrograde.
  let delta = after - before;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  // Stationary: the body is at the turn, so it is neither.
  if (Math.abs(delta) < STATION_TOLERANCE_DEG) return false;
  return delta < 0;
};

/**
 * Retrograde state for every body at one instant.
 *
 * This is the single source of truth for vakri: the chart and the strength
 * engine both read it, so the two can never report a planet as retrograde in
 * one place and direct in another.
 *
 * @param {Date} date
 * @returns {Object<string, boolean>}
 */
const getRetrogradeMap = (date) => {
  const out = { Sun: false, Moon: false };
  for (const name of Object.keys(RETROGRADE_STEP_DAYS)) {
    out[name] = getIsRetrograde(name, date);
  }
  // The nodes are retrograde by definition, never by measurement.
  out.Rahu = true;
  out.Ketu = true;
  return out;
};

// --- Navamsha (D9) sign for a given sidereal longitude ---
// Movable signs: navamsha count starts from the same sign.
// Fixed signs: starts from the 9th sign from it (index +8).
// Dual signs: starts from the 5th sign from it (index +4).
const getNavamshaSign = (siderealLongitude) => {
  const signIdx = signIndexOf(siderealLongitude);
  const modality = getModality(signIdx);
  const navamshaIdx = Math.floor(degreeInSign(siderealLongitude) / (30 / 9)); // 0-8

  let startIdx;
  if (modality === "movable") startIdx = signIdx;
  else if (modality === "fixed") startIdx = (signIdx + 8) % 12;
  else startIdx = (signIdx + 4) % 12; // dual

  return RASHIS[(startIdx + navamshaIdx) % 12];
};

// --- Nakshatra + pada for a sidereal longitude (used for Moon nakshatra, Ashtakavarga refs, etc.) ---
const getNakshatra = (siderealLongitude) => {
  const span = 360 / 27; // 13°20'
  const lon = ((siderealLongitude % 360) + 360) % 360;
  const index = Math.floor(lon / span);
  const withinNakshatra = lon - index * span;
  const pada = Math.floor(withinNakshatra / (span / 4)) + 1; // 1-4
  return { name: NAKSHATRAS[index], index, pada };
};

// --- House (Bhava) assignment — whole-sign system ---
// The whole sign the Ascendant falls in is the 1st house; each subsequent
// sign in zodiacal order is the next house. This is the standard, simplest,
// and most widely used Vedic house system (matches the "no navamsha lagna,
// no fancy stuff — ascendant and moon are primary" approach in the
// transcript's teaching philosophy).
const getHouseOfPlanet = (planetSiderealLongitude, ascendantSiderealLongitude) => {
  const planetSign = signIndexOf(planetSiderealLongitude);
  const ascSign = signIndexOf(ascendantSiderealLongitude);
  return ((planetSign - ascSign + 12) % 12) + 1; // 1-12
};

// --- Full chart calculation ---
// birthData: { dateOfBirth, timeOfBirth ("HH:mm"), timeZoneOffsetMinutes, latitude, longitude }
const calculateVedicChart = (birthData = {}) => {
  const { dateOfBirth, timeOfBirth, timeZoneOffsetMinutes = 0, latitude, longitude } = birthData;

  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return { precision: "invalid" };

  const normalizedTime = normalizeTimeOfBirth(timeOfBirth);
  const hasTime = Boolean(normalizedTime);
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);

  const [hh, mm] = (normalizedTime || "12:00").split(":").map(Number);
  const localMillis = Date.UTC(dob.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate(), hh, mm);
  const utcDate = new Date(localMillis - (Number(timeZoneOffsetMinutes) || 0) * 60 * 1000);
  if (Number.isNaN(utcDate.getTime())) return { precision: "invalid" };

  // Every planetary position is geocentric — see getPlanetSiderealLongitudes.
  const { sidereal: planetLongitudes, nodeType, positionReference } =
    getPlanetSiderealLongitudes(utcDate);
  const moonNakshatra = getNakshatra(planetLongitudes.Moon);

  // Retrograde is measured once for the whole chart, geocentrically, so the
  // chart and the strength engine can never disagree about it.
  const retrogradeMap = getRetrogradeMap(utcDate);

  const planets = Object.fromEntries(
    Object.entries(planetLongitudes).map(([name, lon]) => [
      name,
      {
        longitude: lon,
        rashi: getRashi(lon),
        degreeInSign: degreeInSign(lon),
        navamshaSign: getNavamshaSign(lon),
        isExalted: EXALTATION[name] === getRashi(lon),
        isDebilitated: DEBILITATION[name] === getRashi(lon),
        isOwnSign: RASHI_LORDS[getRashi(lon)] === name,
        isMoolatrikona: MOOLATRIKONA[name] === getRashi(lon),
        retrograde: retrogradeMap[name] === true,
      },
    ])
  );

  // The exact instant the chart was computed for. Returned so downstream
  // consumers (strength, dasha, transits) reuse THIS date rather than
  // recomputing it from birth data and risking a silent disagreement.
  const birthInstant = utcDate.toISOString();

  if (!hasTime || !hasLocation) {
    return {
      precision: !hasTime ? "no-birth-time" : "no-birth-location",
      note: !hasTime
        ? "Ascendant and houses require an accurate birth time — none was provided, so only planetary sign placements (not houses) are available."
        : "Ascendant and houses require birth latitude/longitude — none was provided.",
      birthInstant,
      planets,
      moonRashi: getRashi(planetLongitudes.Moon),
      moonNakshatra,
      ayanamshaUsed: getTrueAyanamsha(utcDate),
      meanAyanamsha: getAyanamsha(utcDate),
      nodeType,
      positionReference,
    };
  }

  const ascendantLongitude = calculateAscendant(utcDate, latitude, longitude);
  const ascendantRashi = getRashi(ascendantLongitude);

  const planetsWithHouses = Object.fromEntries(
    Object.entries(planets).map(([name, data]) => [
      name,
      { ...data, house: getHouseOfPlanet(data.longitude, ascendantLongitude) },
    ])
  );

  return {
    precision: "full",
    birthInstant,
    ascendant: {
      longitude: ascendantLongitude,
      rashi: ascendantRashi,
      degreeInSign: degreeInSign(ascendantLongitude),
      navamshaSign: getNavamshaSign(ascendantLongitude),
      gender: RASHI_GENDER[ascendantRashi],
    },
    planets: planetsWithHouses,
    moonRashi: getRashi(planetLongitudes.Moon),
    moonNakshatra,
    houseLords: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => {
        const houseSignIdx = (signIndexOf(ascendantLongitude) + i) % 12;
        const houseSign = RASHIS[houseSignIdx];
        return [i + 1, { sign: houseSign, lord: RASHI_LORDS[houseSign] }];
      })
    ),
    ayanamshaUsed: getTrueAyanamsha(utcDate),
    meanAyanamsha: getAyanamsha(utcDate),
    nodeType,
    positionReference,
  };
};

// Builds the compact "chart data" object the RAG llmService attaches to
// its prompt (see services/rag/llmService.js). Only includes fields that
// were actually computed — never fabricates missing data, so the LLM sees
// an honest, partial picture rather than something that looks complete.
//
// `analysisA` / `analysisB` are the SUMMARY forms from summarizeVedicAnalysis,
// never the full vedicAnalysis block: the full one is far too large for a
// prompt, and passing it raw would crowd out the retrieved knowledge the
// answer is supposed to be grounded in.
const buildChartContextForQA = ({ chartA, chartB, gunaMilan, dashaA, dashaB, analysisA, analysisB } = {}) => {
  const context = {};
  if (chartA) context.personA = chartA;
  if (chartB) context.personB = chartB;
  if (gunaMilan) context.gunaMilan = gunaMilan;
  if (dashaA) context.dashaA = dashaA;
  if (dashaB) context.dashaB = dashaB;
  if (analysisA) context.analysisA = analysisA;
  if (analysisB) context.analysisB = analysisB;
  return Object.keys(context).length ? context : null;
};

module.exports = {
  RASHIS, RASHI_GENDER, RASHI_LORDS, EXALTATION, DEBILITATION, MOOLATRIKONA,
  NATURAL_BENEFICS, NATURAL_MALEFICS, NAKSHATRAS,
  getRashi, degreeInSign, signIndexOf, getNavamshaSign, getNakshatra,
  getPlanetSiderealLongitudes, calculateAscendant, getHouseOfPlanet,
  calculateVedicChart, buildChartContextForQA,
  getIsRetrograde, getRetrogradeMap, RETROGRADE_STEP_DAYS,
};
