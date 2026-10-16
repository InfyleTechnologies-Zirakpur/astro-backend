// Birth-chart (kundli) layout engine.
//
// Turns the stored `vedicChart` (the sidereal ascendant + planet longitudes
// computed by vedicAstrologyService) into ready-to-draw chart grids. Two
// divisional charts are produced by default:
//
//   D1 — the Lagna / Rashi chart, i.e. the birth chart itself.
//   D9 — the Navamsa chart, the "inner" chart.
//
// Corpus rule 14.9 is why these two are paired: D1 and D9 are read together,
// never instead of each other ("a planet weak in D1 but strong in D9 is still
// not good in the external world"). Rule 13.4 names D1 and D9 among the few
// divisions that actually carry weight. Other supported dargas (D2, D3, D10,
// D12, D30 …) come out of the same engine through the `vargas` option with no
// extra code, because vedicVargaService.getVargaSign already answers for them.
//
// The output is deliberately presentation-free: it never encodes "North Indian"
// or "South Indian" geometry. Each chart returns its 12 houses and each house
// carries the SIGN that falls in it, so a South Indian renderer can group by
// sign while a North Indian renderer keeps the house order — both from one
// payload.

const { RASHIS, RASHI_LORDS } = require("./vedicAstrologyService");
const { getVargaSign, SUPPORTED_DARGAS } = require("./vedicVargaService");

// The charts the API is willing to offer, and the copy that describes them.
// `key`/`short` are what the client switches on; the titles are only for display.
const VARGA_CATALOG = {
  1: {
    key: "d1",
    short: "D1",
    title: "Lagna chart",
    sanskrit: "Rashi",
    subtitle: "The birth chart itself — the body, the visible life, and the point every other reading starts from.",
  },
  2: {
    key: "d2",
    short: "D2",
    title: "Hora chart",
    sanskrit: "Hora",
    subtitle: "Wealth, and what sustains you.",
  },
  3: {
    key: "d3",
    short: "D3",
    title: "Drekkana chart",
    sanskrit: "Drekkana",
    subtitle: "Siblings, courage and short journeys.",
  },
  9: {
    key: "d9",
    short: "D9",
    title: "Navamsa chart",
    sanskrit: "Navamsa",
    subtitle: "The inner chart — marriage, dharma, and how a planet ripens with age.",
  },
  10: {
    key: "d10",
    short: "D10",
    title: "Dasamsa chart",
    sanskrit: "Dasamsa",
    subtitle: "Career, status and public action.",
  },
  12: {
    key: "d12",
    short: "D12",
    title: "Dwadasamsa chart",
    sanskrit: "Dwadasamsa",
    subtitle: "Parents and lineage.",
  },
  30: {
    key: "d30",
    short: "D30",
    title: "Trimsamsa chart",
    sanskrit: "Trimsamsa",
    subtitle: "Misfortunes and the weak spots a planet hides.",
  },
};

// D1 and D9 are what the product promises, so they are what a bare request gets.
const DEFAULT_VARGAS = [1, 9];

// Classical order, so a cell reads the same way every time instead of following
// JavaScript object-key order.
const PLANET_ORDER = [
  "Ascendant",
  "Sun",
  "Moon",
  "Mars",
  "Mercury",
  "Jupiter",
  "Venus",
  "Saturn",
  "Rahu",
  "Ketu",
];
const planetRank = (name) => {
  const index = PLANET_ORDER.indexOf(name);
  return index === -1 ? PLANET_ORDER.length : index;
};

// Only advertise catalog entries the varga engine can actually answer for.
// Anything else would be a promise the maths cannot keep.
const SUPPORTED_CATALOG_VARGAS = Object.keys(VARGA_CATALOG)
  .map(Number)
  .filter((n) => SUPPORTED_DARGAS.has(n))
  .sort((a, b) => a - b);

const AVAILABLE_CHARTS = SUPPORTED_CATALOG_VARGAS.map((n) => ({
  varga: n,
  key: VARGA_CATALOG[n].key,
  short: VARGA_CATALOG[n].short,
  title: VARGA_CATALOG[n].title,
  sanskrit: VARGA_CATALOG[n].sanskrit,
}));

const signIndex = (sign) => (typeof sign === "string" ? RASHIS.indexOf(sign) : -1);
const round1 = (value) => Math.round(value * 10) / 10;

const NOTE_BY_REASON = {
  "no-chart": "Save your birth date, time and place to calculate your charts.",
  "no-birth-time":
    "A chart needs an exact birth time. Add it to see your Lagna and Navamsa charts.",
  "no-birth-location":
    "A chart needs the birth place (latitude/longitude). Add it to see your Lagna and Navamsa charts.",
  unavailable: "Birth charts could not be calculated from the saved details.",
  "unsupported-varga": "None of the requested divisional charts are supported.",
};

/**
 * Accepts a varga request in any of the shapes the API might see:
 *   1 | "1" | "d1" | "D9" | [1, 9] | "1,9" | "d1,d9" | "all"
 * Unknown or unsupported dargas are dropped rather than guessed at.
 *
 * @returns {number[]} supported darga numbers, in request order
 */
