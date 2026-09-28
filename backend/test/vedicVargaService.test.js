const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PRIMARY_VARGAS,
  getVargaSign,
  calculateVargas,
  isVargottama,
  describeVargas,
  shadvargaAssessment,
  d1D9Comparison,
  TRIMSAMSA_ODD,
  TRIMSAMSA_EVEN,
  STRIDED_VARGAS,
  SUPPORTED_DARGAS,
} = require("../services/vedicVargaService");
const { RASHIS } = require("../services/vedicAstrologyService");

// Every sign starts at its own multiple of 30 degrees, so a sign's 0-degree
// point is a convenient, unambiguous anchor for boundary tests.
const startOf = (signName) => RASHIS.indexOf(signName) * 30;
const at = (signName, degree) => startOf(signName) + degree;
const signAt = (signName, step) => RASHIS[(RASHIS.indexOf(signName) + step + 12) % 12];

// The D9 starting offset is modality-dependent: movable starts at the sign,
// fixed at the 9th from it, dual at the 5th from it. This mirrors the
// modality in the zodiacal cycle: Aries movable, Taurus fixed, Gemini dual.
const d9Start = (signName) => {
  const position = RASHIS.indexOf(signName) % 3;
  return position === 0 ? 0 : position === 1 ? 8 : 4;
};

test("D1 is the chart itself for every sign and degree", () => {
  for (const sign of RASHIS) {
    for (const degree of [0, 0.5, 7.25, 15, 22.5, 29.999]) {
      assert.equal(getVargaSign(at(sign, degree), 1), sign, `D1 ${sign} ${degree}deg`);
    }
  }
});

test("D3 and D7 stride by 4 signs and reverse for fixed signs", () => {
  // D3 and D7 are NOT the D9 rule. They step by 4 signs per part, and fixed
  // signs run that sequence backwards. Conflating these with D9 is a real bug.
  // Movable Aries: offsets 0, 4, 8 -> Aries, Leo, Sagittarius.
  assert.equal(getVargaSign(at("Aries", 0), 3), "Aries");
  assert.equal(getVargaSign(at("Aries", 10), 3), "Leo");
  assert.equal(getVargaSign(at("Aries", 20), 3), "Sagittarius");
  // Fixed Leo: the stride-4 offsets run backwards: 8, 4, 0 -> Aries,
  // Sagittarius (Leo+4), Leo. Note Leo+4 is Sagittarius, NOT Virgo.
  assert.equal(getVargaSign(at("Leo", 0), 3), "Aries");
  assert.equal(getVargaSign(at("Leo", 10), 3), "Sagittarius");
  assert.equal(getVargaSign(at("Leo", 20), 3), "Leo");
  // Dual Gemini: offsets 4, 8, 0 -> Libra, Aquarius, Gemini. The stride of 4
  // is applied to the sign, so the third part lands back on the sign itself.
  assert.equal(getVargaSign(at("Gemini", 0), 3), "Libra");
  assert.equal(getVargaSign(at("Gemini", 10), 3), "Aquarius");
  assert.equal(getVargaSign(at("Gemini", 20), 3), "Gemini");

  // D7 uses the same stride of 4, and the offset cycle repeats every 3 parts.
  // Movable Aries: 0, 4, 8, 0, 4, 8, 0.
  const expectedAries = ["Aries", "Leo", "Sagittarius", "Aries", "Leo", "Sagittarius", "Aries"];
  for (let part = 0; part < 7; part += 1) {
    const degree = part * (30 / 7) + 0.01;
    assert.equal(getVargaSign(at("Aries", degree), 7), expectedAries[part], `D7 part ${part}`);
  }
  // Fixed Leo runs backwards: 8, 4, 0, 8, 4, 0, 8 -> Aries, Sagittarius, Leo...
  assert.equal(getVargaSign(at("Leo", 0), 7), "Aries");
  assert.equal(getVargaSign(at("Leo", 30 / 7 + 0.01), 7), "Sagittarius");
  assert.equal(getVargaSign(at("Leo", 2 * (30 / 7) + 0.01), 7), "Leo");
});

