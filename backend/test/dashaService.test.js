const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DASHA_ORDER,
  DASHA_YEARS,
  TOTAL_DASHA_YEARS,
  DAYS_PER_DASHA_YEAR,
  NAKSHATRA_LORDS,
  nakshatraLord,
  calculateDashaBalance,
  buildSubPeriods,
  buildMahadashas,
  getDashaTimeline,
  getDashaHouseActivations,
} = require("../services/dashaService");

const BIRTH = new Date("1990-05-15T04:30:00Z");
const MOON = 213.5; // sidereal Scorpio, Anuradha
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const inYears = (ms) => ms / MS_PER_YEAR;

test("dasha lengths match the classical table and sum to exactly 120", () => {
  assert.equal(TOTAL_DASHA_YEARS, 120);
  assert.equal(
    Object.values(DASHA_YEARS).reduce((a, b) => a + b, 0),
    120,
  );
  assert.equal(DASHA_ORDER.length, 9);
  // Spot-check the well-known allocations rather than restating all nine.
  assert.equal(DASHA_YEARS.Sun, 6);
  assert.equal(DASHA_YEARS.Moon, 10);
  assert.equal(DASHA_YEARS.Mars, 7);
  assert.equal(DASHA_YEARS.Rahu, 18);
  assert.equal(DASHA_YEARS.Ketu, 7);
  assert.equal(DASHA_YEARS.Jupiter, 16);
  assert.equal(DASHA_YEARS.Saturn, 19);
  assert.equal(DASHA_YEARS.Mercury, 17);
  assert.equal(DASHA_YEARS.Venus, 20);
});

test("nakshatra lords repeat every 9 across all 27 nakshatras", () => {
  assert.equal(NAKSHATRA_LORDS.length, 27);
  // Ashwini is Ketu, Bharani Venus, Krittika Sun, Rohini Moon, Mrigashira
  // Mars, Ardra Rahu, Punarvasu Jupiter, Pushya Saturn, Ashlesha Mercury.
  assert.equal(nakshatraLord(0), "Ketu");
  assert.equal(nakshatraLord(1), "Venus");
  assert.equal(nakshatraLord(2), "Sun");
  assert.equal(nakshatraLord(3), "Moon");
  assert.equal(nakshatraLord(4), "Mars");
  assert.equal(nakshatraLord(5), "Rahu");
  assert.equal(nakshatraLord(6), "Jupiter");
  assert.equal(nakshatraLord(7), "Saturn");
  assert.equal(nakshatraLord(8), "Mercury");
  // Magha (index 9) restarts the cycle rather than continuing the sequence —
  // the classic off-by-nine bug this guards against.
  assert.equal(nakshatraLord(9), "Ketu");
  assert.equal(nakshatraLord(18), "Ketu");
  assert.equal(nakshatraLord(26), "Mercury");
  // Each graha rules exactly 3 of the 27 nakshatras.
  const counts = DASHA_ORDER.map((planet) => NAKSHATRA_LORDS.filter((l) => l === planet).length);
  assert.deepEqual(counts, [3, 3, 3, 3, 3, 3, 3, 3, 3]);
});

test("balance at birth reflects only the un-traversed fraction of the nakshatra", () => {
  const balance = calculateDashaBalance(MOON);

  // Anuradha is the 17th nakshatra (index 16); 16 % 9 === 7, so its lord is
  // the 8th graha in the cycle, Saturn.
  assert.equal(balance.lord, "Saturn");
  assert.equal(balance.nakshatra, "Anuradha");
  assert.equal(balance.pada, 1);

  // Anuradha spans 213.333..226.667, so 213.5 is 0.1667/13.3333 = 1.25% in.
  // Saturn gets 19 years, so ~98.75% remains.
  assert.ok(Math.abs(balance.proportionTraversed - 0.0125) < 1e-3, `traversed ${balance.proportionTraversed}`);
  assert.ok(
    Math.abs(balance.proportionRemaining - 0.9875) < 1e-3,
    `remaining ${balance.proportionRemaining}`,
  );
  assert.ok(
    Math.abs(balance.balanceYears - 19 * 0.9875) < 0.01,
    `balanceYears ${balance.balanceYears}`,
  );
  assert.ok(Math.abs(balance.balanceDays - balance.balanceYears * DAYS_PER_DASHA_YEAR) < 0.5);
  // Balance can never exceed the lord's full allotment.
  assert.ok(balance.balanceYears > 0 && balance.balanceYears <= DASHA_YEARS.Saturn);
});

test("balance at the very start of a nakshatra equals the full dasha length", () => {
  // Ashwini begins at 0 deg and is ruled by Ketu (7 years).
  const balance = calculateDashaBalance(0);
  assert.equal(balance.lord, "Ketu");
  assert.equal(balance.proportionTraversed, 0);
  assert.equal(balance.balanceYears, 7);

  // Bharani (13.333 deg) is ruled by Venus, and a longitude just inside it
  // should carry almost all of Venus's 20 years.
  const bharani = calculateDashaBalance(13.5);
  assert.equal(bharani.lord, "Venus");
  assert.ok(bharani.balanceYears > 19 && bharani.balanceYears <= DASHA_YEARS.Venus);
});

