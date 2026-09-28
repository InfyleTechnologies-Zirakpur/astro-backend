// Varga (divisional chart) engine.
//
// SCOPE — read this before wiring anything to the UI.
//
// The course corpus is explicitly CAUTIONARY about divisional charts, and this
// engine follows that stance rather than fighting it:
//   - Rule 13.4: "The teacher warns against over-relying on a separate
//     divisional-chart apparatus that was built later by modern astrologers...
//     one should rather see the Lagna and the relevant divisional sign and ask
//     what the house/planet/strength means in that division, not create a whole
//     new mythology around each divisional chart." He names D1, D9, D12 and D30
//     as the divisions that actually matter.
//   - Rule 14.9: Navamsha is essential because it is the "inner" layer, but "a
//     planet weak in D1 but strong in D9 is still not 'good' in the external
//     world". D1 and D9 are read TOGETHER, never instead of each other.
//   - Rule 13.10: the concrete practice he gives is a SIX-division check on the
//     MOON specifically (D1, D2, D3, D9, D12, D30) — strong in most divisions
//     indicates a stable emotional life and better marital outcome.
//
// So this module deliberately produces VARGAS = a divisional SIGN + strength
// flags per planet. It does NOT build a second Ascendant, a second house system,
// or per-varga lagna lord sets. Doing that would be exactly the "whole new
// mythology" rule 13.4 warns against, and it is also the thing that would turn
// the stored chart blob into tens of KB per person.
//
// WHERE THE RULES COME FROM (the two are not the same thing):
//   - The divisional MAPPING below is the standard Parashari scheme, which is
//     general Jyotish practice, NOT something the transcript teaches.
//   - The INTERPRETATION layer (shadvargaAssessment, d1D9Comparison) cites
//     corpus rule IDs and is what the AI Q&A is allowed to speak from.
// Rule 6.4 also makes vargottama a dignity input ("if a malefic planet is
// itself exalted, in own sign, in moolatrikona, or vargottama, it loses its
// malefic quality for this purpose"), which is why it is computed here.

const { RASHIS, signIndexOf, degreeInSign, getRashi, EXALTATION, DEBILITATION, RASHI_LORDS, MOOLATRIKONA } = require("./vedicAstrologyService");

const wrap = (index, modulo) => ((index % modulo) + modulo) % modulo;
const indexToSign = (index) => RASHIS[wrap(index, 12)];

// SUPPORTED dargas, and why the list is short.
//
// Divisional charts are NOT all built on one rule, and the differences are
// exactly where implementations usually go wrong. A generic "divide into n parts
// and step one sign" rule is wrong for most of them:
//
//   D9  unit step, but the START depends on modality (movable/fixed/dual).
//   D3, D7  stride 4, with the starting offset AND DIRECTION depending on
//       modality: movable offsets 0,4,8...; fixed 8,4,0...; dual 4,8,0...
//       These are NOT the D9 rule, so they must not share it.
//   D4, D16, D20  unit steps in the parts but a STRIDE of 3 signs per part:
//       at Leo 20deg D4 is Leo+6 = Libra, where a unit step would wrongly give
//       Leo+2.
//   D6, D12, D24, D40, D45  plain unit steps, no modality offset.
//   D2, D10, D30, D60  irregular, handled explicitly.
//
// For the remaining divisions (D5, D8, D11, D13-D15, D17-D19, D21-D23, D25-D26,
// D28-D29, D31-D39, D41-D44, D46-D59) there is no single uncontested Parashari
// assignment, and sources differ. Rather than emit a plausible-looking but wrong
// sign — which is far worse than admitting ignorance in a product that makes
// predictions — getVargaSign returns null for those and SUPPORTED_DARGAS records
// what is actually implemented.
//
// This also matches the stance of corpus rule 13.4, which names D1, D9, D12 and
// D30 as the divisions that actually carry weight, and warns against building a
// full separate mythology around all 60.
const STRIDED_VARGAS = {
  3: { divisions: 3, stride: 4, modality: true },
  4: { divisions: 4, stride: 3, modality: false },
  6: { divisions: 6, stride: 1, modality: false },
  7: { divisions: 7, stride: 4, modality: true },
  12: { divisions: 12, stride: 1, modality: false },
  16: { divisions: 16, stride: 3, modality: false },
  20: { divisions: 20, stride: 3, modality: false },
  24: { divisions: 24, stride: 1, modality: false },
  40: { divisions: 40, stride: 1, modality: false },
  45: { divisions: 45, stride: 1, modality: false },
};