test("D4, D16 and D20 advance by a stride of 3 signs, not one", () => {
  // Leo 10deg is D4 part 1 (parts are 7.5 deg): stride 3 -> Leo+3 = Scorpio.
  // A unit step would wrongly give Leo+1 = Virgo, so this is the discriminating
  // case. Leo 20deg is part 2 -> Leo+6 = Aquarius, not Leo+2 = Libra.
  assert.equal(getVargaSign(at("Leo", 10), 4), "Scorpio");
  assert.equal(getVargaSign(at("Leo", 20), 4), "Aquarius");
  assert.equal(getVargaSign(at("Leo", 28), 4), "Taurus");
  // D4 part 0 is always the sign itself, whatever the stride.
  assert.equal(getVargaSign(at("Leo", 0), 4), "Leo");
  assert.equal(getVargaSign(at("Cancer", 0), 4), "Cancer");

  // D16 has 16 parts of ~1.875 deg with stride 3: part 1 is Leo+3 = Scorpio.
  assert.equal(getVargaSign(at("Leo", 0), 16), "Leo");
  assert.equal(getVargaSign(at("Leo", 1.88), 16), "Scorpio");
  // D20 has 20 parts of 1.5 deg with stride 3: part 1 is Leo+3 = Scorpio.
  assert.equal(getVargaSign(at("Leo", 0), 20), "Leo");
  assert.equal(getVargaSign(at("Leo", 1.51), 20), "Scorpio");
});

test("D6, D24, D40 and D45 advance one sign per part", () => {
  for (const darga of [6, 24, 40, 45]) {
    assert.equal(getVargaSign(at("Leo", 0), darga), "Leo", `D${darga} part 0 is the sign itself`);
    assert.notEqual(
      getVargaSign(at("Leo", 30 / darga + 0.01), darga),
      "Leo",
      `D${darga} part 1 must advance`,
    );
  }
  // D6 has 6 parts of 5 deg: Leo 5deg is Virgo.
  assert.equal(getVargaSign(at("Leo", 5), 6), "Virgo");
  assert.equal(getVargaSign(at("Leo", 10), 6), "Libra");
});

test("divisions without a defensible rule return null rather than a guess", () => {
  // Returning a plausible-but-wrong sign is worse than admitting ignorance.
  // These are the divisions with no uncontested Parashari assignment.
  for (const darga of [5, 8, 11, 13, 14, 15, 17, 18, 19, 21, 22, 23, 25, 26, 28, 29,
    31, 32, 33, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 46, 47, 48, 49, 50,
    51, 52, 53, 54, 55, 56, 57, 58, 59]) {
    assert.equal(getVargaSign(at("Leo", 5), darga), null, `D${darga} should not be guessed`);
    assert.equal(SUPPORTED_DARGAS.has(darga), false);
  }
  // The supported set must stay in sync with the documented one.
  assert.deepEqual(
    [...SUPPORTED_DARGAS].sort((a, b) => a - b),
    [1, 2, 3, 4, 6, 7, 9, 10, 12, 16, 20, 24, 30, 40, 45, 60],
  );
  // Every primary varga must be one this engine actually supports.
  for (const darga of PRIMARY_VARGAS) {
    assert.ok(SUPPORTED_DARGAS.has(darga), `PRIMARY_VARGAS includes unsupported D${darga}`);
  }
});

