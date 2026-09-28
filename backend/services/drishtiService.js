// Drishti (planetary aspects) and the connections built on top of them.
//
// GROUNDING:
//
//   The corpus leans on drishti constantly — it is one of its most-used
//   mechanisms — but it never states a numeric aspect-distance table. What it
//   DOES state is the principle that carries the weight:
//
//     13.13: "The third house is also connected to bravery and learning, because
//     from the Moon it aspects the 9th house by the 7th-from principle." So the
//     7th aspect is explicitly the corpus's own counting rule, and is the only
//     one it names.
//     6.3 / 7.3: "aspect is equal to conjunction" — a strong, repeated
//     teaching. It is why an aspect onto a house is treated as materially
//     equivalent to occupying it, and why `influencesHouse` covers both.
//     12.1 uses both senses of the 7th house being influenced: a planet placed
//     in it, and planets aspecting it. Both are computed here.
//     10.3 / 5.2: "mutual aspect" between two house lords is a distinct and
//     stronger category than a one-way aspect, so mutuality is reported
//     explicitly rather than left for callers to infer.
//     13.6: the 7th house is triggered when aspected by its own lord or occupied
//     by it — which is exactly `influencesHouse(seventhLord, 7)`.
//
//   NOT from the corpus, and labelled as such below: the full 7-fold numeric
//   table (2nd/3rd/4th/7th/8th/9th/10th/11th for the classical planets). This is
//   standard Parashari practice and the corpus is written inside that tradition,
//   but only the 7th is stated outright. The `source` field on every aspect
//   records which is which, so the AI layer can cite 13.13 for a 7th aspect
//   without implying the corpus taught the whole table.

const { RASHIS, signIndexOf, getRashi, degreeInSign, RASHI_LORDS } = require("./vedicAstrologyService");

const ASPECT_NAMES = {
  2: "2nd-drishti",
  3: "3rd-drishti",
  4: "4th-drishti",
  5: "5th-drishti",
  6: "6th-drishti",
  7: "7th-drishti",
  8: "8th-drishti",
  9: "9th-drishti",
  10: "10th-drishti",
  11: "11th-drishti",
  12: "12th-drishti",
};

const NAKSHATRA_LORD = [
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
];

// The 7th-from principle, which the corpus states outright (13.13).
const CORPUS_ASPECTS = new Set([7]);

const GRAHA_ASPECTS = {
  Sun: [7],
  Moon: [7],
  Mars: [4, 7, 8],
  Jupiter: [5, 7, 9],
  Venus: [5, 7, 9],
  Saturn: [3, 7, 10],
  Mercury: [7],
  // The nodes are given the same drishti as their dispositor's sign lord, which
  // is the common treatment; the corpus does not settle this, so it is
  // convention rather than rule.
  Rahu: [5, 7, 9],
  Ketu: [3, 7, 10],
};

// Combust planets are conventionally treated as too weak to aspect reliably.
// Left as an option rather than forced, because the corpus does not require it.
const DEFAULT_SKIP_COMBUST = false;

const normalize = (value) => ((value % 12) + 12) % 12;

const RASI_LORD_ASPECTS = new Set([5, 7, 9]);
const SPECIAL_ASPECTS = new Set([2, 3, 4, 5, 6, 8, 10, 11, 12]);

/**
 * The aspected sign index for a planet, for each darga it aspects.
 *
 * Sign occupancy is always a 0-degree aspect in this system, which is the
 * concrete meaning of "aspect is equal to conjunction" (6.3). That is also why
 * the occupancy aspect comes from the same code path as the others rather than
 * being special-cased by callers: 5th house == 1st sign is true for the same
 * structural reason 5th drishti == 1st sign is.
 */
const getAspectedSignIndex = (planet, signIndex, aspects = GRAHA_ASPECTS[planet] || [7]) => {
  const out = new Set([signIndex]); // occupancy, per 6.3
  for (const darga of aspects) out.add(normalize(signIndex + darga - 1));
  return out;
};

/**
 * @param {Object} params
 * @param {Object} [params.planets] sidereal longitudes keyed by planet, or a map
 *   of planet name to { longitude }. Both shapes are accepted because the chart
 *   calculator already produces the latter.
 * @param {Object} [params.options] see the destructured options
 * @returns {{ byPlanet: Object, aspecting: Object }|null}
 */
