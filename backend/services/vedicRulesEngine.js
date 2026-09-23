// Encodes the CLEARLY COMPUTABLE rules from the Class 1 (Part 1 & 2) lecture
// transcripts (see data/vedicKnowledgeBase.json for the full source text of
// every rule, including ones NOT encoded here).
//
// SCOPE — what this engine does and does not do:
// This covers the rules that can be evaluated purely from chart geometry
// (sign, house, aspect, strength) without requiring subjective judgment.
// Several rules from the transcripts are deliberately NOT encoded here
// because they require nuance, cancellation checks, or context this
// automated pass can't safely judge (e.g., "check the extent to which a
// principle can be applied," per the teacher's own repeated caution). For
// those, the RAG Q&A layer (ragService.js) surfaces the raw rule text so a
// human (or the LLM, with appropriate hedging) can reason about applicability
// — this engine does not attempt to fully automate Jyotish judgment.
//
// Every finding below carries a `ruleId` referencing the matching rule in
// vedicKnowledgeBase.json, so the RAG layer / frontend can show the full
// source explanation alongside the computed result.

const { NATURAL_BENEFICS, NATURAL_MALEFICS } = require("./vedicAstrologyService");

const isAspecting7th = (planetHouse) => {
  // Simplified aspect model: every planet aspects the 7th house from itself
  // (universal 7th aspect, per Parashari rules) — special aspects of Mars
  // (4th/8th), Jupiter (5th/9th), Saturn (3rd/10th) are NOT modeled here to
  // keep this a defensible baseline rather than a false-precision claim.
  // This means aspect-based findings below are a conservative subset of what
  // a full aspect engine would find — flagged explicitly in each finding.
  return null; // placeholder — see findPlanetsAspecting7th below for real logic
};

const housesApart = (fromHouse, toHouse) => (((toHouse - fromHouse) % 12) + 12) % 12 + 1;

// Which houses each planet aspects, counted from its own house (1 = the house itself, not an aspect).
const getAspectedHouses = (planetName, fromHouse) => {
  const base = [7]; // universal 7th-house aspect, all planets
  const special = {
    Mars: [4, 8],
    Jupiter: [5, 9],
    Saturn: [3, 10],
  };
  const offsets = [...base, ...(special[planetName] || [])];
  return offsets.map((offset) => ((fromHouse - 1 + (offset - 1)) % 12) + 1);
};

const findPlanetsInHouse = (planets, houseNumber) =>
  Object.entries(planets).filter(([, data]) => data.house === houseNumber).map(([name]) => name);

const findPlanetsAspectingHouse = (planets, houseNumber) =>
  Object.entries(planets)
    .filter(([name, data]) => getAspectedHouses(name, data.house).includes(houseNumber))
    .map(([name]) => name);

// --- Rule 2.2/2.3: Male/Female sign matchmaking (Part 1) ---
const evaluateSignMatch = (ascendantA, ascendantB) => {
  // ascendantA/B: { rashi, gender } from calculateVedicChart output
  const { gender: genderA, rashi: rashiA } = ascendantA;
  const { gender: genderB, rashi: rashiB } = ascendantB;

  if (genderA === "female" && genderB === "male") {
    return { ruleId: "2.2-4-female-male", compatible: true, note: `Female in ${genderA === "female" ? rashiA : rashiB} sign paired with male sign is one of the two unrestricted-compatibility cases.` };
  }
  // The transcript's rule set is specifically about a FEMALE native's sign vs her partner's sign
  // (and vice versa) — we evaluate symmetric compatibility here for a general-purpose app.
  const femaleInMaleSign = genderA === "female" && genderB === "male" ? false : (genderA === "female" ? rashiA : rashiB);
  return null;
};

