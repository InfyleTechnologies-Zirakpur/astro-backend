const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMBUSTION_LIMITS,
  STRENGTH_MULTIPLIERS,
  angularDistance,
  getRetrogradeStatus,
  getCombustion,
  isMaleficForAffliction,
  assessPlanetStrength,
  assessChartStrength,
} = require("../services/planetStrengthService");
const { getPlanetSiderealLongitudes, RASHI_LORDS } = require("../services/vedicAstrologyService");
const { RASHIS } = require("../services/vedicAstrologyService");

const startOf = (signName) => RASHIS.indexOf(signName) * 30;
const at = (signName, degree) => startOf(signName) + degree;

test("angular distance is always the shorter way round", () => {
  assert.equal(angularDistance(0, 0), 0);
  assert.equal(angularDistance(0, 10), 10);
  assert.equal(angularDistance(0, 350), 10);
  assert.equal(angularDistance(0, 180), 180);
  assert.equal(angularDistance(0, 181), 179);
  assert.equal(angularDistance(350, 10), 20);
  for (let a = 0; a < 360; a += 17) {
    for (let b = 0; b < 360; b += 23) {
      const d = angularDistance(a, b);
      assert.ok(d >= 0 && d <= 180, `distance ${d} out of range for ${a}/${b}`);
      // The same pair measured the other way round must agree.
      assert.equal(angularDistance(b, a), d);
    }
  }
});

test("rule 6.1 multipliers match the corpus table exactly", () => {
  assert.equal(STRENGTH_MULTIPLIERS.exalted, 3);
  assert.equal(STRENGTH_MULTIPLIERS.retrograde, 3);
  assert.equal(STRENGTH_MULTIPLIERS.ownSign, 2);
  assert.equal(STRENGTH_MULTIPLIERS.vargottama, 2);
  assert.equal(STRENGTH_MULTIPLIERS.moolatrikona, 2);
  assert.equal(STRENGTH_MULTIPLIERS.debilitated, 1 / 3);
});

test("dignity flags are detected from sign, and the multiplier follows 6.1", () => {
  // Sun exalted in Aries.
  const sun = assessPlanetStrength("Sun", at("Aries", 5), {});
  assert.equal(sun.dignity, "exalted");
  assert.equal(sun.flags.isExalted, true);
  assert.equal(sun.score.multiplier, 3);
  assert.equal(sun.score.band, "strong");

  // Sun debilitated in Libra -> divide by 3.
  const weak = assessPlanetStrength("Sun", at("Libra", 5), {});
  assert.equal(weak.dignity, "debilitated");
  assert.equal(weak.score.multiplier, 1 / 3);
  assert.equal(weak.score.band, "weak");

  // Mars is EXALTED in Capricorn — Saturn is that sign's lord, so this is not
  // own sign. Exalted + retrograde = 3 x 3 = 9.
  const marsExalted = assessPlanetStrength("Mars", at("Capricorn", 5), { retrograde: true });
  assert.equal(marsExalted.flags.isExalted, true);
  assert.equal(marsExalted.flags.isOwnSign, false, "Capricorn is ruled by Saturn, not Mars");
  assert.equal(marsExalted.flags.isRetrograde, true);
  assert.equal(marsExalted.score.multiplier, 9);
  assert.deepEqual(marsExalted.score.applied.map((a) => a.state).sort(), ["exalted", "retrograde"]);

  // Mars in Aries, which it both rules AND has as moolatrikona, and retrograde:
  // own sign 2 x moolatrikona 2 x retrograde 3 = 12.
  const mars = assessPlanetStrength("Mars", at("Aries", 5), { retrograde: true });
  assert.equal(mars.flags.isOwnSign, true);
  assert.equal(mars.flags.isMoolatrikona, true);
  assert.equal(mars.flags.isExalted, false, "Aries is Mars's own sign, not its exaltation");
  assert.equal(mars.score.multiplier, 12);
  assert.equal(mars.score.band, "very-strong");
  assert.deepEqual(mars.score.applied.map((a) => a.state).sort(), ["moolatrikona", "ownSign", "retrograde"]);

  // Mars in Scorpio is own sign but NOT moolatrikona: 2 x 3 = 6.
  const marsScorpio = assessPlanetStrength("Mars", at("Scorpio", 5), { retrograde: true });
  assert.equal(marsScorpio.flags.isOwnSign, true);
  assert.equal(marsScorpio.flags.isMoolatrikona, false);
  assert.equal(marsScorpio.score.multiplier, 6);

  // Jupiter in Sagittarius: own sign AND moolatrikona -> 2 x 2 = 4. In the
  // standard scheme a planet's moolatrikona always falls inside its own sign,
  // so these two states are never independent.
  const jupiter = assessPlanetStrength("Jupiter", at("Sagittarius", 1), {});
  assert.equal(jupiter.flags.isOwnSign, true);
  assert.equal(jupiter.flags.isMoolatrikona, true);
  assert.equal(jupiter.dignity, "own-sign");
  assert.equal(jupiter.score.multiplier, 4);
  assert.equal(jupiter.score.band, "strong");

  // Jupiter in a sign it does not rule is neutral, with multiplier 1.
  const jupiterPlain = assessPlanetStrength("Jupiter", at("Virgo", 1), {});
  assert.equal(jupiterPlain.flags.isOwnSign, false);
  assert.equal(jupiterPlain.dignity, "neutral");
  assert.equal(jupiterPlain.score.multiplier, 1);
  assert.equal(jupiterPlain.score.band, "neutral");
});

