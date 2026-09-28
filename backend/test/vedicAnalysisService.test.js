const test = require("node:test");
const assert = require("node:assert/strict");
const { buildVedicAnalysis, buildHouseLords, ANALYSIS_VERSION } = require("../services/vedicAnalysisService");
const { calculateVedicChart, RASHIS, RASHI_LORDS } = require("../services/vedicAstrologyService");

const BIRTH = {
  dateOfBirth: "1990-01-15",
  timeOfBirth: "06:30",
  timeZoneOffsetMinutes: 330,
  latitude: 28.6139,
  longitude: 77.209,
};

test("buildVedicAnalysis combines varga, strength, drishti and dosha-free blocks", () => {
  const chart = calculateVedicChart(BIRTH);
  assert.ok(chart.ascendant, "fixture chart should have an Ascendant");

  const analysis = buildVedicAnalysis({ chart, utcDate: new Date("1990-01-15T01:00:00Z") });
  assert.equal(analysis.version, ANALYSIS_VERSION);
  assert.equal(analysis.precision, chart.precision);
  assert.equal(analysis.retrogradeStatusAvailable, true);

  // Every planet the chart knows about must appear in the strength block.
  for (const name of Object.keys(chart.planets)) {
    assert.ok(analysis.planets[name], `${name} missing from strength`);
    assert.equal(analysis.planets[name].planet, name);
    assert.ok(RASHIS.includes(analysis.planets[name].rashi));
  }
  assert.ok(analysis.vargas, "varga block present");
  assert.ok(analysis.d1d9, "D1/D9 comparison present");
  assert.ok(analysis.moonShadvarga, "rule 13.10 Moon block present");
  assert.ok(analysis.aspects, "aspect block present");
  assert.ok(analysis.houseLords, "house lords present when the Ascendant is known");
});

test("provenance separates corpus rules from convention", () => {
  const chart = calculateVedicChart(BIRTH);
  const analysis = buildVedicAnalysis({ chart, utcDate: new Date("1990-01-15T01:00:00Z") });

  assert.ok(Array.isArray(analysis.provenance.corpusRules));
  assert.ok(Array.isArray(analysis.provenance.convention));
  assert.ok(analysis.provenance.corpusRules.includes("6.1"));
  assert.ok(analysis.provenance.corpusRules.includes("13.10"));
  assert.ok(analysis.provenance.corpusRules.includes("14.9"));
  // The drishti table beyond the 7th and the combustion limits must be flagged
  // as convention, never presented as corpus teaching.
  assert.ok(analysis.provenance.convention.some((c) => /drishti/.test(c)));
  assert.ok(analysis.provenance.convention.some((c) => /combustion/.test(c)));
  // The two lists must not overlap.
  for (const rule of analysis.provenance.corpusRules) {
    assert.equal(analysis.provenance.convention.includes(rule), false, `${rule} is in both lists`);
  }
  assert.match(analysis.provenance.note, /D1 is primary/);
});

test("retrograde status is optional and its absence is recorded, not assumed", () => {
  const chart = calculateVedicChart(BIRTH);

  const without = buildVedicAnalysis({ chart });
  assert.equal(without.retrogradeStatusAvailable, false);
  for (const block of Object.values(without.planets)) {
    assert.equal(block.retrograde, false, "must not claim retrograde knowledge it does not have");
  }

  const withBadDate = buildVedicAnalysis({ chart, utcDate: new Date("not a date") });
  assert.equal(withBadDate.retrogradeStatusAvailable, false);
  const withInvalidDate = buildVedicAnalysis({ chart, utcDate: "2020-01-01" });
  assert.equal(withInvalidDate.retrogradeStatusAvailable, false, "a string is not a Date instance");
});

test("house lords are derived from the Ascendant and cover all 12 houses", () => {
  // Ascendant in Aries: house 1 = Aries, 7 = Libra, 12 = Pisces.
  const aries = RASHIS.indexOf("Aries") * 30;
  const lords = buildHouseLords(aries);
  assert.equal(Object.keys(lords).length, 12);
  assert.equal(lords["1"].sign, "Aries");
  assert.equal(lords["1"].lord, "Mars");
  assert.equal(lords["7"].sign, "Libra");
  assert.equal(lords["7"].lord, "Venus");
  assert.equal(lords["12"].sign, "Pisces");
  assert.equal(lords["12"].lord, "Jupiter");

  // Every house lord must agree with the sign lord table, for every Ascendant.
  for (let asc = 0; asc < 12; asc += 1) {
    const built = buildHouseLords(asc * 30 + 5);
    for (const [house, entry] of Object.entries(built)) {
      assert.equal(entry.lord, RASHI_LORDS[entry.sign], `house ${house} lord mismatch`);
    }
  }

  assert.equal(buildHouseLords(undefined), null);
  assert.equal(buildHouseLords(Number.NaN), null);
  assert.equal(buildHouseLords("0"), null);
});

