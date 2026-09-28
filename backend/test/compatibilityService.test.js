const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateCompatibility,
  SCORED_CATEGORY_KEYS,
} = require("../services/compatibilityService");
const { calculateVedicChart } = require("../services/vedicAstrologyService");
const Questionnaire = require("../models/questionnaire");

// The overall label thresholds live on the ratio of "Very Compatible"
// categories, so these are the three possible headline labels.
const LABELS = ["Strong Foundation", "Generally Compatible", "Needs Understanding"];

// A questionnaire where every answer is the same, so each category scores 1.0
// and the expected overall score is exactly 100. Using one value avoids the
// opposite-words table producing an arbitrary mix of scores.
const uniformQuestionnaire = (answer = "communicative and collaborative") =>
  Object.fromEntries(Questionnaire.fields.map((field) => [field, answer]));

const profile = (relationshipGoal = "build a family") => ({ relationshipGoal });

// Mirrors what models/horoscope.js persists in its pre-validate hook: the
// sidereal chart is computed once on save and read back from `vedicChart`, so
// fixtures must supply it rather than raw birth fields.
const horoscope = ({
  dateOfBirth = "1992-04-18",
  timeOfBirth = "14:30",
  latitude = 19.076,
  longitude = 72.8777,
  timeZoneOffsetMinutes = 330,
  sunSign = "Leo",
  moonSign = "Libra",
} = {}) => {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const vedicChart = timeOfBirth
    ? calculateVedicChart({ dateOfBirth: birth, timeOfBirth, latitude, longitude, timeZoneOffsetMinutes })
    : calculateVedicChart({ dateOfBirth: birth, timeOfBirth: null, latitude: null, longitude: null, timeZoneOffsetMinutes });
  return { dateOfBirth: birth, timeOfBirth, latitude, longitude, timeZoneOffsetMinutes, sunSign, moonSign, vedicChart };
};

test("the scored category allowlist covers the 11 questionnaire categories and nothing else", () => {
  assert.equal(SCORED_CATEGORY_KEYS.length, 11);
  assert.equal(new Set(SCORED_CATEGORY_KEYS).size, 11);
  for (const key of SCORED_CATEGORY_KEYS) {
    assert.match(key, /^[a-z][A-Za-z]*$/, "keys are camelCase category names");
  }
  // The optional astrology sections must never be part of the headline score.
  assert.ok(!SCORED_CATEGORY_KEYS.includes("astrology"));
  assert.ok(!SCORED_CATEGORY_KEYS.includes("vedic"));
});

test("a fully-aligned pair scores 100 and reports no challenges", () => {
  const report = calculateCompatibility({
    profileA: profile(),
    questionnaireA: uniformQuestionnaire(),
    profileB: profile(),
    questionnaireB: uniformQuestionnaire(),
  });

  assert.equal(report.score, 100);
  assert.equal(report.overallLabel, "Strong Foundation");
  assert.equal(report.potentialChallenges.length, 0);
  assert.ok(report.strengths.length > 0);
  // No horoscopes were supplied, so neither optional section should appear.
  assert.equal(report.astrology, undefined);
  assert.equal(report.vedic, undefined);
});

test("adding horoscopes does not change the headline score", () => {
  // This is the regression guard for the score-contamination bug: the optional
  // astrology sections carry their own 0..1 sub-scores, and folding them into
  // the average used to shift both `score` and `overallLabel` depending on
  // whether the couple had a horoscope on file.
  const base = { profileA: profile(), profileB: profile(), questionnaireA: uniformQuestionnaire(), questionnaireB: uniformQuestionnaire() };
  const withoutCharts = calculateCompatibility(base);

  const withCharts = calculateCompatibility({
    ...base,
    horoscopeA: horoscope(),
    horoscopeB: horoscope({ dateOfBirth: "1993-08-05", timeOfBirth: "09:15", latitude: 28.6139, longitude: 77.209 }),
  });

  assert.equal(withCharts.score, withoutCharts.score, "score must be unaffected by optional sections");
  assert.equal(withCharts.overallLabel, withoutCharts.overallLabel);
  // The score is the mean of the 11 categories, never divided by more.
  const categoryMean = SCORED_CATEGORY_KEYS.reduce((sum, key) => sum + withCharts[key].score, 0) / SCORED_CATEGORY_KEYS.length;
  assert.equal(withCharts.score, Math.round(categoryMean * 100));
});

test("strengths and challenges only ever name questionnaire categories", () => {
  const report = calculateCompatibility({
    profileA: profile(),
    questionnaireA: uniformQuestionnaire(),
    profileB: profile(),
    questionnaireB: uniformQuestionnaire(),
    horoscopeA: horoscope(),
    horoscopeB: horoscope({ dateOfBirth: "1993-08-05", timeOfBirth: "09:15", latitude: 28.6139, longitude: 77.209 }),
  });

  const categoryKeys = new Set(SCORED_CATEGORY_KEYS);
  for (const line of [...report.strengths, ...report.potentialChallenges]) {
    const key = line.split(" ")[0];
    assert.ok(
      categoryKeys.has(key),
      `"${line}" names a non-category key; astrology sections must not appear in prose`,
    );
  }
});

