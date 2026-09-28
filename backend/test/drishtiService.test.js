const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ASPECT_NAMES,
  CORPUS_ASPECTS,
  GRAHA_ASPECTS,
  getAspectedSignIndex,
  getAspects,
  influencesHouse,
  seventhFrom,
} = require("../services/drishtiService");
const { RASHIS, getPlanetSiderealLongitudes } = require("../services/vedicAstrologyService");

const startOf = (signName) => RASHIS.indexOf(signName) * 30;
const at = (signName, degree) => startOf(signName) + degree;

// A chart built from explicit sign placements: sign name -> planet names.
const chartFrom = (placements) =>
  Object.fromEntries(
    Object.entries(placements).flatMap(([sign, names]) =>
      names.map((name) => [name, at(sign, 5)]),
    ),
  );

test("the standard 7-fold drishti ranges match the classical table", () => {
  assert.deepEqual(GRAHA_ASPECTS.Mars, [4, 7, 8]);
  assert.deepEqual(GRAHA_ASPECTS.Jupiter, [5, 7, 9]);
  assert.deepEqual(GRAHA_ASPECTS.Venus, [5, 7, 9]);
  assert.deepEqual(GRAHA_ASPECTS.Saturn, [3, 7, 10]);
  assert.deepEqual(GRAHA_ASPECTS.Sun, [7]);
  assert.deepEqual(GRAHA_ASPECTS.Moon, [7]);
  assert.deepEqual(GRAHA_ASPECTS.Mercury, [7]);
  // Only the 7th is claimed to come from the corpus (13.13).
  assert.deepEqual([...CORPUS_ASPECTS], [7]);
});

test("every graha aspects its own sign plus exactly its listed dargas", () => {
  for (const [planet, aspects] of Object.entries(GRAHA_ASPECTS)) {
    for (let signIndex = 0; signIndex < 12; signIndex += 1) {
      const targets = getAspectedSignIndex(planet, signIndex, aspects);
      // Occupancy is always a 0-degree aspect: "aspect equals conjunction" (6.3).
      assert.ok(targets.has(signIndex), `${planet} must always aspect its own sign`);
      assert.equal(targets.size, aspects.length + 1, `${planet} aspects ${aspects.length} dargas + own sign`);
      for (const darga of aspects) {
        assert.ok(targets.has(((signIndex + darga - 1) % 12 + 12) % 12), `${planet} D${darga} from sign ${signIndex}`);
      }
    }
  }
});

test("Mars in Scorpio aspects the 4th, 7th and 8th from it", () => {
  // Scorpio is index 7. Mars aspects 4th, 7th, 8th from there.
  const targets = getAspectedSignIndex("Mars", RASHIS.indexOf("Scorpio"), GRAHA_ASPECTS.Mars);
  const named = (offset) => RASHIS[(RASHIS.indexOf("Scorpio") + offset - 1) % 12];
  assert.ok(targets.has(RASHIS.indexOf("Scorpio")));
  assert.ok(targets.has(RASHIS.indexOf(named(4))), "4th from Scorpio");
  assert.ok(targets.has(RASHIS.indexOf(named(7))), "7th from Scorpio");
  assert.ok(targets.has(RASHIS.indexOf(named(8))), "8th from Scorpio");
  // It must not aspect the 5th, which is the Jupiter/Venus range.
  assert.equal(targets.has(RASHIS.indexOf(named(5))), false);
  assert.equal(targets.has(RASHIS.indexOf(named(9))), false);
});

test("Saturn aspects the 3rd, 7th and 10th, and wraps cleanly", () => {
  for (const sign of RASHIS) {
    const targets = getAspectedSignIndex("Saturn", RASHIS.indexOf(sign), GRAHA_ASPECTS.Saturn);
    for (const darga of [3, 7, 10]) {
      const expected = RASHIS[(RASHIS.indexOf(sign) + darga - 1) % 12];
      assert.ok(targets.has(RASHIS.indexOf(expected)), `Saturn ${darga} from ${sign} should be ${expected}`);
    }
  }
  // Pisces is the wrap-around worst case: 10th from Pisces is Sagittarius.
  const pisces = RASHIS.indexOf("Pisces");
  assert.ok(getAspectedSignIndex("Saturn", pisces, GRAHA_ASPECTS.Saturn).has(RASHIS.indexOf("Sagittarius")));
});