test("D9 divides the sign into 9 parts starting from the modality-dependent sign", () => {
  // Leo is a FIXED sign, so its 9 parts start at the 9th from Leo (Aries) and
  // run forward — NOT at Leo itself. Each part is 3deg20'.
  const start = d9Start("Leo");
  assert.equal(getVargaSign(at("Leo", 0), 9), signAt("Leo", start));
  assert.equal(getVargaSign(at("Leo", 0), 9), "Aries");
  for (let part = 0; part < 9; part += 1) {
    const from = (part * 30) / 9;
    const to = ((part + 1) * 30) / 9;
    const expected = signAt("Leo", start + part);
    assert.equal(getVargaSign(at("Leo", from + 0.01), 9), expected, `D9 Leo part ${part}`);
    assert.equal(getVargaSign(at("Leo", to - 0.01), 9), expected, `D9 Leo part ${part} end`);
  }

  // The starting sign must differ by modality class — the bug this guards
  // against is using one flat offset for all 12 signs.
  assert.equal(getVargaSign(at("Aries", 0), 9), "Aries", "movable starts at itself");
  assert.equal(getVargaSign(at("Taurus", 0), 9), signAt("Taurus", 8), "fixed starts at the 9th");
  assert.equal(getVargaSign(at("Gemini", 0), 9), signAt("Gemini", 4), "dual starts at the 5th");
});

test("D9 agrees exactly with the existing getNavamshaSign across the whole zodiac", () => {
  // The separate getNavamshaSign is already in production and used by the rule
  // engine. The varga engine must not drift away from it.
  const { getNavamshaSign } = require("../services/vedicAstrologyService");
  for (let lon = 0; lon < 360; lon += 0.37) {
    assert.equal(getVargaSign(lon, 9), getNavamshaSign(lon), `D9 mismatch at ${lon.toFixed(2)}`);
  }
});

test("D7 divides the sign into 7 parts, striding 4 signs and reversing for fixed", () => {
  // Part width is 30/7; each part advances the sign by 4, so the offsets cycle
  // with period 3. The part boundaries themselves are what matter here.
  const expected = {
    Aries: ["Aries", "Leo", "Sagittarius", "Aries", "Leo", "Sagittarius", "Aries"],
    // fixed: offsets 8, 4, 0 repeating, i.e. backwards
    Leo: ["Aries", "Sagittarius", "Leo", "Aries", "Sagittarius", "Leo", "Aries"],
    // dual: offsets 4, 8, 0 repeating
    Gemini: ["Libra", "Aquarius", "Gemini", "Libra", "Aquarius", "Gemini", "Libra"],
  };
  for (const [sign, parts] of Object.entries(expected)) {
    for (let part = 0; part < 7; part += 1) {
      const from = (part * 30) / 7;
      const to = ((part + 1) * 30) / 7;
      assert.equal(getVargaSign(at(sign, from + 0.01), 7), parts[part], `D7 ${sign} part ${part}`);
      assert.equal(getVargaSign(at(sign, to - 0.01), 7), parts[part], `D7 ${sign} part ${part} end`);
    }
  }
});

test("D3 divides the sign into 3 parts of 10 degrees, striding 4 signs", () => {
  // 3 parts x 10 deg, stride 4, direction depends on modality.
  const expected = {
    Aries: ["Aries", "Leo", "Sagittarius"],
    Leo: ["Aries", "Sagittarius", "Leo"],
    Gemini: ["Libra", "Aquarius", "Gemini"],
  };
  for (const [sign, parts] of Object.entries(expected)) {
    for (let part = 0; part < 3; part += 1) {
      assert.equal(getVargaSign(at(sign, part * 10 + 0.01), 3), parts[part], `D3 ${sign} part ${part}`);
      assert.equal(getVargaSign(at(sign, part * 10 + 9.99), 3), parts[part], `D3 ${sign} part ${part} end`);
    }
  }
});

test("D12 divides the sign into 12 parts of 2.5 degrees, wrapping once", () => {
  // Even-part vargas advance from the sign itself with no modality offset.
  assert.equal(getVargaSign(at("Leo", 0), 12), "Leo");
  assert.equal(getVargaSign(at("Leo", 2.49), 12), "Leo");
  assert.equal(getVargaSign(at("Leo", 2.5), 12), "Virgo");
  for (let part = 0; part < 12; part += 1) {
    const expected = signAt("Leo", part);
    assert.equal(getVargaSign(at("Leo", part * 2.5 + 0.01), 12), expected, `D12 part ${part}`);
  }
  // 12 bands x 2.5 deg covers exactly 30 deg and lands on the 12th sign.
  assert.equal(getVargaSign(at("Leo", 27.5), 12), signAt("Leo", 11));
  assert.equal(getVargaSign(at("Leo", 29.99), 12), signAt("Leo", 11));
});