// Darga numbers this engine will answer for. Anything else returns null.
const SUPPORTED_DARGAS = new Set([1, 2, 3, 4, 6, 7, 9, 10, 12, 16, 20, 24, 30, 40, 45, 60]);

// Fixed = index 1,5,9 in the repeating movable/fixed/dual cycle.
//   D9: unit steps, offset 0 / 8 / 4 for movable / fixed / dual.
//   D3, D7: stride 4, and fixed signs run the sequence BACKWARDS.
const MODALITY_START = { 0: 0, 1: 8, 2: 4 };
const modalityOf = (signIndex) => signIndex % 3;
const modalityStartOffset = (signIndex) => MODALITY_START[modalityOf(signIndex)];

// Darga numbers worth surfacing in a response. This is the set corpus rule
// 13.10 actually asks for on the Moon (D1, D2, D3, D9, D12, D30) plus D10,
// which is in wide practical use.
const PRIMARY_VARGAS = [1, 2, 3, 9, 10, 12, 30];

// D10 (Dasamsa) counts in REVERSE from even signs. This is the classic
// gotcha: odd signs advance, even signs go backwards.
const DASAMSHA_REVERSE_SIGNS = new Set(["Taurus", "Cancer", "Virgo", "Scorpio", "Pisces"]);

// D2 (Hora): the two halves of every sign belong to the Sun and Moon, entirely
// independent of which sign it is.
const HORA_SUN_SIGN = "Leo";
const HORA_MOON_SIGN = "Cancer";

// D30 (Trimsamsa) — the one genuinely uneven scheme: five unequal bands owned by
// five different grahas, and the assignment differs for odd vs even signs.
// [maxDegreeExclusive, owning graha, resulting sign]
const TRIMSAMSA_ODD = [
  [5, "Mars", "Aries"],
  [10, "Saturn", "Aquarius"],
  [18, "Jupiter", "Sagittarius"],
  [25, "Mercury", "Gemini"],
  [30, "Venus", "Libra"],
];
const TRIMSAMSA_EVEN = [
  [5, "Saturn", "Aquarius"],
  [12, "Jupiter", "Sagittarius"],
  [20, "Mercury", "Gemini"],
  [25, "Venus", "Taurus"],
  [30, "Mars", "Scorpio"],
];

/**
 * The divisional (varga) sign for one sidereal longitude.
 *
 * @param {number} siderealLongitude
 * @param {number} darga - 1..60
 * @returns {string|null} sign name, or null for an out-of-range darga
 */
