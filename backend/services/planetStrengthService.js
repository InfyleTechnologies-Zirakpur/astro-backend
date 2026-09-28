// Planet strength (p bala) — per-planet dignity, affliction and strength score.
//
// GROUNDING (the corpus rules this is allowed to speak from):
//
//   6.1 gives an explicit multiplier table, which is the backbone of the score
//   below. It is the teacher's own framing of planetary strength, so the score
//   is built directly on it rather than on a borrowed "Shadbala" or "Pindala"
//   system the corpus never mentions:
//       Exaltation     x3      Retrograde   x3
//       Own sign       x2      Vargottama   x2
//       Moolatrikona   x2      Debilitation divide by 3
//
//   6.4 sharpens 6.1 in a way that matters for the malefic test: a malefic that
//   is itself exalted, in own sign, in moolatrikona or vargottama "loses its
//   malefic quality for this purpose". So `isMaleficForAffliction` is
//   deliberately not just "is in NATURAL_MALEFICS" — that distinction is the
//   whole point of the rule and a plain membership test would get it wrong.
//
//   6.5 sets the precedence: the Rashi (D1) chart is primary and divisional
//   charts are only supplementary confirmation. So the dignity flags below are
//   all D1-based, and D9 only ever appears as the vargottama input (per 6.1)
//   and as a clearly-labelled supplementary field.
//
//   4.8 is the corpus's combustion material. Notably it is entirely RELATIONAL —
//   it describes Venus combust relative to the Sun's degree, the Sun's sign and
//   the adjacent sign. It never states a numeric combustion distance. So the
//   relationship logic here is corpus-grounded, while the numeric distance
//   limits are flagged as standard convention (see COMBUSTION_LIMITS).
//
//   32.1 and 35.1 confirm retrograde matters in this system (Ketu described as
//   "fully retrograde"), and 12.5 names "retrograde Mercury in 7th" and
//   "combust Mercury in 7th" as distinct afflictions, which is why retrograde and
//   combustion are reported separately rather than collapsed into one flag.
//
// NOT from the corpus, and labelled as such wherever it surfaces:
//   - The numeric combustion limits (varies by school: some use distance from
//     conjunction, others distance from the sign, others both).
//   - Retrograde detection itself. The corpus uses the word heavily but never
//     defines it; the arithmetic here (longitude decreasing over time) is the
//     standard astronomical meaning and is deliberately derived from real
//     ephemeris motion rather than a lookup table.

const {
  EXALTATION,
  DEBILITATION,
  MOOLATRIKONA,
  RASHI_LORDS,
  NATURAL_MALEFICS,
  NATURAL_BENEFICS,
  getRashi,
  degreeInSign,
  signIndexOf,
  getPlanetSiderealLongitudes,
} = require("./vedicAstrologyService");
const { getVargaSign, isVargottama } = require("./vedicVargaService");

// Planets with no traditional dignity in this system and no meaningful
// combustion. The nodes are handled specially below.
const LUMINARIES_AND_PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
const NODES = ["Rahu", "Ketu"];

// Standard combustion limits by distance from the Sun, in degrees. The Moon is
// given a much wider allowance because it moves ~13 deg/day and burns far less
// readily. These are CONVENTION, not corpus.
const COMBUSTION_LIMITS = {
  default: 14,
  Moon: 30,
  nodes: 20, // a node is only "combust" when very close to the Sun
};

// Rule 6.1 multipliers. Kept as data so the score stays auditable.
const STRENGTH_MULTIPLIERS = {
  exalted: 3,
  retrograde: 3,
  ownSign: 2,
  vargottama: 2,
  moolatrikona: 2,
  debilitated: 1 / 3,
};

/**
 * The shortest signed angular distance from `lon` to `target`, in degrees,
 * always in [0, 180).
 */
const angularDistance = (lon, target) => {
  const raw = Math.abs((((lon - target) % 360) + 360) % 360);
  return raw > 180 ? 360 - raw : raw;
};

/**
 * Retrograde status from real ephemeris motion.
 *
 * A planet is retrograde when its apparent geocentric longitude is DECREASING.
 * Sampling the signed change over a ~1 day interval is robust for every body
 * here; sampling over a few hours would be swamped by floating point noise for
 * the slower bodies. A zero delta is reported as not retrograde rather than
 * guessed either way, since "stationary" is a real (if brief) state.
 *
 * @param {Date} utcDate
 * @returns {Object<number, boolean>}
 */