test("conjunctions are grouped by sign", () => {
  const chart = calculateVedicChart(BIRTH);
  const analysis = buildVedicAnalysis({ chart });

  // Whatever the fixture chart contains, every listed group must be real.
  const seen = new Map();
  for (const [name, data] of Object.entries(chart.planets)) {
    if (!seen.has(data.rashi)) seen.set(data.rashi, []);
    seen.get(data.rashi).push(name);
  }
  for (const group of analysis.conjunctions) {
    const expected = seen.get(group.sign) || [];
    assert.deepEqual([...group.planets].sort(), [...expected].sort(), `conjunction in ${group.sign}`);
    assert.ok(group.planets.length > 1, "a group of one is not a conjunction");
  }
  // And no multi-planet sign may be missing from the grouping.
  const multi = [...seen.entries()].filter(([, names]) => names.length > 1).map(([sign]) => sign).sort();
  assert.deepEqual(analysis.conjunctions.map((g) => g.sign).sort(), multi);
});

test("analysis degrades safely on missing or malformed input", () => {
  assert.equal(buildVedicAnalysis(), null);
  assert.equal(buildVedicAnalysis({}), null);
  assert.equal(buildVedicAnalysis({ chart: null }), null);
  assert.equal(buildVedicAnalysis({ chart: {} }), null);
  assert.equal(buildVedicAnalysis({ chart: { planets: null } }), null);
  assert.equal(buildVedicAnalysis({ chart: { planets: {} } }), null);
  // Planets with non-finite longitudes are dropped, not propagated as NaN.
  const partial = buildVedicAnalysis({
    chart: { planets: { Sun: { longitude: 10 }, Moon: { longitude: Number.NaN } } },
  });
  assert.ok(partial);
  assert.deepEqual(Object.keys(partial.planets), ["Sun"]);
  assert.equal(partial.houseLords, null, "no Ascendant means no house lords");
  assert.equal(partial.moonShadvarga, null, "no usable Moon means no shadvarga assessment");
});

test("a birth chart without time degrades to planet-only analysis", () => {
  // No time or location: no Ascendant, so houses and drishti-by-house are
  // unavailable, but sign-based analysis must still work.
  const chart = calculateVedicChart({ dateOfBirth: "1990-01-15" });
  assert.equal(chart.precision, "no-birth-time");

  const analysis = buildVedicAnalysis({ chart, utcDate: new Date("1990-01-15T00:00:00Z") });
  assert.equal(analysis.precision, "no-birth-time");
  assert.ok(analysis.planets, "sign-based strength is still available");
  assert.ok(Object.keys(analysis.planets).length > 0);
  assert.equal(analysis.houseLords, null);
  // It must NOT silently invent an Ascendant or house lords.
  assert.equal(analysis.ascendant ?? null, null);
});

test("the analysis is JSON-serialisable, since it is stored as Mixed", () => {
  const chart = calculateVedicChart(BIRTH);
  const analysis = buildVedicAnalysis({ chart, utcDate: new Date("1990-01-15T01:00:00Z") });

  const roundTripped = JSON.parse(JSON.stringify(analysis));
  assert.deepEqual(roundTripped, analysis, "a stored analysis must survive a JSON round trip");

  // No NaN or Infinity, which JSON would silently turn into null.
  const serialised = JSON.stringify(analysis);
  // JSON.stringify silently turns NaN and Infinity into null, which would make
  // the stored block quietly wrong. Neither may appear.
  assert.equal(serialised.includes("NaN"), false);
  assert.equal(serialised.includes("Infinity"), false);

  // Walk the structure and assert no numeric field is non-finite.
  const walk = (node) => {
    if (typeof node === "number") assert.ok(Number.isFinite(node), `non-finite number: ${node}`);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(analysis);

  // A null in the persisted block must be a deliberate "not applicable", not an
  // accident. degreeOrder is null unless the planet shares the Sun's sign.
  for (const block of Object.values(analysis.planets)) {
    const sameSign = block.combustion.relationToSun === "same-sign";
    if (sameSign) assert.notEqual(block.combustion.degreeOrder, null);
    else assert.equal(block.combustion.degreeOrder, null);
  }
});