const getVargaSign = (siderealLongitude, darga) => {
  if (!Number.isFinite(siderealLongitude)) return null;
  if (typeof darga !== "number" || !Number.isInteger(darga) || darga < 1 || darga > 60) return null;
  if (!SUPPORTED_DARGAS.has(darga)) return null;
  const n = darga;

  const signIndex = signIndexOf(siderealLongitude);
  const sign = RASHIS[signIndex];
  const degree = degreeInSign(siderealLongitude);

  // D1 is the chart itself.
  if (n === 1) return sign;

  // D2 Hora — Sun's half, Moon's half, regardless of the sign.
  if (n === 2) return degree < 15 ? HORA_SUN_SIGN : HORA_MOON_SIGN;

  // D30 Trimsamsa — unequal five-band rule, mirrored for even signs.
  if (n === 30) {
    const table = DASAMSHA_REVERSE_SIGNS.has(sign) ? TRIMSAMSA_EVEN : TRIMSAMSA_ODD;
    const band = table.find(([max]) => degree < max);
    return band ? band[2] : TRIMSAMSA_ODD[TRIMSAMSA_ODD.length - 1][2];
  }

  // D60 Shashtiamsa — 60 bands of 0.5 deg, each mapping to the next sign, so
  // the cycle wraps twice across a 30-degree sign.
  if (n === 60) return indexToSign(signIndex + Math.floor(degree * 2));

  // D10 Dasamsa — 10 bands of 3 deg, advancing from odd signs and RETROGRADING
  // from even signs.
  if (n === 10) {
    const part = Math.floor(degree / 3);
    return indexToSign(DASAMSHA_REVERSE_SIGNS.has(sign) ? signIndex - part : signIndex + part);
  }

  // The rest divide the sign into n equal parts. The part index is clamped to
  // n-1 so a longitude sitting exactly on the 30-degree boundary (which floats
  // up to 30 in some code paths) cannot spill into the next sign's first band.
  const part = Math.min(Math.floor((degree * n) / 30), n - 1);

  // D9 advances one sign per part from the modality start.
  if (n === 9) return indexToSign(signIndex + modalityStartOffset(signIndex) + part);

  const { stride, modality } = STRIDED_VARGAS[n];
  if (modality) {
    // D3 and D7: fixed signs run the stride-4 sequence backwards.
    const direction = modalityOf(signIndex) === 1 ? -1 : 1;
    const start = modalityStartOffset(signIndex);
    return indexToSign(signIndex + start + stride * part * direction);
  }
  return indexToSign(signIndex + stride * part);
};

/**
 * Every varga sign for one longitude.
 * @returns {Object<number, string>} { "1": "Leo", "2": "Leo", ... } keyed as strings
 */
const calculateVargas = (siderealLongitude) => {
  const out = {};
  for (const n of SUPPORTED_DARGAS) {
    const sign = getVargaSign(siderealLongitude, n);
    if (sign) out[n] = sign;
  }
  return out;
};

/**
 * Vargottama: a planet in the SAME sign in D1 and D9 is said to be
 * vargottama — strong, because it is not weakened by the division. This is a
 * well-known technique and rule 6.4 makes it an explicit dignity input.
 */
const isVargottama = (siderealLongitude) => {
  const d1 = getVargaSign(siderealLongitude, 1);
  const d9 = getVargaSign(siderealLongitude, 9);
  return Boolean(d1 && d9 && d1 === d9);
};

/**
 * Per-planet varga block: the divisional signs we actually surface, plus the
 * two flags other services consume (vargottama, and a compact dignity label
 * used by planetStrengthService and the rule engine).
 */
const describeVargas = ({ planets } = {}) => {
  if (!planets || typeof planets !== "object") return null;

  return Object.fromEntries(
    Object.entries(planets).map(([name, data]) => {
      const longitude = data?.longitude;
      if (!Number.isFinite(longitude)) return [name, null];

      const vargas = Object.fromEntries(
        PRIMARY_VARGAS.map((n) => [String(n), getVargaSign(longitude, n)])
      );
      const d1 = vargas["1"];
      const d9 = vargas["9"];

      return [
        name,
        {
          vargas,
          isVargottama: isVargottama(longitude),
          // Rule 14.9: read D1 and D9 together. "A planet weak in D1 but strong
          // in D9 is still not 'good' in the external world... Conversely, a
          // planet weak in D9 but strong in D1 may act outwardly well but lack
          // inner stability." So these are reported as a pair, never collapsed.
          d1d9: {
            d1,
            d9,
            strongInD1: isStrongIn(d1, name),
            strongInD9: isStrongIn(d9, name),
          },
        },
      ];
    })
  );
};

// Whether a sign is a good sign for a graha: own sign, exaltation, or
// moolatrikona. Deliberately permissive about rulership elsewhere but strict
// here — "strong" in a varga means dignified, not merely non-malefic.
const isStrongIn = (sign, planet) => {
  if (!sign || !planet) return false;
  if (RASHI_LORDS[sign] === planet) return true;
  if (EXALTATION[planet] === sign) return true;
  if (MOOLATRIKONA[planet] === sign) return true;
  return false;
};

