const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeVedicAnalysis } = require("../services/vedicAnalysisService");
const { buildVedicAnalysis } = require("../services/vedicAnalysisService");
const { calculateVedicChart, RASHIS } = require("../services/vedicAstrologyService");

const BIRTH = {
  dateOfBirth: "1990-01-15",
  timeOfBirth: "06:30",
  timeZoneOffsetMinutes: 330,
  latitude: 28.6139,
  longitude: 77.209,
};

const buildFixture = () => {
  const chart = calculateVedicChart(BIRTH);
  return buildVedicAnalysis({ chart, utcDate: chart.birthInstant ? new Date(chart.birthInstant) : null });
};

test("the summary is dramatically smaller than the full analysis", () => {
  const analysis = buildFixture();
  const summary = summarizeVedicAnalysis(analysis);

  const fullSize = JSON.stringify(analysis).length;
  const summarySize = JSON.stringify(summary).length;
  assert.ok(summarySize < fullSize * 0.5, `summary ${summarySize} should be well under half of ${fullSize}`);
  // It still has to fit a prompt, so put a hard ceiling on it.
  assert.ok(summarySize < 8000, `summary was ${summarySize} bytes`);
});

test("strongest and weakest are ranked by the 6.1 multiplier", () => {
  const analysis = buildFixture();
  const summary = summarizeVedicAnalysis(analysis);

  assert.equal(summary.strongest.length, 3);
  assert.equal(summary.weakest.length, 3);

  // Strongest must be in descending order, and no weaker than the weakest.
  for (let i = 1; i < summary.strongest.length; i += 1) {
    assert.ok(
      summary.strongest[i - 1].multiplier >= summary.strongest[i].multiplier,
      "strongest must be descending",
    );
  }
  for (let i = 1; i < summary.weakest.length; i += 1) {
    assert.ok(summary.weakest[i - 1].multiplier <= summary.weakest[i].multiplier, "weakest must be ascending");
  }
  const best = Math.max(...summary.strongest.map((p) => p.multiplier));
  const worst = Math.min(...summary.weakest.map((p) => p.multiplier));
  assert.ok(best >= worst, "the strongest must be at least as strong as the weakest");

  // Every entry names its planet and carries the states that produced the score.
  for (const entry of [...summary.strongest, ...summary.weakest]) {
    assert.ok(RASHIS.includes(entry.rashi));
    assert.equal(typeof entry.dignity, "string");
    assert.ok(Number.isFinite(entry.multiplier));
    assert.ok(Array.isArray(entry.states));
  }
});

test("notable lists exactly the retrograde, combust and vargottama planets", () => {
  const analysis = buildFixture();
  const summary = summarizeVedicAnalysis(analysis);

  const expected = Object.entries(analysis.planets)
    .filter(([, block]) => block.retrograde || block.combustion.isCombust || block.flags.isVargottama)
    .map(([name]) => name)
    .sort();

  assert.deepEqual(summary.notable.map((n) => n.planet).sort(), expected);

  for (const entry of summary.notable) {
    const block = analysis.planets[entry.planet];
    assert.equal(entry.retrograde, block.retrograde);
    assert.equal(entry.combust, block.combustion.isCombust);
    assert.equal(entry.vargottama, block.flags.isVargottama);
    // Combustion detail is only carried when it actually applies.
    if (entry.combust) {
      assert.ok(Number.isFinite(entry.combustion.distanceFromSun));
      assert.equal(typeof entry.combustion.relationToSun, "string");
    } else {
      assert.equal(entry.combustion, undefined);
    }
  }
});

test("the summary never reports a combust Sun", () => {
  const analysis = buildFixture();
  const summary = summarizeVedicAnalysis(analysis);
  const sun = summary.notable.find((n) => n.planet === "Sun");
  if (sun) assert.equal(sun.combust, false);
  assert.equal(analysis.planets.Sun.combustion.isCombust, false);
});

test("the summary keeps provenance so the model can cite correctly", () => {
  const summary = summarizeVedicAnalysis(buildFixture());
  assert.ok(summary.provenance.corpusRules.includes("6.1"));
  assert.ok(summary.provenance.convention.length > 0);
  assert.match(summary.provenance.note, /D1 is primary/);
});

test("the summary carries precision and the retrograde-availability flag", () => {
  const chart = calculateVedicChart(BIRTH);
  const full = buildVedicAnalysis({ chart, utcDate: new Date(chart.birthInstant) });
  assert.equal(summarizeVedicAnalysis(full).retrogradeStatusAvailable, true);
  assert.equal(summarizeVedicAnalysis(full).precision, "full");

  // Without the instant, the flag must say so rather than implying all clear.
  const noInstant = buildVedicAnalysis({ chart });
  assert.equal(summarizeVedicAnalysis(noInstant).retrogradeStatusAvailable, false);
});

test("the summary omits the bulky aspect graph and per-planet varga tables", () => {
  const summary = summarizeVedicAnalysis(buildFixture());
  assert.equal(summary.aspects, undefined, "the aspect graph must not reach the prompt");
  assert.equal(summary.vargas, undefined, "per-planet varga tables must not reach the prompt");
  // But the judgement-bearing blocks that a rule actually names must survive.
  assert.ok(summary.d1d9, "rule 14.9 D1/D9 comparison is kept");
  assert.ok(summary.moonShadvarga, "rule 13.10 shadvarga is kept");
  assert.ok(Array.isArray(summary.conjunctions));
  assert.ok(summary.houseLords);
});

test("the summary degrades safely", () => {
  assert.equal(summarizeVedicAnalysis(), null);
  assert.equal(summarizeVedicAnalysis(null), null);
  assert.equal(summarizeVedicAnalysis({}), null);
  assert.equal(summarizeVedicAnalysis({ planets: null }), null);
  assert.equal(summarizeVedicAnalysis({ planets: {} }), null);
  // A partial block must not throw.
  const partial = summarizeVedicAnalysis({ planets: { Sun: { rashi: "Leo", dignity: "exalted", score: { multiplier: 3, applied: [] }, flags: {}, combustion: {} } } });
  assert.equal(partial.strongest.length, 1);
  assert.equal(partial.strongest[0].planet, "Sun");
});

test("the summary is JSON-serialisable and finite", () => {
  const summary = summarizeVedicAnalysis(buildFixture());
  const serialised = JSON.stringify(summary);
  assert.equal(serialised.includes("NaN"), false);
  assert.equal(serialised.includes("Infinity"), false);
  assert.deepEqual(JSON.parse(serialised), summary);
});