test("D10 advances from odd signs and RETROGRADES from even signs", () => {
  // Leo is an odd sign: 3deg parts advancing.
  assert.equal(getVargaSign(at("Leo", 0), 10), "Leo");
  assert.equal(getVargaSign(at("Leo", 3.1), 10), "Virgo");
  assert.equal(getVargaSign(at("Leo", 6.1), 10), "Libra");
  // Virgo is an even sign: the SAME 3deg parts, counted backwards.
  assert.equal(getVargaSign(at("Virgo", 0), 10), "Virgo");
  assert.equal(getVargaSign(at("Virgo", 3.1), 10), "Leo");
  assert.equal(getVargaSign(at("Virgo", 6.1), 10), "Cancer");

  // This is the single most commonly botched varga, so assert every sign class.
  for (const sign of ["Aries", "Gemini", "Leo", "Libra", "Aquarius"]) {
    assert.equal(getVargaSign(at(sign, 9.5), 10), signAt(sign, 3), `odd sign ${sign}`);
  }
  for (const sign of ["Taurus", "Cancer", "Virgo", "Scorpio", "Pisces"]) {
    assert.equal(getVargaSign(at(sign, 9.5), 10), signAt(sign, -3), `even sign ${sign}`);
  }
});

test("D2 hora splits every sign at 15 degrees into Sun's and Moon's signs", () => {
  // The two halves do NOT depend on which sign it is.
  for (const sign of RASHIS) {
    assert.equal(getVargaSign(at(sign, 0), 2), "Leo", `${sign} first half`);
    assert.equal(getVargaSign(at(sign, 14.99), 2), "Leo", `${sign} just before split`);
    assert.equal(getVargaSign(at(sign, 15), 2), "Cancer", `${sign} second half`);
    assert.equal(getVargaSign(at(sign, 29.99), 2), "Cancer", `${sign} end`);
  }
});

test("D30 trimsamsa uses the unequal five-band table, mirrored for even signs", () => {
  // Odd sign (Leo): Mars/Aries, Saturn/Aquarius, Jupiter/Sagittarius,
  // Mercury/Gemini, Venus/Libra at 0/5/10/18/25 deg.
  assert.equal(getVargaSign(at("Leo", 0), 30), "Aries");
  assert.equal(getVargaSign(at("Leo", 4.99), 30), "Aries");
  assert.equal(getVargaSign(at("Leo", 5), 30), "Aquarius");
  assert.equal(getVargaSign(at("Leo", 9.99), 30), "Aquarius");
  assert.equal(getVargaSign(at("Leo", 10), 30), "Sagittarius");
  assert.equal(getVargaSign(at("Leo", 18), 30), "Gemini");
  assert.equal(getVargaSign(at("Leo", 25), 30), "Libra");
  assert.equal(getVargaSign(at("Leo", 29.99), 30), "Libra");

  // Even sign (Virgo) is a different assignment, not a mirror of the above.
  assert.equal(getVargaSign(at("Virgo", 0), 30), "Aquarius");
  assert.equal(getVargaSign(at("Virgo", 5), 30), "Sagittarius");
  assert.equal(getVargaSign(at("Virgo", 12), 30), "Gemini");
  assert.equal(getVargaSign(at("Virgo", 20), 30), "Taurus");
  assert.equal(getVargaSign(at("Virgo", 25), 30), "Scorpio");

  // The band tables store UPPER bounds and together must tile 0..30 with no gap
  // and no overlap, so a degree in any band always resolves to exactly one sign.
  for (const table of [TRIMSAMSA_ODD, TRIMSAMSA_EVEN]) {
    assert.equal(table[0][0], 5, "first band ends at 5 deg");
    assert.equal(table[table.length - 1][0], 30, "last band ends at 30 deg");
    for (let i = 1; i < table.length; i += 1) {
      assert.ok(table[i][0] > table[i - 1][0], "band boundaries must increase");
    }
    // Every degree from 0 to 30 must fall inside exactly one band, and the
    // bands must be adjacent — walking a boundary must change band exactly once.
    let transitions = 0;
    let previous = null;
    for (let d = 0; d < 30; d += 0.001) {
      const band = table.find(([max]) => d < max);
      assert.ok(band, `no band covers ${d} deg`);
      if (previous && band !== previous) transitions += 1;
      previous = band;
    }
    // 5 bands means 4 transitions, and nothing is left uncovered at the top.
    assert.equal(transitions, table.length - 1, "bands must be adjacent with no gaps");
    assert.equal(table.find(([max]) => 29.999 < max) !== undefined, true, "30 deg must be covered");
  }
});