/**
 * Rule 13.10 — the six-division check on the MOON.
 *
 * "He mentions the principle of checking the Moon across the six main
 * divisional charts (D1, D2, D3, D9, D12, D30)... If the Moon is strong in most
 * of these divisions, it is a sign of stable, coherent personality and a
 * stronger chance of marital success. If the Moon is weak in multiple
 * divisions, the native's emotional life and marriage stability tend to suffer."
 *
 * Only the Moon's divisional signs are needed, and the Moon is the one planet
 * available at date-only precision — so this deliberately works without an
 * Ascendant.
 */
const shadvargaAssessment = (chart) => {
  const moonLongitude = chart?.planets?.Moon?.longitude ?? chart?.moonLongitude;
  if (!Number.isFinite(moonLongitude)) return null;

  const divisions = [1, 2, 3, 9, 12, 30].map((n) => {
    const sign = getVargaSign(moonLongitude, n);
    const strong = isStrongIn(sign, "Moon");
    return {
      darga: `D${n}`,
      sign,
      strong,
      dignity: strong
        ? sign === MOOLATRIKONA.Moon
          ? "moolatrikona"
          : EXALTATION.Moon === sign
            ? "exalted"
            : "own-sign"
        : DEBILITATION.Moon === sign
          ? "debilitated"
          : "neutral",
    };
  });

  const strongCount = divisions.filter((d) => d.strong).length;
  return {
    ruleId: "13.10",
    planet: "Moon",
    divisions,
    strongCount,
    divisionCount: divisions.length,
    verdict:
      strongCount >= 4
        ? "strong-in-most-divisions"
        : strongCount <= 2
          ? "weak-in-multiple-divisions"
          : "mixed",
    note:
      strongCount >= 4
        ? "The Moon is well dignified across the six main divisions — per Rule 13.10 this indicates a stable, coherent emotional life and supports marital stability."
        : strongCount <= 2
          ? "The Moon is weak across several of the six main divisions — per Rule 13.10 this points to an emotional life and marital stability that need deliberate attention. This is a tendency, not a verdict, and it is read alongside the D1/D9 comparison."
          : "The Moon is dignified in some divisions and not others. Per Rule 13.10 this is a mixed indication, so treat it as a tendency in one or two life areas rather than a general verdict.",
  };
};

/**
 * Rule 14.9 — the D1 vs D9 comparison, per planet.
 *
 * "A planet weak in D1 but strong in D9 is still not 'good' in the external
 * world, because it may act with inner intensity or hidden force. Conversely, a
 * planet weak in D9 but strong in D1 may act outwardly well but lack inner
 * stability or depth."
 */
const d1D9Comparison = (chart) => {
  const planets = chart?.planets;
  if (!planets) return null;

  const rows = Object.entries(planets)
    .map(([name, data]) => {
      const longitude = data?.longitude;
      if (!Number.isFinite(longitude)) return null;
      const d1 = getVargaSign(longitude, 1);
      const d9 = getVargaSign(longitude, 9);
      const strongInD1 = isStrongIn(d1, name);
      const strongInD9 = isStrongIn(d9, name);
      return {
        planet: name,
        d1,
        d9,
        strongInD1,
        strongInD9,
        pattern:
          strongInD1 && strongInD9
            ? "strong-both"
            : !strongInD1 && !strongInD9
              ? "weak-both"
              : strongInD1
                ? "outerly-strong-inner-weak"
                : "outerly-weak-inner-strong",
      };
    })
    .filter(Boolean);

  if (!rows.length) return null;

  return {
    ruleId: "14.9",
    planets: rows,
    note: "Per Rule 14.9, D1 and D9 are read together, never instead of each other: outwardly-strong/inner-weak planets act well in practice but lack depth, and outwardly-weak/inner-strong planets carry hidden or redirected force.",
  };
};

module.exports = {
  PRIMARY_VARGAS,
  getVargaSign,
  calculateVargas,
  isVargottama,
  describeVargas,
  shadvargaAssessment,
  d1D9Comparison,
  // the divisions this engine will answer for; anything else returns null
  SUPPORTED_DARGAS,
  // exported for the test suite so the sign tables can be asserted directly
  TRIMSAMSA_ODD,
  TRIMSAMSA_EVEN,
  STRIDED_VARGAS,
};