const getAspects = ({ planets, options = {} } = {}) => {
  const { skipCombust = DEFAULT_SKIP_COMBUST, combust = {} } = options;
  if (!planets || typeof planets !== "object") return null;

  const entries = Object.entries(planets).filter(
    ([name, data]) => data && Number.isFinite(data.longitude ?? data),
  );
  if (entries.length === 0) return null;

  // Sign-level graph: who aspects whom.
  const byPlanet = {};
  for (const [name, data] of entries) {
    const longitude = data.longitude ?? data;
    const sign = signIndexOf(longitude);
    byPlanet[name] = {
      longitude,
      rashi: getRashi(longitude),
      degreeInSign: degreeInSign(longitude),
      signIndex: sign,
      signLord: RASHI_LORDS[getRashi(longitude)],
      nakshatraLord: NAKSHATRA_LORD[Math.floor(((longitude % 360) + 360) % 360 / (360 / 27))],
    };
  }

  const aspecting = {};
  for (const [name, info] of Object.entries(byPlanet)) {
    if (skipCombust && combust[name]?.isCombust) {
      aspecting[name] = { to: [], skipped: "combust" };
      continue;
    }
    const aspects = GRAHA_ASPECTS[name] || [7];
    const targets = getAspectedSignIndex(name, info.signIndex, aspects);
    const to = [];
    for (const [otherName, otherInfo] of Object.entries(byPlanet)) {
      if (otherName === name) continue;
      // The 0-degree (occupancy) aspect is reported separately so a caller can
      // distinguish "conjoined" from "aspected" even though the corpus treats
      // them as equivalent (6.3).
      if (info.signIndex === otherInfo.signIndex) {
        to.push({ planet: otherName, darga: 0, name: "conjunction", source: "corpus-6.3-equivalence", mutual: true });
        continue;
      }
      for (const darga of aspects) {
        if (normalize(info.signIndex + darga - 1) === otherInfo.signIndex) {
          to.push({
            planet: otherName,
            darga,
            name: ASPECT_NAMES[darga] || `${darga}th`,
            source: CORPUS_ASPECTS.has(darga) ? "corpus-13.13-7th-principle" : "parashari-convention",
          });
        }
      }
    }
    // Mutual: both planets aspect each other. 10.3 treats this as a distinct and
    // stronger condition than a one-way aspect.
    for (const edge of to) {
      const otherAspects = GRAHA_ASPECTS[edge.planet] || [7];
      const otherTargets = getAspectedSignIndex(edge.planet, byPlanet[edge.planet].signIndex, otherAspects);
      edge.mutual = otherTargets.has(info.signIndex);
    }
    aspecting[name] = { to };
  }

  return { byPlanet, aspecting };
};

/**
 * Does `planetName` influence `house`? Combines occupancy and drishti, per
 * "aspect is equal to conjunction" (6.3) and rule 1.3 ("its own house lord
 * influences it (sits in it or aspects it)").
 *
 * @param {Object} params
 * @param {string} params.planetName
 * @param {number} params.house 1..12
 * @param {number} params.ascendantLongitude
 * @param {Object} params.planetLongitudes sidereal longitudes keyed by planet
 * @param {Object} [params.options] see getAspects
 */
const influencesHouse = ({ planetName, house, ascendantLongitude, planetLongitudes, options = {} }) => {
  if (!planetName || !planetLongitudes || !Number.isFinite(ascendantLongitude)) return null;
  if (!Number.isInteger(house) || house < 1 || house > 12) return null;

  const lon = planetLongitudes[planetName];
  if (!Number.isFinite(lon)) return null;

  const { combust = {} } = options;
  if (options.skipCombust && combust[planetName]?.isCombust) {
    return { influences: false, by: [], reason: "combust planets are conventionally treated as too weak to aspect" };
  }

  const planetSign = signIndexOf(lon);
  // Whole-sign houses: the Ascendant's sign is house 1, and the sign `n-1` places
  // along from it is house n. (getHouseOfPlanet does the same arithmetic from
  // the planet's side.)
  const ascendantSign = signIndexOf(ascendantLongitude);
  const houseSign = normalize(ascendantSign + (house - 1));

  const by = [];
  if (planetSign === houseSign) {
    by.push({ kind: "occupancy", source: "corpus-6.3-equivalence" });
  } else {
    const aspects = GRAHA_ASPECTS[planetName] || [7];
    for (const darga of aspects) {
      if (normalize(planetSign + darga - 1) === houseSign) {
        by.push({
          kind: "drishti",
          darga,
          name: ASPECT_NAMES[darga] || `${darga}th`,
          source: CORPUS_ASPECTS.has(darga) ? "corpus-13.13-7th-principle" : "parashari-convention",
        });
      }
    }
  }
  return { influences: by.length > 0, by };
};

/**
 * The 7th-from principle the corpus actually teaches (13.13): from a planet, the
 * house it aspects is the 7th. Used directly so callers share one definition.
 */
const seventhFrom = (house) => normalize(house - 1 + 6) + 1;

module.exports = {
  ASPECT_NAMES,
  CORPUS_ASPECTS,
  GRAHA_ASPECTS,
  DEFAULT_SKIP_COMBUST,
  getAspectedSignIndex,
  getAspects,
  influencesHouse,
  seventhFrom,
  RASI_LORD_ASPECTS,
  SPECIAL_ASPECTS,
  NAKSHATRA_LORD,
};