// Simplified, direct implementation matching the transcript's exact 4-case table (Part 1, Rule 2.2)
const evaluateSignCompatibility = (personA, personB) => {
  // personA/personB: { ascendantRashi, ascendantGender, nativeGender } — nativeGender is the person's own gender identity
  const findFemaleAndMale = () => {
    const female = personA.nativeGender === "female" ? personA : personB.nativeGender === "female" ? personB : null;
    const male = personA.nativeGender === "male" ? personA : personB.nativeGender === "male" ? personB : null;
    return { female, male };
  };
  const { female, male } = findFemaleAndMale();

  if (!female || !male) {
    return {
      ruleId: "2.2",
      applicable: false,
      note: "This specific rule (Part 1, Rule 2.2) is stated for male/female pairings in the source material and doesn't have a stated same-gender-pairing case. See ragService for a general-knowledge answer if needed.",
    };
  }

  const femaleAscGender = female.ascendantGender;
  const maleAscGender = male.ascendantGender;

  if (femaleAscGender === "female") {
    return { ruleId: "2.2", compatible: true, verdict: "unrestricted", note: `Female is born in a female sign (${female.ascendantRashi}) — per the lecture, she may be matched with anyone.` };
  }
  if (maleAscGender === "male") {
    return { ruleId: "2.2", compatible: true, verdict: "unrestricted", note: `Male is born in a male sign (${male.ascendantRashi}) — per the lecture, he may be matched with anyone.` };
  }
  if (femaleAscGender === "male" && maleAscGender === "male") {
    return { ruleId: "2.2", compatible: true, verdict: "conditional-match", note: `Female born in a male sign (${female.ascendantRashi}) matched with male born in a male sign (${male.ascendantRashi}) — this is the compatible conditional case per the lecture.` };
  }
  if (femaleAscGender === "male" && maleAscGender === "female") {
    return {
      ruleId: "2.3",
      compatible: false,
      verdict: "flagged-incompatible",
      severity: "high",
      note: "Female born in a male sign matched with male born in a female sign — the lecture explicitly flags this pairing as a serious mismatch (independence/temperament conflict), stating such pairs tend not to stay together long-term. Exceptions to this general rule were mentioned as existing but not detailed in Part 1 — treat this as a caution flag, not an absolute veto.",
    };
  }

  return { ruleId: "2.2", applicable: false, note: "Could not determine sign-gender combination." };
};

// --- Rule 3.1/3.2: Marriage worthiness & occurrence (Part 1) ---
const evaluateMarriageWorthiness = (chart) => {
  const seventhLord = chart.houseLords[7].lord;
  const planetsIn7th = findPlanetsInHouse(chart.planets, 7);
  const aspectingPlanets = findPlanetsAspectingHouse(chart.planets, 7);
  const allInfluencing7th = [...new Set([...planetsIn7th, ...aspectingPlanets])];

  const beneficsInfluencing = allInfluencing7th.filter((p) => NATURAL_BENEFICS.includes(p));
  const worthwhile = beneficsInfluencing.length > 0;

  const seventhLordInfluences7th = planetsIn7th.includes(seventhLord) || aspectingPlanets.includes(seventhLord);

  return {
    ruleId: "3.1-3.2",
    seventhLord,
    planetsIn7th,
    planetsAspecting7th: aspectingPlanets,
    beneficsInfluencing,
    worthwhile,
    worthwhileNote: worthwhile
      ? `${beneficsInfluencing.join(", ")} (natural benefic) influences the 7th house — per the lecture, marriage is worthwhile.`
      : "No natural benefic (Jupiter, Venus, Moon, Mercury) influences the 7th house — per the lecture, marriage may not bring the expected support/companionship even if it occurs.",
    willMarry: seventhLordInfluences7th,
    willMarryNote: seventhLordInfluences7th
      ? `The 7th lord (${seventhLord}) influences its own house — per the lecture, this is a strong, overriding indicator that marriage WILL occur regardless of other factors.`
      : `The 7th lord (${seventhLord}) does not influence the 7th house directly — this specific overriding "will marry" indicator is not present (other factors may still indicate marriage).`,
    caveat: "Aspect detection here uses the universal 7th-house aspect (all planets) plus Mars/Jupiter/Saturn's special aspects. It does not yet model combustion, retrogression-based aspect changes, or exact-degree orb strength — treat 'aspecting' as an approximation.",
  };
};

// --- Rule 4.1: 5th-7th lord exchange (Part 1) ---
const evaluate5th7thExchange = (chart) => {
  const fifthLord = chart.houseLords[5].lord;
  const seventhLord = chart.houseLords[7].lord;
  const fifthLordHouse = chart.planets[fifthLord]?.house;
  const seventhLordHouse = chart.planets[seventhLord]?.house;

  const seventhLordIn5th = seventhLordHouse === 5;
  const fifthLordIn7th = fifthLordHouse === 7;
  const mutualExchange = seventhLordIn5th && fifthLordIn7th;
  const conjoinedIn5thOr7th = fifthLordHouse === seventhLordHouse && [5, 7].includes(fifthLordHouse);

  const flagged = seventhLordIn5th || fifthLordIn7th || conjoinedIn5thOr7th;

  return {
    ruleId: "4.1",
    fifthLord, seventhLord, fifthLordHouse, seventhLordHouse,
    seventhLordIn5th, fifthLordIn7th, mutualExchange, conjoinedIn5thOr7th,
    flagged,
    severity: mutualExchange || conjoinedIn5thOr7th ? "high (intensified — mutual exchange or conjunction present)" : flagged ? "moderate" : "none",
    note: flagged
      ? "5th/7th lord connection detected per Rule 4.1 — the lecture associates this with difficulties in marriage, children, or marital happiness. This is presented as a caution flag requiring further chart review, not a deterministic outcome."
      : "No 5th/7th lord exchange or conjunction detected.",
  };
};

