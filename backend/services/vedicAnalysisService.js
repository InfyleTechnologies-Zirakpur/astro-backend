// Static Vedic analysis — the layer that combines the varga, strength and
// drishti engines into one derived block for persistence and for the AI layer.
//
// WHY THIS EXISTS AND WHY IT IS SEPARATE FROM calculateVedicChart:
//
//   1. vedicChart is an existing Mixed blob that predates these services and is
//      read directly by the API and the QA context. Its shape is load-bearing, so
//      it is left alone rather than widened in place.
//   2. The analysis here is entirely STATIC — it depends only on the birth
//      instant, so it can be computed once and stored. Dasha and transits are
//      deliberately NOT included, because those are time-dependent and would
//      make the stored block wrong the moment the clock moves.
//
// PROVENANCE: every block below records which corpus rules it is grounded in
// and which parts are standard convention, so the AI layer can cite correctly
// instead of presenting convention as scripture.

const { RASHIS, RASHI_LORDS, getRashi, signIndexOf } = require("./vedicAstrologyService");
const { describeVargas, shadvargaAssessment, d1D9Comparison, isVargottama } = require("./vedicVargaService");
const { assessChartStrength, getRetrogradeStatus } = require("./planetStrengthService");
const { getAspects } = require("./drishtiService");

const ANALYSIS_VERSION = 1;

/**
 * @param {Object} params
 * @param {Object} params.chart output of calculateVedicChart
 * @param {Date} [params.utcDate] birth instant, needed for retrograde motion
 * @returns {Object|null}
 */
const buildVedicAnalysis = ({ chart, utcDate } = {}) => {
  if (!chart || !chart.planets || typeof chart.planets !== "object") return null;

  const planetLongitudes = Object.fromEntries(
    Object.entries(chart.planets)
      .filter(([, data]) => data && Number.isFinite(data.longitude))
      .map(([name, data]) => [name, data.longitude]),
  );
  if (Object.keys(planetLongitudes).length === 0) return null;

  // Retrograde status is the only piece that needs the ephemeris, so it is
  // optional: without a date the analysis is still valid, just without that one
  // flag. Rule 6.1's multiplier depends on it, so the absence is recorded
  // rather than silently treated as "not retrograde".
  const retrograde = utcDate instanceof Date && !Number.isNaN(utcDate.getTime())
    ? getRetrogradeStatus(utcDate)
    : null;

  const strength = assessChartStrength({ planetLongitudes, retrograde: retrograde || {} });
  const vargas = describeVargas({ planets: chart.planets });
  const d1d9 = d1D9Comparison({ planets: chart.planets });
  const aspects = getAspects({ planets: planetLongitudes });

  // Rule 13.10 is explicitly a Moon practice, so the shadvarga block is only
  // meaningful when the Moon is present.
  const moonShadvarga = shadvargaAssessment({ planets: chart.planets });

  // Conjunction groups: planets sharing a sign. Corpus 32.1 makes a conjoined
  // planet's counting behaviour depend on its companions, so grouping is
  // reported explicitly rather than left implicit in the aspect graph.
  const bySign = {};
  for (const [name, lon] of Object.entries(planetLongitudes)) {
    const sign = getRashi(lon);
    (bySign[sign] = bySign[sign] || []).push(name);
  }
  const conjunctions = Object.entries(bySign)
    .filter(([, names]) => names.length > 1)
    .map(([sign, names]) => ({ sign, planets: names }));

  return {
    version: ANALYSIS_VERSION,
    precision: chart.precision || null,
    // True when retrograde motion could not be computed, so a consumer knows a
    // strength multiplier is incomplete rather than assuming "not retrograde".
    retrogradeStatusAvailable: Boolean(retrograde),
    planets: strength,
    vargas,
    d1d9,
    moonShadvarga,
    conjunctions,
    aspects: aspects
      ? {
        byPlanet: Object.fromEntries(
          Object.entries(aspects.byPlanet).map(([name, info]) => [
            name,
            { rashi: info.rashi, signLord: info.signLord, nakshatraLord: info.nakshatraLord },
          ]),
        ),
        graph: Object.fromEntries(
          Object.entries(aspects.aspecting).map(([name, block]) => [
            name,
            block.to.map((edge) => ({
              planet: edge.planet,
              darga: edge.darga,
              name: edge.name,
              mutual: Boolean(edge.mutual),
              source: edge.source,
            })),
          ]),
        ),
      }
      : null,
    // House lord map, so callers do not each re-derive it. Requires an
    // Ascendant, which needs both birth time and location.
    houseLords: Number.isFinite(chart.ascendant?.longitude)
      ? buildHouseLords(chart.ascendant.longitude)
      : null,
    provenance: {
      // Stated by the corpus.
      corpusRules: ["1.3", "1.4", "4.8", "6.1", "6.3", "6.4", "6.5", "7.3", "10.3", "13.4", "13.6", "13.10", "14.9", "32.1"],
      // Standard Parashari practice, not stated by the corpus.
      convention: [
        "7-fold drishti distances other than the 7th (corpus states only the 7th, in 13.13)",
        "numeric combustion limits (corpus 4.8 gives only the relational pattern)",
        "varga mappings for D1-D60 (corpus 13.4 names D1/D9/D12/D30 as the load-bearing divisions)",
      ],
      note: "D1 is primary; divisional charts are supplementary confirmation only (corpus 6.5).",
    },
  };
};