test("vargottama outranks and combines with other dignity states", () => {
  // The Moon in the vargottama band of Taurus: D1 Taurus, D9 Taurus, and Taurus
  // is the Moon's exaltation AND moolatrikona sign.
  const moon = assessPlanetStrength("Moon", at("Taurus", 4 * (30 / 9) + 1.5), {});
  assert.equal(moon.flags.isVargottama, true);
  assert.equal(moon.flags.isExalted, true);
  assert.equal(moon.flags.isMoolatrikona, true);
  assert.equal(moon.dignity, "vargottama");
  // 3 (exaltation) x 2 (moolatrikona) x 2 (vargottama) = 12
  assert.equal(moon.score.multiplier, 12);
  assert.equal(moon.score.band, "very-strong");

  // Not vargottama -> no vargottama multiplier.
  const plain = assessPlanetStrength("Moon", at("Taurus", 0), {});
  assert.equal(plain.flags.isVargottama, false);
  assert.equal(plain.score.applied.some((a) => a.state === "vargottama"), false);
});

test("combustion follows the numeric limit and is labelled as convention", () => {
  // Sun at Aries 0. Venus at Aries 3 is 3deg away: combust.
  const near = getCombustion("Venus", at("Aries", 3), at("Aries", 0));
  assert.equal(near.isCombust, true);
  assert.equal(near.limitUsed, COMBUSTION_LIMITS.default);
  assert.equal(near.limitSource, "convention");
  assert.equal(near.relationToSun, "same-sign");
  assert.equal(near.degreeOrder, "after-sun");
  assert.equal(near.distanceFromSun, 3);

  // Venus at Taurus 5 is 35deg from the Sun at Aries 0: not combust.
  const far = getCombustion("Venus", at("Taurus", 5), at("Aries", 0));
  assert.equal(far.isCombust, false);
  assert.equal(far.relationToSun, "adjacent-sign");

  // Exactly on the limit boundary.
  const onLimit = getCombustion("Venus", at("Aries", 13.99), at("Aries", 0));
  assert.equal(onLimit.isCombust, true);
  const justOver = getCombustion("Venus", at("Aries", 14.01), at("Aries", 0));
  assert.equal(justOver.isCombust, false);

  // The Moon gets a much wider allowance.
  assert.equal(getCombustion("Moon", at("Aries", 20), at("Aries", 0)).isCombust, true);
  assert.equal(getCombustion("Moon", at("Aries", 40), at("Aries", 0)).isCombust, false);
});