test("an astrology section that happens to be high-scoring cannot lift the overall score", () => {
  // A pair whose questionnaires disagree everywhere (low score) but whose
  // Western signs are identical (sub-score 1.0). Pre-fix this averaged the 1.0
  // in and inflated the result.
  const opposite = uniformQuestionnaire();
  const other = uniformQuestionnaire("reserved and independent");
  const report = calculateCompatibility({
    profileA: profile("build a family"),
    questionnaireA: opposite,
    profileB: profile("keep things casual"),
    questionnaireB: other,
    horoscopeA: horoscope(),
    horoscopeB: horoscope(),
  });

  const categoryMean = SCORED_CATEGORY_KEYS.reduce((sum, key) => sum + report[key].score, 0) / SCORED_CATEGORY_KEYS.length;
  assert.equal(report.score, Math.round(categoryMean * 100));
  if (report.astrology) {
    assert.ok(
      report.astrology.score >= report.score / 100,
      "sanity: the high astrology sub-score is present but must not dominate",
    );
  }
});

test("the vedic section is emitted when both horoscopes carry a sidereal chart", () => {
  const report = calculateCompatibility({
    profileA: profile(),
    questionnaireA: uniformQuestionnaire(),
    profileB: profile(),
    questionnaireB: uniformQuestionnaire(),
    horoscopeA: horoscope(),
    horoscopeB: horoscope({ dateOfBirth: "1993-08-05", timeOfBirth: "09:15", latitude: 28.6139, longitude: 77.209 }),
    genderA: "male",
    genderB: "female",
  });

  assert.ok(report.vedic, "expected a vedic section");
  assert.equal(report.vedic.available, true, "both charts have full precision");
  assert.ok(report.vedic.gunaMilan, "Guna Milan needs only the Moon sign");
  assert.ok(report.vedic.gunaMilan.totalPoints <= 36);
  assert.ok(report.vedic.signCompatibility, "full precision enables sign matchmaking");
  assert.ok(report.vedic.ruleEngineA && report.vedic.ruleEngineB);
  // Adding vedic must not have disturbed the questionnaire-derived score.
  assert.equal(report.score, 100);
});

test("a date-only horoscope still yields Guna Milan but reports itself as limited", () => {
  // No birth time or location: the sidereal chart is partial, so ascendant
  // rules cannot run — but the headline 36-point match still can.
  const dateOnly = (dateOfBirth) => horoscope({
    dateOfBirth,
    timeOfBirth: null,
    latitude: null,
    longitude: null,
  });

  const report = calculateCompatibility({
    profileA: profile(),
    questionnaireA: uniformQuestionnaire(),
    profileB: profile(),
    questionnaireB: uniformQuestionnaire(),
    horoscopeA: dateOnly("1992-04-18"),
    horoscopeB: dateOnly("1993-08-05"),
    genderA: "male",
    genderB: "female",
  });

  assert.ok(report.vedic, "still emits a vedic section");
  assert.equal(report.vedic.available, false);
  assert.ok(report.vedic.gunaMilan, "Moon-sign Guna Milan works from date alone");
  assert.equal(report.vedic.signCompatibility, undefined, "no ascendant, so no sign matchmaking");
  assert.match(report.vedic.note, /birth time/i, "explains why the rest is unavailable");
  assert.equal(report.score, 100, "questionnaire score untouched");
});

test("no vedic section is emitted when either partner has no horoscope", () => {
  const report = calculateCompatibility({
    profileA: profile(),
    questionnaireA: uniformQuestionnaire(),
    profileB: profile(),
    questionnaireB: uniformQuestionnaire(),
    horoscopeA: horoscope(new Date("1992-04-18"), "14:30", 19.076, 72.8777),
  });
  assert.equal(report.vedic, undefined);
});

test("a mismatched but internally consistent report keeps score and label in range", () => {
  const report = calculateCompatibility({
    profileA: profile("build a family"),
    questionnaireA: uniformQuestionnaire(),
    profileB: profile("keep things casual"),
    questionnaireB: uniformQuestionnaire("reserved and independent"),
  });

  assert.ok(report.score >= 0 && report.score <= 100, `score out of range: ${report.score}`);
  assert.ok(LABELS.includes(report.overallLabel), `unexpected label ${report.overallLabel}`);
  // Every scored category must be present and in range.
  for (const key of SCORED_CATEGORY_KEYS) {
    assert.ok(report[key], `missing category ${key}`);
    assert.ok(report[key].score >= 0 && report[key].score <= 1);
  }
});