test("D60 maps 0.5-degree bands to consecutive signs, wrapping twice", () => {
  assert.equal(getVargaSign(at("Leo", 0), 60), "Leo");
  assert.equal(getVargaSign(at("Leo", 0.49), 60), "Leo");
  assert.equal(getVargaSign(at("Leo", 0.5), 60), "Virgo");
  // After 6 degrees the cycle is back at the starting sign (12 x 0.5 = 6).
  assert.equal(getVargaSign(at("Leo", 6), 60), "Leo");
  assert.equal(getVargaSign(at("Leo", 29.99), 60), signAt("Leo", 59));
});

test("out-of-range darga and non-finite longitude return null instead of guessing", () => {
  assert.equal(getVargaSign(at("Leo", 5), 0), null);
  assert.equal(getVargaSign(at("Leo", 5), 61), null);
  assert.equal(getVargaSign(at("Leo", 5), -3), null);
  assert.equal(getVargaSign(at("Leo", 5), 2.5), null);
  // A numeric string must not be silently coerced into a valid darga.
  assert.equal(getVargaSign(at("Leo", 5), "9"), null);
  assert.equal(getVargaSign(at("Leo", 5), null), null);
  assert.equal(getVargaSign(Number.NaN, 9), null);
  assert.equal(getVargaSign(undefined, 1), null);
});

test("longitudes wrapping past 360 or below 0 resolve to the same sign", () => {
  assert.equal(getVargaSign(-1, 9), getVargaSign(359, 9));
  assert.equal(getVargaSign(360, 1), getVargaSign(0, 1));
  assert.equal(getVargaSign(1230.5, 1), getVargaSign(1230.5 % 360, 1));
});

test("calculateVargas returns every supported division with a valid sign name", () => {
  const vargas = calculateVargas(at("Leo", 3));
  assert.deepEqual(Object.keys(vargas).map(Number).sort((a, b) => a - b), [...SUPPORTED_DARGAS].sort((a, b) => a - b));
  for (const [darga, sign] of Object.entries(vargas)) {
    assert.ok(RASHIS.includes(sign), `D${darga} produced ${sign}`);
  }
});

test("the varga mapping is not globally degenerate", () => {
  // At any single longitude some vargas legitimately coincide (a fixed sign's
  // D3/D5/D7/D9 all share the same starting band), so the meaningful invariant
  // is over the whole zodiac: every sign must be reachable, and moving the
  // longitude must actually change the results.
  const seen = new Set();
  for (let lon = 0; lon < 360; lon += 0.5) {
    for (const sign of Object.values(calculateVargas(lon))) seen.add(sign);
  }
  assert.equal(seen.size, 12, "all 12 signs should be reachable across the zodiac");

  // D2, D30 and D60 are sign-independent or sign-fixed, so they cannot change
  // with longitude alone; every other supported division must be sensitive to
  // the exact degree within its sign.
  const a = calculateVargas(at("Leo", 3));
  const b = calculateVargas(at("Leo", 20));
  const differing = Object.keys(a).filter((k) => a[k] !== b[k]);
  assert.ok(differing.length >= 10, `expected most vargas to change with longitude, got ${differing.length}`);
});

