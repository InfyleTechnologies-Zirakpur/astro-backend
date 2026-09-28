// Vimshottari Dasha — the 120-year planetary period system that gives Vedic
// astrology its sense of TIMING. A natal chart is static; dasha answers "when".
// This is the single most-referenced technique in the course transcripts
// (data/astro_knowledge_source.md repeatedly ties marriage, career, and
// "weak dasha" / "Dasha Sandhi" risk to the running mahadasha + antar-dasha),
// so it feeds both the API responses and the RAG Q&A context.
//
// Inputs: Moon sidereal longitude (already computed by vedicAstrologyService)
// and the birth date. Everything else is derived — no ephemeris, no network.
//
// ALGORITHM (standard Parashari Vimshottari):
//   1. The Moon's sidereal longitude places it in one of the 27 nakshatras,
//      each 13°20' wide and each ruled by one of the 9 grahas.
//   2. The fraction of that nakshatra already traversed at birth determines
//      the remaining balance of that nakshatra lord's dasha.
//      balance = dashaYears[lord] * (1 - proportionTraversed)
//   3. Mahadashas then run in the fixed 120-year cycle order
//      (Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury),
//      each for its full length, forever.
//   4. Each mahadasha subdivides into 9 antardashas (bhukti) proportionally,
//      starting from the mahadasha lord. Each antardasha subdivides again into
//      9 pratyantardashas (sookshma) by the same rule.
//
// ACCURACY NOTES:
// - Dasha years are the classical integers summing to 120; converted to days at
//   DAYS_PER_DASHA_YEAR (365.25) so the full cycle spans exactly ~120 tropical
//   years. Some traditions use 360 (solar) days per dasha year, which shifts
//   period boundaries by up to ~1.5%; 365.25 is the modern software default.
// - Rahu and Ketu get dasha periods (18 and 7) despite being chhaya grahas
//   (lunar nodes with no independent orbit), per standard Vimshottari practice.
// - Dasha periods are computed from the Moon's MEAN position, consistent with
//   the mean-node-based ayanamsha model in ayanamsha.js. Pairing a mean-node
//   ayanamsha with a true-node Moon longitude (or vice versa) introduces a
//   fraction-of-a-degree inconsistency; we keep both on the mean basis.

const { RASHIS, RASHI_LORDS, getNakshatra } = require("./vedicAstrologyService");

// --- Vimshottari dasha lengths, in years. Sums to exactly 120. ---
const DASHA_YEARS = {
  Ketu: 7,
  Venus: 20,
  Sun: 6,
  Moon: 10,
  Mars: 7,
  Rahu: 18,
  Jupiter: 16,
  Saturn: 19,
  Mercury: 17,
};

const TOTAL_DASHA_YEARS = Object.values(DASHA_YEARS).reduce((a, b) => a + b, 0); // 120

// The unchanging cycle order. Every dasha sequence — from the first partial
// period at birth onward, and within every sub-division — follows this order.
const DASHA_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];

const DAYS_PER_DASHA_YEAR = 365.25;

// --- Nakshatra lords. Each graha rules exactly 3 of the 27 nakshatras,
// grouped by repetition (every 9th). Index i corresponds to NAKSHATRAS[i]. ---
const NAKSHATRA_LORDS = [
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury", // 0-8
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury", // 9-17
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury", // 18-26
];

const nakshatraLord = (nakshatraIndex) => NAKSHATRA_LORDS[nakshatraIndex] ?? "Ketu";

const dashaIndex = (planet) => DASHA_ORDER.indexOf(planet);

const yearsToDays = (years) => years * DAYS_PER_DASHA_YEAR;

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const round = (value, places = 4) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * Dasha balance at birth: which graha is running, and how much of its period
 * is left. Derived purely from the Moon's sidereal longitude.
 *
 * @param {number} moonSiderealLongitude
 * @returns {{lord: string, nakshatra: string, pada: number, proportionTraversed: number,
 *            proportionRemaining: number, balanceYears: number, balanceDays: number}}
 */