/**
 * Sign lord for each of the 12 houses, from the Ascendant.
 */
const buildHouseLords = (ascendantLongitude) => {
  if (!Number.isFinite(ascendantLongitude)) return null;
  const ascendantSign = signIndexOf(ascendantLongitude);
  return Object.fromEntries(
    RASHIS.map((sign, offset) => {
      const house = ((offset - ascendantSign + 12) % 12) + 1;
      return [house, { sign, lord: RASHI_LORDS[sign] }];
    }),
  );
};

/**
 * A compact view of the analysis, sized for an LLM prompt.
 *
 * The full block is far too large to send verbatim — the aspect graph alone can
 * run to hundreds of edges. This keeps what the model actually needs to ground
 * an answer, and drops everything else:
 *
 *   - strongest / weakest planets by rule 6.1 multiplier, so the model can lead
 *     with the chart's clearest fact rather than narrating all nine bodies
 *   - every planet that is combust, retrograde or vargottama (each of which has
 *     a distinct corpus reading)
 *   - the D1/D9 classification per planet (rule 14.9)
 *   - the Moon's shadvarga verdict (rule 13.10)
 *   - conjunction groups
 *   - provenance, so the model can tell corpus rules from convention
 *
 * House lords are included only when an Ascendant exists, and the precision is
 * carried through so the model can see when houses are unavailable.
 */
const summarizeVedicAnalysis = (analysis) => {
  if (!analysis || !analysis.planets || typeof analysis.planets !== "object") return null;

  const blocks = Object.entries(analysis.planets)
    .filter(([, block]) => block && typeof block === "object" && block.score)
    .map(([name, block]) => ({ name, block }));
  // An analysis with no usable planet blocks carries no information, so it is
  // reported as absent rather than as a summary of nothing.
  if (blocks.length === 0) return null;

  const ranked = [...blocks].sort((a, b) => b.block.score.multiplier - a.block.score.multiplier);
  const summarise = ({ name, block }) => ({
    planet: name,
    rashi: block.rashi,
    dignity: block.dignity,
    multiplier: block.score.multiplier,
    states: (block.score.applied || []).map((a) => a.state),
  });

  const notable = blocks
    .filter(({ block }) => block.retrograde || block.combustion?.isCombust || block.flags?.isVargottama)
    .map(({ name, block }) => ({
      planet: name,
      retrograde: block.retrograde,
      combust: block.combustion.isCombust,
      vargottama: block.flags.isVargottama,
      ...(block.combustion.isCombust
        ? {
          combustion: {
            distanceFromSun: block.combustion.distanceFromSun,
            relationToSun: block.combustion.relationToSun,
            degreeOrder: block.combustion.degreeOrder,
          },
        }
        : {}),
    }));

  return {
    precision: analysis.precision ?? null,
    retrogradeStatusAvailable: Boolean(analysis.retrogradeStatusAvailable),
    strongest: ranked.slice(0, 3).map(summarise),
    weakest: ranked.slice(-3).reverse().map(summarise),
    notable,
    d1d9: analysis.d1d9 || null,
    moonShadvarga: analysis.moonShadvarga || null,
    conjunctions: analysis.conjunctions || [],
    houseLords: analysis.houseLords || null,
    provenance: analysis.provenance || null,
  };
};

module.exports = {
  buildVedicAnalysis,
  buildHouseLords,
  summarizeVedicAnalysis,
  ANALYSIS_VERSION,
};
