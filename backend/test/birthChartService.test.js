// Birth-chart (kundli) layout engine — Lagna D1 and Navamsa D9.
//
// Dependency-free like the rest of this suite: backend/node_modules is not
// installed locally, so the two services that pull in `astronomy-engine`
// (vedicAstrologyService, vedicVargaService) are replaced in require.cache
// before birthChartService is loaded. This file therefore exercises the LAYOUT
// logic — whole-sign houses, varga anchoring, vargottama, request parsing —
// while the varga/dasha maths have their own suites. No MongoDB, no network.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const RASHIS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const RASHI_LORDS = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon", Leo: "Sun", Virgo: "Mercury",
  Libra: "Venus", Scorpio: "Mars", Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

const signIndexOf = (lon) => Math.floor((((lon % 360) + 360) % 360) / 30);
const getRashi = (lon) => RASHIS[signIndexOf(lon)];
const degreeInSign = (lon) => (((lon % 360) + 360) % 360) % 30;

// The real D9 rule: movable/fixed/dual decide the starting sign, then one sign
// per 3°20' part. Mirrored here so the fixture longitudes below have a knowable
// Navamsa sign to assert against.
const MODALITY_START = { 0: 0, 1: 8, 2: 4 };
const getVargaSign = (lon, darga) => {
  if (!Number.isFinite(lon)) return null;
  const signIdx = signIndexOf(lon);
  if (darga === 1) return RASHIS[signIdx];
  if (darga === 9) {
    const part = Math.min(Math.floor(degreeInSign(lon) / (30 / 9)), 8);
    return RASHIS[(signIdx + MODALITY_START[signIdx % 3] + part) % 12];
  }
  return null;
};

const stub = (relPath, exports) => {
  const filename = require.resolve(path.join(__dirname, "..", relPath));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
};

stub("services/vedicAstrologyService.js", { RASHIS, RASHI_LORDS, signIndexOf, getRashi, degreeInSign });
stub("services/vedicVargaService.js", {
  getVargaSign,
  SUPPORTED_DARGAS: new Set([1, 2, 3, 4, 6, 7, 9, 10, 12, 16, 20, 24, 30, 40, 45, 60]),
});

const {
  buildBirthCharts,
  buildDivisionalChart,
  parseVargas,
  VARGA_CATALOG,
  DEFAULT_VARGAS,
} = require("../services/birthChartService");

// Ascendant at Leo 0°00' → D1 Leo (fixed ⇒ offset 8, part 0) → D9 Aries.
const chart = {
  precision: "full",
  ascendant: { longitude: 120.0, rashi: "Leo", degreeInSign: 0, navamshaSign: "Aries" },
  planets: {
    Sun: { longitude: 125.0, rashi: "Leo", degreeInSign: 5, navamshaSign: "Taurus", retrograde: false },
    Moon: { longitude: 0.5, rashi: "Aries", degreeInSign: 0.5, navamshaSign: "Aries", retrograde: false },
    Rahu: { longitude: 359.0, rashi: "Pisces", degreeInSign: 29, navamshaSign: "Pisces", retrograde: true },
  },
};

const houseOf = (c, sign) => c.houses.find((h) => h.sign === sign);
const planetsIn = (c, sign) => houseOf(c, sign).planets.map((p) => p.name);