test("balance rejects a non-finite Moon longitude rather than returning NaN", () => {
  assert.throws(() => calculateDashaBalance(NaN), TypeError);
  assert.throws(() => calculateDashaBalance(undefined), TypeError);
});

test("mahadashas are contiguous, in cycle order, and a full cycle spans 120 years", () => {
  // 10 periods: the partial first one plus the nine remaining grahas, which
  // together cover the whole 120-year cycle exactly once.
  const { mahadashas } = buildMahadashas({ moonSiderealLongitude: MOON, birthDate: BIRTH, count: 10 });

  assert.equal(mahadashas.length, 10);
  assert.equal(mahadashas[0].start.getTime(), BIRTH.getTime());
  assert.equal(mahadashas[0].planet, "Saturn");
  assert.equal(mahadashas[0].isPartialAtBirth, true);
  // The cycle returns to the birth lord after exactly nine grahas.
  assert.equal(mahadashas[9].planet, "Saturn");
  assert.equal(mahadashas[9].isPartialAtBirth, false);

  for (let i = 1; i < mahadashas.length; i += 1) {
    assert.equal(
      mahadashas[i].start.getTime(),
      mahadashas[i - 1].end.getTime(),
      `gap or overlap before ${mahadashas[i].planet}`,
    );
  }
  // Every non-first period takes its full nominal length.
  for (let i = 1; i < mahadashas.length; i += 1) {
    assert.equal(mahadashas[i].years, DASHA_YEARS[mahadashas[i].planet]);
  }

  // The cycle is exactly 120 years, but birth falls *partway* into the birth
  // lord's dasha, so the calendar span from birth to the next Saturn start is
  // short by exactly the elapsed remainder. Accounting for it makes the sum
  // exact rather than approximately 120.
  const { balance } = buildMahadashas({ moonSiderealLongitude: MOON, birthDate: BIRTH, count: 10 });
  const elapsedBeforeBirth = DASHA_YEARS[balance.lord] - balance.balanceYears;
  const spannedYears = inYears(mahadashas[9].start - mahadashas[0].start);
  assert.ok(
    Math.abs(elapsedBeforeBirth + spannedYears - TOTAL_DASHA_YEARS) < 0.01,
    `elapsed ${elapsedBeforeBirth} + spanned ${spannedYears} should total 120`,
  );
});

test("sub-periods start from the parent lord, are contiguous, and sum to the parent", () => {
  const parentStart = new Date("2000-01-01T00:00:00Z");
  const totalDays = DASHA_YEARS.Venus * DAYS_PER_DASHA_YEAR;
  const subs = buildSubPeriods(parentStart, totalDays, "Venus");

  assert.equal(subs.length, 9);
  // Standard Parashari sub-period order: continue forward through DASHA_ORDER
  // starting at the parent lord, wrapping around — so Venus is followed by
  // Sun, not Mercury (that descending order is a common transcription error).
  assert.deepEqual(
    subs.map((s) => s.planet),
    ["Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury", "Ketu"],
  );
  assert.equal(subs[0].start.getTime(), parentStart.getTime());

  for (let i = 1; i < subs.length; i += 1) {
    assert.equal(subs[i].start.getTime(), subs[i - 1].end.getTime());
  }

  // Sub-period `years` is the time it actually spans, not the graha's nominal
  // dasha length — a Mercury antardasha inside a Venus mahadasha is ~2.8y,
  // not 17. The reported years are rounded to 2dp, so compare on days and
  // allow a rounding slack on the year sum.
  const summedDays = subs.reduce((sum, s) => sum + s.days, 0);
  assert.ok(Math.abs(summedDays - 20 * DAYS_PER_DASHA_YEAR) < 0.5, `subs totalled ${summedDays} days`);
  const totalYears = subs.reduce((sum, s) => sum + s.years, 0);
  assert.ok(Math.abs(totalYears - DASHA_YEARS.Venus) < 0.05, `subs totalled ${totalYears}y`);

  const mercury = subs.find((s) => s.planet === "Mercury");
  assert.ok(mercury.years < DASHA_YEARS.Mercury, "sub-period must not use the graha's full length");
  // Each sub-period takes its 120-year share of the parent window.
  for (const sub of subs) {
    const shareOfParent = inYears(sub.days * 24 * 60 * 60 * 1000) / DASHA_YEARS.Venus;
    const expectedShare = DASHA_YEARS[sub.planet] / TOTAL_DASHA_YEARS;
    assert.ok(
      Math.abs(shareOfParent - expectedShare) < 0.001,
      `${sub.planet} took ${shareOfParent} of the window, expected ${expectedShare}`,
    );
  }
});

test("sub-periods wrap the cycle correctly from a late-starting lord", () => {
  const subs = buildSubPeriods(new Date("2000-01-01T00:00:00Z"), 365.25, "Mercury");
  assert.deepEqual(
    subs.map((s) => s.planet),
    ["Mercury", "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn"],
  );
});