const getRetrogradeStatus = (utcDate) => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const before = getPlanetSiderealLongitudes(utcDate).sidereal;
  const after = getPlanetSiderealLongitudes(new Date(utcDate.getTime() + DAY_MS)).sidereal;

  const out = {};
  for (const name of Object.keys(before)) {
    const delta = (((after[name] - before[name]) % 360) + 360) % 360;
    // Normalise the change into (-180, 180]: the true signed motion.
    const signed = delta > 180 ? delta - 360 : delta;
    out[name] = signed < 0;
  }
  return out;
};

/**
 * Combustion, split into the part that is corpus-grounded (4.8: the RELATION
 * between Venus and the Sun) and the part that is convention (the numeric
 * limits).
 *
 * @returns {{
 *   isCombust: boolean,
 *   distanceFromSun: number|null,
 *   limitUsed: number|null,
 *   limitSource: "convention",
 *   relationToSun: "same-sign-before"|"same-sign-after"|"adjacent-sign"|"distant"|null,
 *   degreeOrder: "before-sun"|"after-sun"|"same-degree"|null,
 *   notes: string[],
 * }}
 */
const getCombustion = (name, longitude, sunLongitude) => {
  const notes = [];
  const isLuminaryOrPlanet = LUMINARIES_AND_PLANETS.includes(name);

  // The Sun cannot be combust by the Sun. Without this guard the distance is
  // measured against itself and comes out 0, which would report every chart as
  // having a combust Sun.
  if (name === "Sun") {
    return {
      isCombust: false,
      distanceFromSun: 0,
      limitUsed: null,
      limitSource: "convention",
      relationToSun: null,
      degreeOrder: null,
      notes: ["the Sun is the reference for combustion and is never combust"],
    };
  }

  // Without the Sun's position there is nothing to be combust *by*, so the
  // honest answer is unknown rather than "not combust".
  if (!isLuminaryOrPlanet || !Number.isFinite(longitude) || !Number.isFinite(sunLongitude)) {
    return {
      isCombust: false,
      distanceFromSun: null,
      limitUsed: null,
      limitSource: "convention",
      relationToSun: null,
      degreeOrder: null,
      notes: ["combustion undetermined: the Sun's position is required"],
    };
  }

  const distance = angularDistance(longitude, sunLongitude);
  const limit = name === "Moon" ? COMBUSTION_LIMITS.Moon : COMBUSTION_LIMITS.default;
  const isCombust = distance < limit;

  // Rule 4.8's relational structure, which is the part the corpus actually
  // teaches. It is meaningful for Venus in particular, and is reported for any
  // combust planet because the geometry is the same.
  const sign = getRashi(longitude);
  const sunSign = getRashi(sunLongitude);
  const signDistance = Math.abs(signIndexOf(longitude) - signIndexOf(sunLongitude));
  const degree = degreeInSign(longitude);
  const sunDegree = degreeInSign(sunLongitude);
  // Angular difference in degrees for the before/after test. When the planet is
  // in the sign BEFORE the Sun's sign, a smaller absolute degree still means
  // it "comes before" the Sun in zodiacal order.
  const sameSign = sign === sunSign;
  const degreeOrder = sameSign
    ? degree < sunDegree ? "before-sun" : degree > sunDegree ? "after-sun" : "same-degree"
    : null;

  let relationToSun = "distant";
  if (sameSign) relationToSun = "same-sign";
  else if (signDistance === 1) relationToSun = "adjacent-sign";

  if (isCombust) {
    notes.push(`combust: ${distance.toFixed(2)}deg from the Sun, inside the ${limit}deg limit (convention)`);
  }

  return {
    isCombust,
    distanceFromSun: distance,
    limitUsed: limit,
    limitSource: "convention",
    relationToSun,
    degreeOrder,
    notes,
  };
};

/**
 * Is this planet capable of inflicting malefic conditions? Implements rule 6.4's
 * carve-out, which is why it is NOT simply NATURAL_MALEFICS membership.
 */
const isMaleficForAffliction = (name, flags) => {
  if (!NATURAL_MALEFICS.includes(name)) return false;
  // "if a malefic planet is itself exalted, in own sign, in moolatrikona, or
  // vargottama, it loses its malefic quality for this purpose"
  if (flags.isExalted || flags.isOwnSign || flags.isMoolatrikona || flags.isVargottama) return false;
  return true;
};

