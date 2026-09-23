// Combines the three Vedic building blocks — sign matchmaking (Rule 2.2),
// Ashtakoot Guna Milan, and the computable rule-engine findings — into one
// report, in the same spirit as the existing (Western) compatibilityService.
// This is additive: it does not replace calculateCompatibility, it runs
// alongside it (see matchmakingController.js), exactly like the existing
// `astrology` field is optional/additive today.

const { calculateGunaMilan } = require("./gunaMilanService");
const { evaluateSignCompatibility, runRuleEngine } = require("./vedicRulesEngine");

/**
 * @param {object} params
 * @param {object} params.horoscopeA - Horoscope mongoose doc/lean object for person A (must include vedicChart)
 * @param {object} params.horoscopeB - same, for person B
 * @param {string} params.genderA - "male" | "female" | "other" (from User model)
 * @param {string} params.genderB
 * @returns {object|null} report, or null if either chart lacks full Ascendant/house data
 */
const calculateVedicCompatibility = ({ horoscopeA, horoscopeB, genderA, genderB }) => {
  const chartA = horoscopeA?.vedicChart;
  const chartB = horoscopeB?.vedicChart;

  if (!chartA || !chartB) return null;

  const result = { available: chartA.precision === "full" && chartB.precision === "full" };

  // Guna Milan only needs each person's Moon longitude — works even with
  // date-only precision (no birth time), same as classical practice often
  // allows when birth time is uncertain.
  const moonLonA = chartA.planets?.Moon?.longitude;
  const moonLonB = chartB.planets?.Moon?.longitude;
  if (Number.isFinite(moonLonA) && Number.isFinite(moonLonB)) {
    result.gunaMilan = calculateGunaMilan(moonLonA, moonLonB);
  }

  // Sign matchmaking + full rule engine need Ascendant, which requires
  // birth time + location (chart.precision === "full").
  if (result.available) {
    result.signCompatibility = evaluateSignCompatibility({
      ascendantRashi: chartA.ascendant.rashi,
      ascendantGender: chartA.ascendant.gender,
      nativeGender: genderA,
    }, {
      ascendantRashi: chartB.ascendant.rashi,
      ascendantGender: chartB.ascendant.gender,
      nativeGender: genderB,
    });
    result.ruleEngineA = runRuleEngine(chartA, genderA);
    result.ruleEngineB = runRuleEngine(chartB, genderB);
  } else {
    result.note = "Full sign-matchmaking and rule-engine analysis requires both partners to have birth time AND birth location on file. Guna Milan (Moon-sign based) is available with date-of-birth alone.";
  }

  return result;
};

module.exports = { calculateVedicCompatibility };