const calculateDashaBalance = (moonSiderealLongitude) => {
  if (!Number.isFinite(moonSiderealLongitude)) {
    throw new TypeError("calculateDashaBalance requires a finite Moon sidereal longitude");
  }

  const { name, index, pada } = getNakshatra(moonSiderealLongitude);
  const span = 360 / 27; // 13°20'
  const lon = ((moonSiderealLongitude % 360) + 360) % 360;
  const within = lon - index * span;
  const proportionTraversed = within / span;
  const proportionRemaining = 1 - proportionTraversed;

  const lord = nakshatraLord(index);
  const balanceYears = DASHA_YEARS[lord] * proportionRemaining;

  return {
    lord,
    nakshatra: name,
    pada,
    proportionTraversed: round(proportionTraversed),
    proportionRemaining: round(proportionRemaining),
    balanceYears: round(balanceYears),
    balanceDays: round(yearsToDays(balanceYears), 2),
  };
};

/**
 * Sub-divides a period of `totalDays` into 9 consecutive sub-periods,
 * allocated proportionally to each graha's Vimshottari share and starting
 * from `startPlanet` in DASHA_ORDER. Used for both antardasha (inside a
 * mahadasha) and pratyantardasha (inside an antardasha) — the same rule at
 * both levels.
 *
 * @param {Date} startDate
 * @param {number} totalDays
 * @param {string} startPlanet
 * @returns {Array<{planet: string, start: Date, end: Date, days: number, years: number}>}
 */
const buildSubPeriods = (startDate, totalDays, startPlanet) => {
  const offset = dashaIndex(startPlanet);
  let cursor = startDate;

  return DASHA_ORDER.map((_, i) => {
    const planet = DASHA_ORDER[(((offset + i) % DASHA_ORDER.length) + DASHA_ORDER.length) % DASHA_ORDER.length];
    const share = (DASHA_YEARS[planet] / TOTAL_DASHA_YEARS) * totalDays;
    const period = {
      planet,
      start: cursor,
      end: addDays(cursor, share),
      days: round(share, 2),
      // `years` is the time this sub-period actually spans, NOT the graha's
      // full nominal dasha length — a Mercury antardasha inside a 17-year
      // Mercury mahadasha is ~2.4 years, not 17. Derive it from the allocated
      // days so the sub-period years always sum to the parent period's.
      years: round(share / DAYS_PER_DASHA_YEAR, 2),
    };
    cursor = addDays(cursor, share);
    return period;
  });
};

/**
 * The full mahadasha sequence from birth onward.
 *
 * @param {object} params
 * @param {number} params.moonSiderealLongitude
 * @param {Date} params.birthDate - used only to convert the first (partial)
 *   period's balance into calendar dates
 * @param {number} [params.count=12] - how many mahadashas to generate
 * @returns {{balance: object, mahadashas: Array<object>}}
 */
const buildMahadashas = ({ moonSiderealLongitude, birthDate, count = 12 }) => {
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(birth.getTime())) {
    throw new TypeError("buildMahadashas requires a valid birthDate");
  }

  const balance = calculateDashaBalance(moonSiderealLongitude);
  const startOffset = dashaIndex(balance.lord);

  // First period is the remainder of the birth nakshatra lord's dasha; the
  // rest are full periods following in cycle order.
  const mahadashas = [];
  let cursor = birth;

  for (let i = 0; i < count; i++) {
    const planet =
      DASHA_ORDER[
        (((startOffset + i) % DASHA_ORDER.length) + DASHA_ORDER.length) % DASHA_ORDER.length
      ];
    const isFirst = i === 0;
    const years = isFirst ? balance.balanceYears : DASHA_YEARS[planet];
    const days = isFirst
      ? yearsToDays(balance.balanceYears)
      : yearsToDays(DASHA_YEARS[planet]);

    const period = {
      planet,
      start: cursor,
      end: addDays(cursor, days),
      days: round(days, 2),
      years: round(years, 2),
      isPartialAtBirth: isFirst,
    };
    mahadashas.push(period);
    cursor = addDays(cursor, days);
  }

  return { balance, mahadashas };
};

const isBetween = (date, period) => date >= period.start && date < period.end;

const findContaining = (periods, atDate) => periods.find((p) => isBetween(atDate, p)) || null;

/**
 * Full dasha picture for a moment in time: the running mahadasha, its 9
 * antardashas, and the running antardasha's 9 pratyantardashas.
 *
 * If `atDate` is before the first mahadasha starts (i.e. before birth) the
 * current fields come back null rather than being guessed.
 *
 * @param {object} params
 * @param {number} params.moonSiderealLongitude
 * @param {Date} params.birthDate
 * @param {Date} [params.atDate=new Date()]
 * @param {number} [params.mahadashaCount=12]
 */