const parseVargas = (input) => {
  if (input === undefined || input === null || input === "") return [...DEFAULT_VARGAS];
  if (input === "all") return [...SUPPORTED_CATALOG_VARGAS];

  const list = Array.isArray(input) ? input : String(input).split(",");
  const out = [];
  for (const raw of list) {
    const token = String(raw).trim().toLowerCase().replace(/^d/, "");
    if (!token) continue;
    const n = Number(token);
    if (
      Number.isInteger(n) &&
      SUPPORTED_CATALOG_VARGAS.includes(n) &&
      !out.includes(n)
    ) {
      out.push(n);
    }
  }
  return out;
};

/**
 * One divisional chart, laid out as 12 whole-sign houses.
 *
 * House 1 is the varga ascendant's sign; each following house is the next sign
 * in zodiacal order (whole-sign / Parashari, matching getHouseOfPlanet). Every
 * house also carries the sign's lord so the client can print it without a
 * second lookup.
 *
 * @returns {object|null} the chart, or null if the inputs cannot produce one
 */
const buildDivisionalChart = (vedicChart, varga, meta) => {
  const ascendant = vedicChart?.ascendant;
  const planets = vedicChart?.planets;
  if (!meta || !ascendant || !Number.isFinite(ascendant.longitude)) return null;
  if (!planets || typeof planets !== "object") return null;

  const ascendantSign = getVargaSign(ascendant.longitude, varga);
  const ascendantIdx = signIndex(ascendantSign);
  if (ascendantIdx < 0) return null;

  const houses = Array.from({ length: 12 }, (_, i) => {
    const sign = RASHIS[(ascendantIdx + i) % 12];
    return {
      house: i + 1,
      sign,
      lord: RASHI_LORDS[sign] || null,
      isAscendant: i === 0,
      planets: [],
    };
  });

  for (const [name, data] of Object.entries(planets)) {
    const longitude = data?.longitude;
    if (!Number.isFinite(longitude)) continue;
    const sign = getVargaSign(longitude, varga);
    const idx = signIndex(sign);
    if (idx < 0) continue;

    const placement = { name, sign };
    // The degree within the sign only means something in D1; carrying the D1
    // degree onto D9 would look like a Navamsa degree and mislead.
    if (varga === 1) placement.degreeInSign = round1(Number(data.degreeInSign) || 0);
    // Rule 6.4: same sign in D1 and D9 ⇒ vargottama, i.e. not weakened by the
    // division. Only worth flagging where D9 is the chart.
    if (varga === 9) placement.isVargottama = getVargaSign(longitude, 1) === sign;

    houses[(idx - ascendantIdx + 12) % 12].planets.push(placement);
  }

  for (const house of houses) {
    house.planets.sort((a, b) => planetRank(a.name) - planetRank(b.name));
  }

  const chart = {
    varga,
    key: meta.key,
    short: meta.short,
    title: meta.title,
    sanskrit: meta.sanskrit,
    subtitle: meta.subtitle,
    ascendantSign,
    ascendantLord: RASHI_LORDS[ascendantSign] || null,
    houses,
    planetCount: houses.reduce((total, house) => total + house.planets.length, 0),
  };
  if (varga === 1) chart.ascendantDegreeInSign = round1(Number(ascendant.degreeInSign) || 0);

  return chart;
};

const unavailable = (reason, note, requestedVargas) => ({
  available: false,
  reason,
  note: note || NOTE_BY_REASON[reason] || NOTE_BY_REASON.unavailable,
  requestedVargas,
  availableCharts: AVAILABLE_CHARTS,
  charts: [],
});

/**
 * Build the drawable chart(s) for one stored Vedic chart.
 *
 * Never fabricates a Lagna: without a birth time AND place the stored chart has
 * no ascendant and the result comes back `available: false` with a reason the
 * client can turn into a "add your birth time" prompt — rather than a plausible
 * looking but wrong wheel.
 *
 * @param {object} vedicChart - the `vedicChart` block from the Horoscope model
 * @param {{vargas?: number|string|number[]}} [options]
 */
const buildBirthCharts = (vedicChart, options = {}) => {
  const requestedVargas = parseVargas(options.vargas);

  if (!vedicChart || typeof vedicChart !== "object" || !vedicChart.precision) {
    return unavailable("no-chart", null, requestedVargas);
  }

  // Only a "full" chart has an ascendant; the other precision levels are
  // sign-only, and a chart without a Lagna is not a chart.
  if (vedicChart.precision !== "full" || !Number.isFinite(vedicChart?.ascendant?.longitude)) {
    const reason = NOTE_BY_REASON[vedicChart.precision]
      ? vedicChart.precision
      : "unavailable";
    return unavailable(reason, vedicChart.note, requestedVargas);
  }

  const charts = requestedVargas
    .map((varga) => buildDivisionalChart(vedicChart, varga, VARGA_CATALOG[varga]))
    .filter(Boolean);

  if (!charts.length) return unavailable("unsupported-varga", null, requestedVargas);

  return {
    available: true,
    reason: null,
    note: null,
    requestedVargas,
    availableCharts: AVAILABLE_CHARTS,
    charts,
  };
};

module.exports = {
  buildBirthCharts,
  buildDivisionalChart,
  parseVargas,
  VARGA_CATALOG,
  AVAILABLE_CHARTS,
  DEFAULT_VARGAS,
  SUPPORTED_CATALOG_VARGAS,
};