test("D1: houses run in zodiacal order from the ascendant sign", () => {
  const d1 = buildBirthCharts(chart).charts.find((c) => c.key === "d1");

  assert.ok(d1, "Lagna chart is present");
  assert.equal(d1.varga, 1);
  assert.equal(d1.ascendantSign, "Leo");
  assert.equal(d1.ascendantLord, "Sun");
  assert.equal(d1.houses.length, 12);
  assert.deepEqual(d1.houses.map((h) => h.sign), [
    "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn",
    "Aquarius", "Pisces", "Aries", "Taurus", "Gemini", "Cancer",
  ]);
  assert.deepEqual(d1.houses.map((h) => h.house), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(d1.houses[0].isAscendant, true);
  assert.equal(d1.houses[1].isAscendant, false);
  // Every house carries its sign lord so the client never has to look it up.
  assert.match(d1.houses[0].lord, /Sun/);
  assert.match(d1.houses[1].lord, /Mercury/);
});

test("D1: planets sit in the whole-sign house of their sign", () => {
  const d1 = buildBirthCharts(chart).charts.find((c) => c.key === "d1");

  assert.deepEqual(planetsIn(d1, "Leo"), ["Sun"]); // own sign ⇒ house 1
  assert.equal(houseOf(d1, "Leo").house, 1);
  assert.deepEqual(planetsIn(d1, "Aries"), ["Moon"]); // 9th from Leo
  assert.equal(houseOf(d1, "Aries").house, 9);
  assert.deepEqual(planetsIn(d1, "Pisces"), ["Rahu"]); // 8th from Leo
  assert.equal(houseOf(d1, "Pisces").house, 8);

  // D1 keeps the within-sign degree so a placement can be printed exactly.
  assert.equal(houseOf(d1, "Leo").planets[0].degreeInSign, 5);
  assert.equal(d1.ascendantDegreeInSign, 0);
  assert.equal(d1.planetCount, 3);
});

test("D9: the Navamsa is anchored to the varga ascendant, not the D1 one", () => {
  const d9 = buildBirthCharts(chart).charts.find((c) => c.key === "d9");

  assert.ok(d9, "Navamsa chart is present");
  assert.equal(d9.varga, 9);
  assert.equal(d9.ascendantSign, "Aries");
  assert.equal(d9.ascendantLord, "Mars");
  assert.deepEqual(d9.houses.map((h) => h.sign), RASHIS);
  assert.equal(d9.houses[0].isAscendant, true);

  // Navamsa signs: Moon Aries (h1), Sun Taurus (h2), Rahu Pisces (h12).
  assert.deepEqual(planetsIn(d9, "Aries"), ["Moon"]);
  assert.equal(houseOf(d9, "Aries").house, 1);
  assert.deepEqual(planetsIn(d9, "Taurus"), ["Sun"]);
  assert.equal(houseOf(d9, "Taurus").house, 2);
  assert.deepEqual(planetsIn(d9, "Pisces"), ["Rahu"]);
  assert.equal(houseOf(d9, "Pisces").house, 12);

  // A degree from D1 would look like a Navamsa degree and mislead — omitted.
  assert.equal("degreeInSign" in houseOf(d9, "Taurus").planets[0], false);
  assert.equal("ascendantDegreeInSign" in d9, false);
});

test("retrograde travels with the planet into every varga", () => {
  const d1 = buildBirthCharts(chart).charts.find((c) => c.key === "d1");
  const d9 = buildBirthCharts(chart).charts.find((c) => c.key === "d9");

  // Direct planet: no flag at all.
  assert.equal(houseOf(d1, "Leo").planets[0].retrograde, undefined);
  // A retrograde planet is flagged on D1 and on D9 alike — it is a property of
  // the birth instant, not of the division.
  assert.equal(houseOf(d1, "Pisces").planets[0].retrograde, true);
  assert.equal(houseOf(d9, "Pisces").planets[0].retrograde, true);
});

test("D9: same sign in D1 and D9 is flagged vargottama (rule 6.4)", () => {
  const d9 = buildBirthCharts(chart).charts.find((c) => c.key === "d9");

  assert.equal(houseOf(d9, "Aries").planets[0].isVargottama, true); // Aries/Aries
  assert.equal(houseOf(d9, "Pisces").planets[0].isVargottama, true); // Pisces/Pisces
  assert.equal(houseOf(d9, "Taurus").planets[0].isVargottama, false); // Leo → Taurus
});

test("planets in a house follow classical order regardless of input order", () => {
  const many = {
    precision: "full",
    ascendant: { longitude: 120.0, degreeInSign: 0 },
    planets: {
      Ketu: { longitude: 149.0, degreeInSign: 29 },
      Sun: { longitude: 121.0, degreeInSign: 1 },
      Jupiter: { longitude: 122.0, degreeInSign: 2 },
      Moon: { longitude: 123.0, degreeInSign: 3 },
    },
  };
  const d1 = buildDivisionalChart(many, 1, VARGA_CATALOG[1]);
  assert.deepEqual(planetsIn(d1, "Leo"), ["Sun", "Moon", "Jupiter", "Ketu"]);
});

test("no ascendant means no chart, but the reason is reported", () => {
  const bundle = buildBirthCharts({
    precision: "no-birth-time",
    note: "Add your birth time to get an ascendant.",
    planets: {},
  });
  assert.equal(bundle.available, false);
  assert.equal(bundle.reason, "no-birth-time");
  assert.equal(bundle.note, "Add your birth time to get an ascendant.");
  assert.deepEqual(bundle.charts, []);
});

test("a chart missing only the place reports no-birth-location", () => {
  const bundle = buildBirthCharts({
    precision: "no-birth-location",
    note: "Add your birth place to get an ascendant.",
    planets: {},
  });
  assert.equal(bundle.available, false);
  assert.equal(bundle.reason, "no-birth-location");
  assert.deepEqual(bundle.charts, []);
});

test("a missing or unrecognised chart is reported, never fabricated", () => {
  for (const input of [undefined, null, {}, "nonsense"]) {
    const bundle = buildBirthCharts(input);
    assert.equal(bundle.available, false);
    assert.equal(bundle.reason, "no-chart");
    assert.deepEqual(bundle.charts, []);
  }
});

test("parseVargas accepts every client shape and drops what it cannot draw", () => {
  assert.deepEqual(parseVargas(undefined), DEFAULT_VARGAS);
  assert.deepEqual(parseVargas(""), DEFAULT_VARGAS);
  assert.deepEqual(parseVargas("d1,d9"), [1, 9]);
  assert.deepEqual(parseVargas("D9"), [9]);
  assert.deepEqual(parseVargas("1, 9, 1"), [1, 9]);
  assert.deepEqual(parseVargas([9, 1]), [9, 1]);
  assert.deepEqual(parseVargas("5"), []); // D5 is not in the catalog
  assert.deepEqual(parseVargas("nonsense"), []);
  assert.deepEqual(parseVargas("all"), [1, 2, 3, 9, 10, 12, 30]);
});

test("a request for one chart returns only that chart", () => {
  const bundle = buildBirthCharts(chart, { vargas: "d9" });
  assert.equal(bundle.available, true);
  assert.deepEqual(bundle.requestedVargas, [9]);
  assert.deepEqual(bundle.charts.map((c) => c.key), ["d9"]);
});

test("asking only for an undrawable varga reports it instead of silently falling back", () => {
  const bundle = buildBirthCharts(chart, { vargas: "d5" });
  assert.equal(bundle.available, false);
  assert.equal(bundle.reason, "unsupported-varga");
  assert.deepEqual(bundle.charts, []);
});

test("a bare request returns the Lagna and Navamsa and advertises the rest", () => {
  const bundle = buildBirthCharts(chart);
  assert.equal(bundle.available, true);
  assert.equal(bundle.reason, null);
  assert.equal(bundle.note, null);
  assert.deepEqual(bundle.requestedVargas, DEFAULT_VARGAS);
  assert.deepEqual(bundle.charts.map((c) => c.key), ["d1", "d9"]);
  assert.deepEqual(bundle.availableCharts.map((c) => c.key), [
    "d1", "d2", "d3", "d9", "d10", "d12", "d30",
  ]);
});