const getDashaTimeline = ({ moonSiderealLongitude, birthDate, atDate = new Date(), mahadashaCount = 12 }) => {
  const at = atDate instanceof Date ? atDate : new Date(atDate);
  if (Number.isNaN(at.getTime())) throw new TypeError("getDashaTimeline requires a valid atDate");

  const { balance, mahadashas } = buildMahadashas({
    moonSiderealLongitude,
    birthDate,
    count: mahadashaCount,
  });

  const currentMahadasha = findContaining(mahadashas, at);
  if (!currentMahadasha) {
    return { asOf: at, balance, mahadashas, current: null };
  }

  const antardashas = buildSubPeriods(currentMahadasha.start, currentMahadasha.days, currentMahadasha.planet);
  const currentAntardasha = findContaining(antardashas, at);
  const pratyantardashas = currentAntardasha
    ? buildSubPeriods(currentAntardasha.start, currentAntardasha.days, currentAntardasha.planet)
    : [];

  const describe = (period) =>
    period
      ? {
          planet: period.planet,
          start: period.start,
          end: period.end,
          days: period.days,
          years: period.years,
          ...(period.isPartialAtBirth ? { isPartialAtBirth: true } : {}),
        }
      : null;

  return {
    asOf: at,
    balance,
    mahadashas,
    current: {
      mahadasha: describe(currentMahadasha),
      antardasha: describe(currentAntardasha),
      pratyantardasha: describe(findContaining(pratyantardashas, at)),
      // "Dasha Sandhi" — the transition window between consecutive periods.
      // The course treats this as a notably vulnerable time (§7.1), so we
      // surface it explicitly rather than making callers diff dates.
      isDashaSandhi:
        !!(currentAntardasha &&
          addDays(currentAntardasha.end, -90 * (currentAntardasha.days / 365.25)) <= at),
    },
    antardashas,
    pratyantardashas,
  };
};

/**
 * Which houses the running dashas activate — the concrete form of the course
 * rule "Never forget to add the dasha": a malefic sitting in the 6th, 7th, 8th
 * or 12th doesn't cause trouble by itself, but ITS dasha does. Cross-referencing
 * the dasha lord's own house against the planet it activates is the whole point.
 *
 * @param {object} params
 * @param {object} params.planets - { [name]: { house?: number, rashi: string } } from calculateVedicChart
 * @param {object} params.timeline - output of getDashaTimeline
 * @returns {Array<{planet: string, via: string, house: number|null, rashi: string|null, houses: number[]}>}
 */
const getDashaHouseActivations = ({ planets = {}, timeline }) => {
  const current = timeline?.current;
  if (!current?.mahadasha) return [];

  // The grahas running now, outermost first. A planet's dasha activates its own
  // sign (1st from it), the 7th from it, and the sign/lord of the houses its
  // aspected houses point to.
  const running = [
    { planet: current.mahadasha.planet, via: "mahadasha" },
    ...(current.antardasha ? [{ planet: current.antardasha.planet, via: "antardasha" }] : []),
    ...(current.pratyantardasha ? [{ planet: current.pratyantardasha.planet, via: "pratyantardasha" }] : []),
  ];

  return running.map(({ planet, via }) => {
    const rashi = planets?.[planet]?.rashi ?? null;
    // planets[].rashi is a sign NAME (from getRashi), not a longitude, so index
    // it against RASHIS directly — signIndexOf() would expect degrees.
    const signIdx = rashi ? RASHIS.indexOf(rashi) : -1;
    const hasPlacement = signIdx >= 0;
    // Whole-sign: a dasha activates its own house, the 7th (opposite), and the
    // 4th/10th (kendra trine) — the standard four-pada drishti set.
    const houses = hasPlacement
      ? [1, 4, 7, 10].map((h) => ((signIdx + h - 1) % 12) + 1)
      : [];
    return {
      planet,
      via,
      house: planets?.[planet]?.house ?? null,
      rashi,
      lord: rashi ? RASHI_LORDS[rashi] : null,
      houses,
    };
  });
};

module.exports = {
  DASHA_YEARS,
  DASHA_ORDER,
  NAKSHATRA_LORDS,
  TOTAL_DASHA_YEARS,
  DAYS_PER_DASHA_YEAR,
  nakshatraLord,
  calculateDashaBalance,
  buildSubPeriods,
  buildMahadashas,
  getDashaTimeline,
  getDashaHouseActivations,
};