test("rule 4.8 relational combustion patterns are classified for Venus", () => {
  // Same sign, Venus BEFORE the Sun by degree. Degrees are kept within the
  // combustion limit so this genuinely is a combust Venus (rule 4.8's first case).
  const before = getCombustion("Venus", at("Aries", 3), at("Aries", 10));
  assert.equal(before.degreeOrder, "before-sun");
  assert.equal(before.relationToSun, "same-sign");
  assert.equal(before.isCombust, true);

  // Same sign, Venus AFTER the Sun, again within the limit (rule 4.8's second).
  const after = getCombustion("Venus", at("Aries", 22), at("Aries", 10));
  assert.equal(after.degreeOrder, "after-sun");
  assert.equal(after.isCombust, true);

  // Same sign but too far apart to be combust: the relational classification
  // still resolves, but the affliction does not apply.
  const sameSignNotCombust = getCombustion("Venus", at("Aries", 2), at("Aries", 28));
  assert.equal(sameSignNotCombust.relationToSun, "same-sign");
  assert.equal(sameSignNotCombust.isCombust, false);

  // Adjacent sign to the Sun's sign.
  const adjacent = getCombustion("Venus", at("Taurus", 3), at("Aries", 25));
  assert.equal(adjacent.relationToSun, "adjacent-sign");
  assert.equal(adjacent.degreeOrder, null, "degree order is only meaningful in the same sign");

  // The Sun is never combust by itself — it is the reference point.
  const sun = getCombustion("Sun", at("Aries", 3), at("Aries", 3));
  assert.equal(sun.isCombust, false);
  assert.match(sun.notes[0], /never combust/);
  // And it stays false even if a caller passes its own position as the Sun.
  assert.equal(getCombustion("Sun", at("Aries", 3), undefined).isCombust, false);
});

test("combustion is undetermined rather than false when the Sun is unknown", () => {
  const result = getCombustion("Venus", 100, undefined);
  assert.equal(result.isCombust, false);
  assert.equal(result.distanceFromSun, null);
  assert.match(result.notes[0], /undetermined/);
});

test("rule 6.4 strips malefic quality from a dignified malefic", () => {
  // A raw Mars in a random sign is a malefic for affliction purposes.
  const plainMars = { isExalted: false, isOwnSign: false, isMoolatrikona: false, isVargottama: false };
  assert.equal(isMaleficForAffliction("Mars", plainMars), true);
  assert.equal(isMaleficForAffliction("Saturn", plainMars), true);
  assert.equal(isMaleficForAffliction("Rahu", plainMars), true);
  // Benefics are never malefics here.
  assert.equal(isMaleficForAffliction("Venus", plainMars), false);
  assert.equal(isMaleficForAffliction("Jupiter", plainMars), false);

  // But any of the four dignity states removes the malefic quality.
  for (const state of ["isExalted", "isOwnSign", "isMoolatrikona", "isVargottama"]) {
    assert.equal(
      isMaleficForAffliction("Mars", { ...plainMars, [state]: true }),
      false,
      `${state} should strip Mars's malefic quality`,
    );
  }
});

test("the nodes get no dignity flags and no combustion", () => {
  // Rahu is exalted in Gemini per the chart's convention table, but the nodes
  // are not given dignity here, and Rahu's exaltation table entry must not leak.
  const rahu = assessPlanetStrength("Rahu", at("Gemini", 5), { sunLongitude: at("Gemini", 6) });
  assert.equal(rahu.flags.isExalted, false);
  assert.equal(rahu.flags.isDebilitated, false);
  assert.equal(rahu.flags.isOwnSign, false);
  assert.equal(rahu.dignity, "neutral");
  assert.equal(rahu.combustion.isCombust, false);
  assert.match(rahu.combustion.notes[0], /not applied to lunar nodes/);

  // Ketu is co-lord of two signs, so own-sign is suppressed rather than
  // arbitrarily picking one.
  const ketu = assessPlanetStrength("Ketu", at("Aquarius", 5), { sunLongitude: at("Aries", 0) });
  assert.equal(ketu.flags.isOwnSign, false);
});