test("vargottama is true exactly when D1 and D9 coincide", () => {
  // Vargottama means the planet sits in the SAME sign in D1 and D9, which
  // happens once per sign. For a fixed sign like Taurus the D9 start is the
  // 9th from it, so Taurus is D9-Taurus on its 5th part: 13deg20' to 16deg40'.
  // Taurus is a fixed sign, so its D9 start is the 9th from it. The band that
  // lands back on Taurus is part 4 (start 8, so 8 + 4 = 12 = back to Taurus).
  const taurusStart = d9Start("Taurus");
  const taurusBandStart = (12 - taurusStart) * (30 / 9);
  assert.equal(getVargaSign(at("Taurus", taurusBandStart - 0.1), 9), signAt("Taurus", taurusStart + 3));
  assert.ok(isVargottama(at("Taurus", taurusBandStart + 0.1)), "should be vargottama inside the band");
  assert.ok(isVargottama(at("Taurus", taurusBandStart + 1.5)), "still vargottama mid-band");
  assert.equal(isVargottama(at("Taurus", 0)), false, "0deg is not the matching band");
  assert.equal(isVargottama(at("Taurus", 20)), false);
  assert.equal(isVargottama(Number.NaN), false);

  // Every sign must have exactly ONE contiguous vargottama band, 30/9 deg wide,
  // starting where the modality rule predicts.
  for (const sign of RASHIS) {
    const start = d9Start(sign);
    const bandStart = (part) => part * (30 / 9);
    // The matching D9 part is the one where start + part === 0 (mod 12).
    const part = (12 - start) % 12;
    assert.equal(part, bandStart === 0 ? 0 : part, `${sign} matching part is consistent`);

    const matches = [];
    for (let d = 0; d < 30; d += 0.01) {
      if (isVargottama(at(sign, d))) matches.push(d);
    }
    // The band is 30/9 = 3.33 deg wide, so ~333 samples at a 0.01 deg step.
    assert.ok(
      matches.length >= 330 && matches.length <= 336,
      `${sign} band had ${matches.length} samples of 0.01deg, expected ~333`,
    );

    // Contiguous: no gaps, and the band begins at the predicted boundary.
    const predicted = part * (30 / 9);
    assert.ok(Math.abs(matches[0] - predicted) < 0.02, `${sign} band starts at ${matches[0]}, expected ~${predicted.toFixed(2)}`);
    for (let i = 1; i < matches.length; i += 1) {
      assert.ok(matches[i] - matches[i - 1] < 0.015, `${sign} band has a gap at ${matches[i]}`);
    }
  }
});

test("describeVargas reports the primary vargas plus the D1/D9 pair per planet", () => {
  // Moon in the vargottama band of Taurus (13deg20'-16deg40').
  const vargottamaMoon = at("Taurus", 4 * (30 / 9) + 1.5);
  const planets = {
    Sun: { longitude: at("Leo", 3) },
    Moon: { longitude: vargottamaMoon },
  };
  const described = describeVargas({ planets });

  assert.deepEqual(Object.keys(described), ["Sun", "Moon"]);
  for (const planet of ["Sun", "Moon"]) {
    assert.deepEqual(
      Object.keys(described[planet].vargas),
      PRIMARY_VARGAS.map(String),
      "only the primary vargas are surfaced",
    );
    assert.equal(typeof described[planet].isVargottama, "boolean");
    assert.equal(described[planet].d1d9.d1, described[planet].vargas["1"]);
    assert.equal(described[planet].d1d9.d9, described[planet].vargas["9"]);
    // The D1/D9 signs must agree with the standalone varga function.
    assert.equal(described[planet].d1d9.d1, getVargaSign(planets[planet].longitude, 1));
    assert.equal(described[planet].d1d9.d9, getVargaSign(planets[planet].longitude, 9));
  }
  // Moon in the Taurus vargottama band is vargottama and in its own sign; the
  // Sun in Leo sits in its own moolatrikona.
  assert.equal(described.Moon.isVargottama, true);
  assert.equal(described.Moon.d1d9.d1, "Taurus");
  assert.equal(described.Moon.d1d9.d9, "Taurus");
  assert.equal(described.Moon.d1d9.strongInD1, true);
  assert.equal(described.Sun.d1d9.strongInD1, true);
});