test("timeline nests each level inside its parent and covers the query date", () => {
  const atDate = new Date("2020-06-15T00:00:00Z");
  const timeline = getDashaTimeline({ moonSiderealLongitude: MOON, birthDate: BIRTH, atDate });

  assert.ok(timeline.current, "expected an active period");
  const { mahadasha, antardasha, pratyantardasha } = timeline.current;

  for (const period of [mahadasha, antardasha, pratyantardasha]) {
    assert.ok(period, "all three levels should be active");
    assert.ok(atDate >= period.start && atDate < period.end, `${period.planet} should contain the date`);
  }

  // Nesting: child bounds must sit inside parent bounds.
  assert.ok(antardasha.start >= mahadasha.start && antardasha.end <= mahadasha.end);
  assert.ok(pratyantardasha.start >= antardasha.start && pratyantardasha.end <= antardasha.end);
  // The antardasha sequence starts from its own mahadasha lord.
  assert.equal(timeline.antardashas[0].planet, mahadasha.planet);
  // And the pratyantardasha sequence from its antardasha lord.
  assert.equal(timeline.pratyantardashas[0].planet, antardasha.planet);
  assert.equal(timeline.pratyantardashas.length, 9);

  for (let i = 1; i < timeline.antardashas.length; i += 1) {
    assert.equal(timeline.antardashas[i].start.getTime(), timeline.antardashas[i - 1].end.getTime());
  }
  for (let i = 1; i < timeline.pratyantardashas.length; i += 1) {
    assert.equal(timeline.pratyantardashas[i].start.getTime(), timeline.pratyantardashas[i - 1].end.getTime());
  }
});

test("the same date always yields identical periods (deterministic)", () => {
  const args = { moonSiderealLongitude: MOON, birthDate: BIRTH, atDate: new Date("2015-03-03T12:00:00Z") };
  const first = getDashaTimeline(args);
  const second = getDashaTimeline(args);
  for (const level of ["mahadasha", "antardasha", "pratyantardasha"]) {
    assert.equal(first.current[level].planet, second.current[level].planet);
    assert.equal(first.current[level].start.getTime(), second.current[level].start.getTime());
  }
  assert.equal(first.current.isDashaSandhi, second.current.isDashaSandhi);
});

test("a date before birth returns null periods rather than a guess", () => {
  const timeline = getDashaTimeline({
    moonSiderealLongitude: MOON,
    birthDate: BIRTH,
    atDate: new Date("1980-01-01T00:00:00Z"),
  });
  assert.equal(timeline.current, null);
  assert.ok(timeline.mahadashas.length > 0, "the sequence itself is still available");
});

test("timeline rejects an invalid date instead of returning NaN periods", () => {
  assert.throws(
    () => getDashaTimeline({ moonSiderealLongitude: MOON, birthDate: BIRTH, atDate: "not-a-date" }),
    TypeError,
  );
});

test("house activations report the running lords and their drishti set", () => {
  const timeline = getDashaTimeline({
    moonSiderealLongitude: MOON,
    birthDate: BIRTH,
    atDate: new Date("2020-06-15T00:00:00Z"),
  });
  const planets = {
    Mercury: { rashi: "Gemini", house: 12 },
    Rahu: { rashi: "Aquarius", house: 5 },
    Venus: { rashi: "Taurus", house: 10 },
  };
  const activations = getDashaHouseActivations({ planets, timeline });

  assert.equal(activations.length, 3);
  assert.deepEqual(
    activations.map((a) => a.via),
    ["mahadasha", "antardasha", "pratyantardasha"],
  );
  // Each entry carries the running graha at that level.
  assert.equal(activations[0].planet, timeline.current.mahadasha.planet);
  assert.equal(activations[1].planet, timeline.current.antardasha.planet);
  assert.equal(activations[2].planet, timeline.current.pratyantardasha.planet);

  for (const activation of activations) {
    assert.ok(activation.house === null || (activation.house >= 1 && activation.house <= 12));
    // Drishti set: own sign, 4th, 7th, 10th.
    assert.equal(activation.houses.length, 4);
    for (const house of activation.houses) {
      assert.ok(house >= 1 && house <= 12);
    }
    assert.equal(new Set(activation.houses).size, 4, "no duplicate houses");
  }
});

test("house activations degrade gracefully on sparse or missing charts", () => {
  const timeline = getDashaTimeline({
    moonSiderealLongitude: MOON,
    birthDate: BIRTH,
    atDate: new Date("2020-06-15T00:00:00Z"),
  });

  // A graha with no known sign still appears (it's running) but reports nulls
  // rather than throwing or inventing a house.
  const sparse = getDashaHouseActivations({ planets: {}, timeline });
  assert.equal(sparse.length, 3);
  for (const activation of sparse) {
    assert.equal(activation.rashi, null);
    assert.deepEqual(activation.houses, []);
  }
  assert.deepEqual(getDashaHouseActivations({ planets: null, timeline }).length, 3);

  // No running period means no activations at all.
  assert.deepEqual(getDashaHouseActivations({ planets: {}, timeline: { current: null } }), []);
});