test("isOwnSign is only true for the actual sign lord", () => {
  // Mercury rules both Gemini and Virgo, so it is genuinely in own sign in both.
  assert.equal(assessPlanetStrength("Mercury", at("Virgo", 5), {}).flags.isOwnSign, true);
  assert.equal(assessPlanetStrength("Mercury", at("Gemini", 5), {}).flags.isOwnSign, true);
  // Jupiter rules Sagittarius and Pisces.
  assert.equal(assessPlanetStrength("Jupiter", at("Pisces", 5), {}).flags.isOwnSign, true);
  // Saturn rules Capricorn and Aquarius.
  assert.equal(assessPlanetStrength("Saturn", at("Aquarius", 5), {}).flags.isOwnSign, true);
  // Venus rules Taurus and Libra.
  assert.equal(assessPlanetStrength("Venus", at("Libra", 5), {}).flags.isOwnSign, true);
  // Mars rules Aries and Scorpio.
  assert.equal(assessPlanetStrength("Mars", at("Scorpio", 5), {}).flags.isOwnSign, true);
  // And nobody is in own sign in a sign they do not rule.
  assert.equal(assessPlanetStrength("Mars", at("Taurus", 5), {}).flags.isOwnSign, false);
  // Consistency with the lord table itself, for every planet/sign pair.
  for (const [sign, lord] of Object.entries(RASHI_LORDS)) {
    const inOwn = assessPlanetStrength(lord, at(sign, 5), {});
    assert.equal(inOwn.flags.isOwnSign, true, `${lord} should be own-sign in ${sign}`);
  }
});

test("moolatrikona falls inside the planet's own signs, with the Moon the exception", () => {
  // Structural invariant of the scheme: a graha's moolatrikona sign is one it
  // rules, so isMoolatrikona implies isOwnSign and scores at least 2 x 2 = 4.
  //
  // The Moon is the deliberate exception — its moolatrikona is Taurus, which
  // Venus rules, while the Moon's own sign is Cancer. This test pins that
  // exception down so a future "fix" cannot silently overwrite it.
  for (const planet of ["Sun", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]) {
    for (const sign of RASHIS) {
      const block = assessPlanetStrength(planet, at(sign, 5), {});
      if (block.flags.isMoolatrikona) {
        assert.equal(
          block.flags.isOwnSign,
          true,
          `${planet} moolatrikona in ${sign} should also be own sign`,
        );
        assert.ok(block.score.multiplier >= 4, `${planet} moolatrikona should score at least 4`);
      }
    }
  }

  // The Moon in Taurus: moolatrikona, and ALSO exalted (the Moon's exaltation
  // sign is Taurus), but NOT in its own sign (Taurus is ruled by Venus).
  // So 3 (exalted) x 2 (moolatrikona) = 6, not the 2 a naive reading gives.
  const moonTaurus = assessPlanetStrength("Moon", at("Taurus", 5), {});
  assert.equal(moonTaurus.flags.isMoolatrikona, true);
  assert.equal(moonTaurus.flags.isExalted, true);
  assert.equal(moonTaurus.flags.isOwnSign, false, "Taurus is ruled by Venus, not the Moon");
  assert.equal(moonTaurus.score.multiplier, 6);
  assert.equal(moonTaurus.dignity, "exalted");

  // The Moon in Cancer is its own sign, and at degree 0 it is additionally
  // vargottama because Cancer is a movable sign that starts its own D9 band.
  const moonCancerOwn = assessPlanetStrength("Moon", at("Cancer", 5), {});
  assert.equal(moonCancerOwn.flags.isOwnSign, true);
  assert.equal(moonCancerOwn.flags.isMoolatrikona, false);
  assert.equal(moonCancerOwn.flags.isVargottama, false, "degree 5 is past the vargottama band");
  assert.equal(moonCancerOwn.score.multiplier, 2);

  const moonCancerVargottama = assessPlanetStrength("Moon", at("Cancer", 1), {});
  assert.equal(moonCancerVargottama.flags.isVargottama, true, "Cancer 0-3deg20' is vargottama");
  assert.equal(moonCancerVargottama.score.multiplier, 4, "own sign 2 x vargottama 2");
});