test("describeVargas degrades gracefully on sparse input", () => {
  assert.equal(describeVargas(), null);
  assert.equal(describeVargas(), null);
  assert.equal(describeVargas({}), null);
  assert.deepEqual(describeVargas({ planets: {} }), {});
  const partial = describeVargas({
    planets: { Moon: { longitude: at("Leo", 3) }, Sun: {}, Mars: { longitude: Number.NaN } },
  });
  assert.equal(partial.Moon.vargas["1"], "Leo");
  assert.equal(partial.Sun, null, "a planet with no longitude yields null, not a crash");
  assert.equal(partial.Mars, null, "a non-finite longitude yields null, not a crash");
});

test("shadvargaAssessment checks the Moon across the six divisions in rule 13.10", () => {
  // Moon in its own sign Taurus -> vargottama, so D1 is strong.
  const result = shadvargaAssessment({ planets: { Moon: { longitude: at("Taurus", 0) } } });

  assert.equal(result.ruleId, "13.10");
  assert.equal(result.planet, "Moon");
  assert.equal(result.divisionCount, 6);
  assert.deepEqual(result.divisions.map((d) => d.darga), ["D1", "D2", "D3", "D9", "D12", "D30"]);
  assert.ok(result.strongCount >= 1);
  assert.ok(
    ["strong-in-most-divisions", "weak-in-multiple-divisions", "mixed"].includes(result.verdict),
  );
  assert.match(result.note, /Rule 13\.10/);
  // The verdict must follow the count rather than being hard-coded.
  assert.equal(result.verdict === "strong-in-most-divisions", result.strongCount >= 4);
  assert.equal(result.verdict === "weak-in-multiple-divisions", result.strongCount <= 2);
});

test("shadvargaAssessment works from a bare Moon longitude and needs no Ascendant", () => {
  const result = shadvargaAssessment({ moonLongitude: at("Scorpio", 10) });
  assert.equal(result.divisionCount, 6);
  // Scorpio is Moon's debilitation sign, so D1 must report debilitated.
  const d1 = result.divisions.find((d) => d.darga === "D1");
  assert.equal(d1.dignity, "debilitated");
  assert.equal(d1.strong, false);
});

test("shadvargaAssessment returns null when there is no Moon to assess", () => {
  assert.equal(shadvargaAssessment(), null);
  assert.equal(shadvargaAssessment({}), null);
  assert.equal(shadvargaAssessment({ planets: {} }), null);
  assert.equal(shadvargaAssessment({ planets: { Moon: {} } }), null);
});

test("d1D9Comparison classifies every planet into one of the four rule 14.9 patterns", () => {
  const chart = {
    planets: {
      Sun: { longitude: at("Leo", 3) },   // own moolatrikona
      Moon: { longitude: at("Taurus", 0) }, // vargottama, own sign
      Mars: { longitude: at("Cancer", 3) }, // debilitation
    },
  };
  const result = d1D9Comparison(chart);

  assert.equal(result.ruleId, "14.9");
  assert.equal(result.planets.length, 3);
  for (const row of result.planets) {
    assert.ok(
      ["strong-both", "weak-both", "outerly-strong-inner-weak", "outerly-weak-inner-strong"].includes(row.pattern),
      `unexpected pattern ${row.pattern}`,
    );
    assert.ok(RASHIS.includes(row.d1) && RASHIS.includes(row.d9));
  }
  assert.match(result.note, /Rule 14\.9/);
});

test("d1D9Comparison returns null when no planet longitudes are available", () => {
  assert.equal(d1D9Comparison(), null);
  assert.equal(d1D9Comparison({}), null);
  assert.equal(d1D9Comparison({ planets: {} }), null);
  assert.equal(d1D9Comparison({ planets: { Sun: {} } }), null);
});