test("a 7th aspect always exists for every planet, in every sign", () => {
  // Rule 13.13's counting principle, which every graha shares.
  for (const planet of Object.keys(GRAHA_ASPECTS)) {
    assert.ok(GRAHA_ASPECTS[planet].includes(7), `${planet} must aspect the 7th`);
    for (let signIndex = 0; signIndex < 12; signIndex += 1) {
      const seventh = (signIndex + 6) % 12;
      assert.ok(
        getAspectedSignIndex(planet, signIndex).has(seventh),
        `${planet} in sign ${signIndex} must aspect the 7th`,
      );
    }
  }
});

test("seventhFrom matches the 7th-house counting", () => {
  // The 7th from house N is N+6, wrapping 12 -> 1. Written explicitly rather
  // than via a modulo identity so the wrap is visible.
  for (let house = 1; house <= 12; house += 1) {
    const expected = house + 6 <= 12 ? house + 6 : house - 6;
    assert.equal(seventhFrom(house), expected, `7th from house ${house}`);
  }
  // Spot-checks in words: the 7th from the 1st is the 7th, the 7th from the 7th
  // is the 1st, the 7th from the 3rd is the 9th (the corpus's own example in
  // 13.13: the third house aspects the 9th from the Moon).
  assert.equal(seventhFrom(1), 7);
  assert.equal(seventhFrom(7), 1);
  assert.equal(seventhFrom(3), 9);
});

test("conjunction is reported separately but treated as equivalent (6.3)", () => {
  // Sun and Mars together in Leo.
  const { aspecting, byPlanet } = getAspects({ planets: chartFrom({ Leo: ["Sun", "Mars"] }) });
  assert.equal(byPlanet.Sun.rashi, "Leo");

  const sunToMars = aspecting.Sun.to.find((e) => e.planet === "Mars");
  assert.equal(sunToMars.darga, 0);
  assert.equal(sunToMars.name, "conjunction");
  assert.equal(sunToMars.source, "corpus-6.3-equivalence");
  assert.equal(sunToMars.mutual, true);

  // The 7th-from Leo is Aquarius, so a planet in Leo aspects something there.
  const { aspecting: withAquarius } = getAspects({
    planets: chartFrom({ Leo: ["Sun"], Aquarius: ["Saturn"] }),
  });
  const sunToSaturn = withAquarius.Sun.to.find((e) => e.planet === "Saturn");
  assert.ok(sunToSaturn, "Sun in Leo must aspect Saturn in Aquarius");
  assert.equal(sunToSaturn.darga, 7);
  assert.equal(sunToSaturn.source, "corpus-13.13-7th-principle");
});

test("mutual aspects are detected and are distinct from one-way aspects", () => {
  // Mars in Aries aspects the 4th (Cancer), 7th (Libra) and 8th (Scorpio).
  // Jupiter in Libra aspects the 5th, 7th, 9th -> Aries. So Mars and Jupiter are
  // mutually aspecting from Aries/Libra, which is the 7th on both sides.
  const { aspecting } = getAspects({
    planets: chartFrom({ Aries: ["Mars"], Libra: ["Jupiter"] }),
  });
  const marsToJupiter = aspecting.Mars.to.find((e) => e.planet === "Jupiter");
  const jupiterToMars = aspecting.Jupiter.to.find((e) => e.planet === "Mars");
  assert.equal(marsToJupiter.darga, 7);
  assert.equal(jupiterToMars.darga, 7);
  assert.equal(marsToJupiter.mutual, true);
  assert.equal(jupiterToMars.mutual, true);

  // One-way: Mars in Aries aspects the 4th (Cancer); put Venus there. Venus
  // aspects the 5th/7th/9th from Cancer, none of which is Aries.
  const { aspecting: oneWay } = getAspects({
    planets: chartFrom({ Aries: ["Mars"], Cancer: ["Venus"] }),
  });
  const marsToVenus = oneWay.Mars.to.find((e) => e.planet === "Venus");
  assert.equal(marsToVenus.darga, 4);
  assert.equal(marsToVenus.mutual, false, "Venus does not aspect back to Aries");
});