test("retrograde status comes from real ephemeris motion", () => {
  const date = new Date("1990-01-15T06:00:00Z");
  const { sidereal } = getPlanetSiderealLongitudes(date);
  const retrograde = getRetrogradeStatus(date);

  for (const [name, lon] of Object.entries(sidereal)) {
    assert.equal(typeof retrograde[name], "boolean", `${name} must report a boolean`);
    assert.ok(Number.isFinite(lon));
  }

  // Mercury is retrograde roughly 19% of the time, Venus 7%, the Sun never
  // (Earth's own orbit is prograde). A whole-year sweep must show all three
  // behaviours, which is only possible if the arithmetic is really measuring
  // planetary motion.
  const counts = { Mercury: 0, Venus: 0, Sun: 0 };
  for (let day = 0; day < 365; day += 1) {
    const d = new Date(date.getTime() + day * 24 * 60 * 60 * 1000);
    const r = getRetrogradeStatus(d);
    for (const name of Object.keys(counts)) if (r[name]) counts[name] += 1;
  }
  assert.ok(counts.Mercury > 40 && counts.Mercury < 110, `Mercury retrograde ${counts.Mercury} days`);
  assert.ok(counts.Venus > 10 && counts.Venus < 60, `Venus retrograde ${counts.Venus} days`);
  assert.equal(counts.Sun, 0, "the Sun is never retrograde as seen from Earth");
});

test("no chart ever reports a combust Sun", () => {
  // Regression: the Sun's distance from itself is 0, which is inside every
  // combustion limit. Comparing a planet against itself made every chart
  // report a combust Sun until this was guarded.
  for (let day = 0; day < 365; day += 11) {
    const date = new Date(Date.UTC(2020, 0, 1 + day));
    const { sidereal } = getPlanetSiderealLongitudes(date);
    const strength = assessChartStrength({ planetLongitudes: sidereal });
    assert.equal(strength.Sun.combustion.isCombust, false, `combust Sun on day ${day}`);
    assert.equal(strength.Sun.combustion.limitUsed, null);
  }
});

test("assessChartStrength covers every planet and degrades safely", () => {
  const date = new Date("1990-01-15T06:00:00Z");
  const { sidereal } = getPlanetSiderealLongitudes(date);
  const strength = assessChartStrength({ planetLongitudes: sidereal, retrograde: getRetrogradeStatus(date) });

  assert.deepEqual(Object.keys(strength).sort(), Object.keys(sidereal).sort());
  for (const [name, block] of Object.entries(strength)) {
    assert.equal(block.planet, name);
    assert.ok(RASHIS.includes(block.rashi), `${name} rashi`);
    assert.ok(block.score.multiplier > 0);
    assert.ok(["very-strong", "strong", "moderate", "neutral", "weak"].includes(block.score.band));
    // Supplementary field, per rule 6.5.
    assert.ok(RASHIS.includes(block.navamshaRashi), `${name} navamsha`);
  }

  // Malformed input must not throw.
  assert.equal(assessChartStrength(), null);
  assert.equal(assessChartStrength({}), null);
  assert.equal(assessChartStrength({ planetLongitudes: null }), null);
  assert.equal(assessPlanetStrength("Sun", Number.NaN), null);
  assert.equal(assessPlanetStrength("Sun", undefined), null);
});