// --- Rule 4.3: Low/no sexual interest — Saturn/Mercury-only 7th house influence (Part 1) ---
const evaluateLowInterestCombination = (chart) => {
  const seventhLord = chart.houseLords[7].lord;
  const planetsIn7th = findPlanetsInHouse(chart.planets, 7);
  const aspectingPlanets = findPlanetsAspectingHouse(chart.planets, 7);
  const allInfluencing = [...new Set([...planetsIn7th, ...aspectingPlanets])];

  const onlySaturnMercury = allInfluencing.length > 0 && allInfluencing.every((p) => ["Saturn", "Mercury"].includes(p));
  const exceptionApplies = onlySaturnMercury && allInfluencing.includes(seventhLord);

  return {
    ruleId: "4.3-A",
    applicable: onlySaturnMercury && !exceptionApplies,
    allInfluencing,
    note: onlySaturnMercury
      ? exceptionApplies
        ? "Only Saturn/Mercury influence the 7th house, but one of them IS the 7th lord — per the lecture's exception, the negative reading does not apply here."
        : "Only Saturn and/or Mercury influence the 7th house (no other planet) — per the lecture, this can indicate reduced interest in physical intimacy (Saturn) or interest directed outside the marriage (Mercury)."
      : "This specific combination (7th house influenced ONLY by Saturn/Mercury and nothing else) is not present.",
  };
};

// --- Rule 15.1: "One life, one wife" single-marriage override (Part 2) ---
const evaluateSingleMarriageIndicator = (chart) => {
  const planetsIn7th = findPlanetsInHouse(chart.planets, 7);
  const jupiterMercuryBoth = planetsIn7th.includes("Jupiter") && planetsIn7th.includes("Mercury");
  const seventhLord = chart.houseLords[7].lord;
  const seventhLordNavamsha = chart.planets[seventhLord]?.navamshaSign;
  const singleMarriageNavamshaSigns = ["Leo", "Aries", "Scorpio"]; // Sun's and Mars's navamshas
  const navamshaIndicatesSingle = singleMarriageNavamshaSigns.includes(seventhLordNavamsha);

  return {
    ruleId: "15.1",
    jupiterMercuryBothIn7th: jupiterMercuryBoth,
    seventhLordNavamsha,
    navamshaIndicatesSingle,
    applicable: jupiterMercuryBoth || navamshaIndicatesSingle,
    note: jupiterMercuryBoth
      ? "Jupiter and Mercury are both placed in the 7th house — per the lecture, this indicates only one marriage."
      : navamshaIndicatesSingle
        ? `The 7th lord is in ${seventhLordNavamsha} Navamsha (Sun's or Mars's division) — per the lecture, this indicates only one marriage.`
        : "Neither single-marriage indicator from Rule 15.1 is present.",
    caveat: "Per the lecture, this indicates the MARRIAGE COUNT stays at one — it does not necessarily rule out affairs if other multiplicity combinations are otherwise strong.",
  };
};

// --- Full rule-based reading for a single chart ---
const runRuleEngine = (chart, nativeGender) => {
  if (chart.precision !== "full") {
    return {
      available: false,
      reason: chart.note || "Full chart (Ascendant + houses) is required to run house-based rules — birth time and/or location was missing.",
    };
  }
  return {
    available: true,
    marriageWorthiness: evaluateMarriageWorthiness(chart),
    fifthSeventhExchange: evaluate5th7thExchange(chart),
    lowInterestCombination: evaluateLowInterestCombination(chart),
    singleMarriageIndicator: evaluateSingleMarriageIndicator(chart),
  };
};

module.exports = {
  evaluateSignCompatibility,
  evaluateMarriageWorthiness,
  evaluate5th7thExchange,
  evaluateLowInterestCombination,
  evaluateSingleMarriageIndicator,
  runRuleEngine,
  getAspectedHouses,
  findPlanetsInHouse,
  findPlanetsAspectingHouse,
};