/**
 * Full strength block for one planet.
 */
const assessPlanetStrength = (name, longitude, { sunLongitude, retrograde } = {}) => {
  if (!Number.isFinite(longitude)) return null;

  const sign = getRashi(longitude);
  const isNode = NODES.includes(name);

  const flags = {
    isExalted: !isNode && EXALTATION[name] === sign,
    isDebilitated: !isNode && DEBILITATION[name] === sign,
    isOwnSign: !isNode && RASHI_LORDS[sign] === name,
    isMoolatrikona: !isNode && MOOLATRIKONA[name] === sign,
    isRetrograde: Boolean(retrograde),
  };
  flags.isVargottama = isVargottama(longitude);

  // Rule 6.1 multipliers.
  let multiplier = 1;
  const applied = [];
  for (const [key, factor] of Object.entries(STRENGTH_MULTIPLIERS)) {
    const flagName = { ownSign: "isOwnSign", retrograde: "isRetrograde" }[key] || `is${key[0].toUpperCase()}${key.slice(1)}`;
    if (flags[flagName]) {
      multiplier *= factor;
      applied.push({ state: key, factor });
    }
  }

  // Combustion. Nodes are reported separately rather than folded in, since a
  // node's "combustion" is not a dignity concept in the same way.
  const combustion = isNode
    ? { isCombust: false, distanceFromSun: null, limitUsed: null, limitSource: "convention", relationToSun: null, degreeOrder: null, notes: ["combustion not applied to lunar nodes"] }
    : getCombustion(name, longitude, sunLongitude);

  // A compact label. Order matters: vargottama and exaltation outrank own sign
  // and moolatrikona because a vargottama planet is undamaged by the division.
  let dignity;
  if (flags.isVargottama && (flags.isExalted || flags.isOwnSign || flags.isMoolatrikona)) dignity = "vargottama";
  else if (flags.isExalted) dignity = "exalted";
  else if (flags.isDebilitated) dignity = "debilitated";
  else if (flags.isOwnSign) dignity = "own-sign";
  else if (flags.isMoolatrikona) dignity = "moolatrikona";
  else dignity = "neutral";

  return {
    planet: name,
    longitude,
    rashi: sign,
    degreeInSign: degreeInSign(longitude),
    // Supplementary only, per rule 6.5 (D1 is primary).
    navamshaRashi: getVargaSign(longitude, 9),
    dignity,
    flags,
    retrograde: flags.isRetrograde,
    combustion,
    score: {
      multiplier,
      applied,
      // A readable band, so callers never have to interpret the raw multiplier.
      band: multiplier >= 6 ? "very-strong" : multiplier >= 3 ? "strong" : multiplier >= 2 ? "moderate" : multiplier < 1 ? "weak" : "neutral",
    },
    isNaturalBenefic: NATURAL_BENEFICS.includes(name),
    isNaturalMalefic: NATURAL_MALEFICS.includes(name),
    // Rule 6.4's malefic test, which is weaker than isNaturalMalefic.
    isMaleficForAffliction: isMaleficForAffliction(name, flags),
    notes: combustion.notes,
  };
};

/**
 * Strength for every planet in a chart.
 *
 * @param {Object} params
 * @param {Object} params.planetLongitudes sidereal longitudes keyed by planet
 * @param {Object} [params.retrograde] from getRetrogradeStatus
 * @returns {Object<number, object|null>}
 */
const assessChartStrength = ({ planetLongitudes, retrograde = {} } = {}) => {
  if (!planetLongitudes || typeof planetLongitudes !== "object") return null;
  const sunLongitude = planetLongitudes.Sun;

  return Object.fromEntries(
    Object.entries(planetLongitudes).map(([name, longitude]) => [
      name,
      assessPlanetStrength(name, longitude, { sunLongitude, retrograde: retrograde[name] }),
    ]),
  );
};

module.exports = {
  COMBUSTION_LIMITS,
  STRENGTH_MULTIPLIERS,
  LUMINARIES_AND_PLANETS,
  NODES,
  angularDistance,
  getRetrogradeStatus,
  getCombustion,
  isMaleficForAffliction,
  assessPlanetStrength,
  assessChartStrength,
};