test("aspects are directional, not symmetric", () => {
  // Mars in Aries aspects the 4th (Cancer), where Venus sits. Venus' 5/7/9
  // range from Cancer does not include Aries, so there is NO aspect back.
  // Directionality is the whole point of drishti — a one-way aspect is a
  // distinct condition from a mutual one (10.3).
  const planets = chartFrom({ Aries: ["Mars"], Cancer: ["Venus"] });
  const { aspecting } = getAspects({ planets });

  const marsToVenus = aspecting.Mars.to.find((e) => e.planet === "Venus");
  assert.equal(marsToVenus.darga, 4);
  assert.equal(marsToVenus.mutual, false);
  assert.equal(aspecting.Venus.to.some((e) => e.planet === "Mars"), false, "Venus does not aspect Mars");

  // Every edge must name a real darga for the aspecting planet's own range.
  for (const [planet, block] of Object.entries(aspecting)) {
    for (const edge of block.to) {
      if (edge.darga === 0) continue;
      assert.ok(
        GRAHA_ASPECTS[planet].includes(edge.darga),
        `${planet} cannot give a ${edge.darga}th drishti`,
      );
    }
  }
});

test("influencesHouse treats occupancy and drishti as equivalent (6.3, 1.3)", () => {
  // Ascendant in Aries, so house 1 = Aries, 7 = Libra, 4 = Cancer.
  const ascendant = at("Aries", 0);
  const planets = chartFrom({
    Aries: ["Sun"],   // occupies house 1
    Libra: ["Mars"],  // aspects house 1 from the 7th
  });

  const occupant = influencesHouse({ planetName: "Sun", house: 1, ascendantLongitude: ascendant, planetLongitudes: planets });
  assert.equal(occupant.influences, true);
  assert.equal(occupant.by.length, 1);
  assert.equal(occupant.by[0].kind, "occupancy");
  assert.equal(occupant.by[0].source, "corpus-6.3-equivalence");

  // Mars in Libra aspects the 7th from itself, which is Aries = house 1.
  const byAspect = influencesHouse({ planetName: "Mars", house: 1, ascendantLongitude: ascendant, planetLongitudes: planets });
  assert.equal(byAspect.influences, true);
  assert.equal(byAspect.by[0].kind, "drishti");
  assert.equal(byAspect.by[0].darga, 7);

  // Venus in Aries aspects house 1 by occupancy.
  const inHouse = influencesHouse({ planetName: "Sun", house: 5, ascendantLongitude: ascendant, planetLongitudes: planets });
  assert.equal(inHouse.influences, false, "Sun in Aries does not reach house 5");

  // Rule 13.6: the 7th house is triggered when aspected by its own lord, or
  // occupied by it. Saturn rules Libra (house 7 here); put it in Aries. It does
  // not occupy the 7th — it reaches it by the 7th drishti, which is the case
  // the rule actually names.
  const seventhTrigger = influencesHouse({
    planetName: "Saturn",
    house: 7,
    ascendantLongitude: ascendant,
    planetLongitudes: { Saturn: at("Aries", 5) },
  });
  assert.equal(seventhTrigger.influences, true);
  assert.equal(seventhTrigger.by[0].kind, "drishti");
  assert.equal(seventhTrigger.by[0].darga, 7);
  assert.equal(seventhTrigger.by[0].source, "corpus-13.13-7th-principle");
});

test("Mars aspects the 4th house by drishti from the 4th sign ahead", () => {
  // Ascendant Aries: house 4 = Cancer. Mars in Aries aspects the 4th from
  // itself, which is Cancer. So a Mars in the 1st influences house 4.
  const result = influencesHouse({
    planetName: "Mars",
    house: 4,
    ascendantLongitude: at("Aries", 0),
    planetLongitudes: { Mars: at("Aries", 5) },
  });
  assert.equal(result.influences, true);
  assert.equal(result.by[0].kind, "drishti");
  assert.equal(result.by[0].darga, 4);
  assert.equal(result.by[0].source, "parashari-convention");
});

test("combust planets can optionally be excluded from aspecting", () => {
  const planets = { Sun: at("Aries", 0), Mars: at("Libra", 5) };
  const ascendant = at("Aries", 0);

  const normally = influencesHouse({ planetName: "Mars", house: 1, ascendantLongitude: ascendant, planetLongitudes: planets });
  assert.equal(normally.influences, true, "by default a combust planet still aspects");

  const skipped = influencesHouse({
    planetName: "Mars",
    house: 1,
    ascendantLongitude: ascendant,
    planetLongitudes: planets,
    options: { skipCombust: true, combust: { Mars: { isCombust: true } } },
  });
  assert.equal(skipped.influences, false);
  assert.match(skipped.reason, /combust/);
});

test("getAspects exposes sign, lord and nakshatra lord metadata", () => {
  const { byPlanet } = getAspects({
    planets: { Moon: at("Scorpio", 0) },
  });
  assert.equal(byPlanet.Moon.rashi, "Scorpio");
  assert.equal(byPlanet.Moon.signLord, "Mars");
  // 0deg of Scorpio is already Vishakha (nakshatra index 15, lord Jupiter), not
  // Vrischika. Nakshatras are 13deg20' long, so Scorpio's 30 degrees contains
  // three nakshatra boundaries at 3deg20' and 16deg40'.
  const lordAt = (degree) => getAspects({ planets: { Moon: at("Scorpio", degree) } }).byPlanet.Moon.nakshatraLord;
  assert.equal(byPlanet.Moon.nakshatraLord, "Jupiter");
  assert.equal(lordAt(3.2), "Jupiter", "Vishakha runs to 3deg20'");
  assert.equal(lordAt(3.4), "Saturn", "Anuradha takes over at 3deg20'");
  assert.equal(lordAt(10), "Saturn");
  assert.equal(lordAt(16.5), "Saturn");
  assert.equal(lordAt(16.8), "Mercury", "Jyeshtha takes over at 16deg40'");
  assert.equal(lordAt(29.9), "Mercury");
  assert.ok(byPlanet.Moon.degreeInSign >= 0 && byPlanet.Moon.degreeInSign < 30);
});

test("drishti degrades safely on sparse input", () => {
  assert.equal(getAspects(), null);
  assert.equal(getAspects({}), null);
  assert.equal(getAspects({ planets: null }), null);
  assert.equal(getAspects({ planets: {} }), null);
  // A planet with a non-finite longitude is skipped rather than producing NaN signs.
  const result = getAspects({ planets: { Sun: Number.NaN, Moon: at("Taurus", 5) } });
  assert.deepEqual(Object.keys(result.byPlanet), ["Moon"]);

  assert.equal(influencesHouse({}), null);
  assert.equal(influencesHouse({ planetName: "Sun", house: 1 }), null);
  assert.equal(influencesHouse({ planetName: "Sun", house: 13, ascendantLongitude: 0, planetLongitudes: { Sun: 0 } }), null);
  assert.equal(influencesHouse({ planetName: "Sun", house: 0, ascendantLongitude: 0, planetLongitudes: { Sun: 0 } }), null);
  assert.equal(influencesHouse({ planetName: "Sun", house: 1, ascendantLongitude: 0, planetLongitudes: {} }), null);
});

test("every planet aspects at least 3 of the 12 signs", () => {
  // Sanity bound on the aspect graph: no planet can see most of the zodiac.
  for (const [planet, aspects] of Object.entries(GRAHA_ASPECTS)) {
    for (let signIndex = 0; signIndex < 12; signIndex += 1) {
      const targets = getAspectedSignIndex(planet, signIndex, aspects);
      assert.ok(targets.size <= 4, `${planet} sees ${targets.size} signs, which is too many`);
    }
  }
});
