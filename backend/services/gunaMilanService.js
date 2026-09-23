// Ashtakoot Guna Milan — the classical 36-point Vedic marriage-compatibility
// system, computed from each partner's Moon Rashi and Nakshatra (pada).
// This is the standard system referenced by every matrimonial astrology
// app/API (see the comparison you were shown earlier — Prokerala,
// AstrologyAPI.com, etc. all expose this same 8-factor system).
//
// Inputs: each partner's Moon sidereal longitude (from vedicAstrologyService).
// Everything below is derived from that single figure per partner — Varna,
// Vashya, Tara, Yoni, Graha Maitri, Gana, Bhakoot, and Nadi.

const { RASHIS, getRashi, getNakshatra } = require("./vedicAstrologyService");

// --- 1. Varna (1 point max) — spiritual/temperament tier by Moon sign ---
const VARNA = {
  Cancer: "Brahmin", Scorpio: "Brahmin", Pisces: "Brahmin",
  Leo: "Kshatriya", Sagittarius: "Kshatriya", Aries: "Kshatriya",
  Libra: "Vaishya", Gemini: "Vaishya", Aquarius: "Vaishya",
  Capricorn: "Shudra", Taurus: "Shudra", Virgo: "Shudra",
};
const VARNA_RANK = { Brahmin: 4, Kshatriya: 3, Vaishya: 2, Shudra: 1 };
const scoreVarna = (rashiA, rashiB) => {
  const varnaA = VARNA[rashiA], varnaB = VARNA[rashiB];
  // Full point if bride's varna rank <= groom's (groom's varna should be equal or higher, classically)
  const points = VARNA_RANK[varnaB] >= VARNA_RANK[varnaA] ? 1 : 0;
  return { points, max: 1, varnaA, varnaB };
};

// --- 2. Vashya (2 points max) — mutual control/dominance grouping by Moon sign ---
const VASHYA_GROUP = {
  Aries: "Chatushpada", Taurus: "Chatushpada", Leo: "Chatushpada", latterHalfSagittarius: "Chatushpada", firstHalfCapricorn: "Chatushpada",
  Gemini: "Dwipada", Virgo: "Dwipada", Libra: "Dwipada", firstHalfSagittarius: "Dwipada", latterHalfCapricorn: "Dwipada", Aquarius: "Dwipada",
  Cancer: "Jalachara", Pisces: "Jalachara",
  Scorpio: "Keeta",
};
// Simplified whole-sign grouping (pada-level splits for Sagittarius/Capricorn omitted for simplicity — flagged below)
const VASHYA_SIMPLE = {
  Aries: "Chatushpada", Taurus: "Chatushpada", Leo: "Chatushpada",
  Gemini: "Dwipada", Virgo: "Dwipada", Libra: "Dwipada", Aquarius: "Dwipada",
  Cancer: "Jalachara", Pisces: "Jalachara",
  Scorpio: "Keeta",
  Sagittarius: "Dwipada", Capricorn: "Chatushpada", // approximation, see note below
};
const VASHYA_COMPATIBILITY = {
  // [groupA][groupB] -> points out of 2. Symmetric-ish traditional table, simplified.
  Chatushpada: { Chatushpada: 2, Dwipada: 1, Jalachara: 1, Keeta: 0 },
  Dwipada: { Chatushpada: 1, Dwipada: 2, Jalachara: 1, Keeta: 1 },
  Jalachara: { Chatushpada: 1, Dwipada: 1, Jalachara: 2, Keeta: 0.5 },
  Keeta: { Chatushpada: 0, Dwipada: 1, Jalachara: 0.5, Keeta: 2 },
};
const scoreVashya = (rashiA, rashiB) => {
  const groupA = VASHYA_SIMPLE[rashiA], groupB = VASHYA_SIMPLE[rashiB];
  const points = VASHYA_COMPATIBILITY[groupA]?.[groupB] ?? 1;
  return { points, max: 2, groupA, groupB, note: "Sagittarius/Capricorn use a simplified whole-sign grouping rather than the traditional half-sign (pada) split." };
};

// --- 3. Tara (3 points max) — counted nakshatra distance, both directions ---
const scoreTara = (nakA, nakB) => {
  const countForward = (((nakB.index - nakA.index) % 27) + 27) % 27 + 1; // 1-27
  const countBackward = (((nakA.index - nakB.index) % 27) + 27) % 27 + 1;
  // Classical rule: count from each to the other, reduce mod 9; remainders 3, 5, 7 (0-indexed groups) are inauspicious ("Vipat", "Pratyak", "Naidhana")
  const isAuspicious = (count) => ![3, 5, 7].includes(((count - 1) % 9) + 1);
  const forwardOk = isAuspicious(countForward);
  const backwardOk = isAuspicious(countBackward);
  const points = forwardOk && backwardOk ? 3 : (forwardOk || backwardOk ? 1.5 : 0);
  return { points, max: 3, forwardOk, backwardOk };
};

// --- 4. Yoni (4 points max) — sexual/animal-instinct compatibility by nakshatra ---
const YONI_ANIMAL = [
  "Horse", "Elephant", "Sheep", "Serpent", "Serpent", "Dog", "Cat", "Sheep", "Cat",
  "Rat", "Rat", "Cow", "Buffalo", "Tiger", "Buffalo", "Tiger", "Deer", "Deer",
  "Dog", "Monkey", "Mongoose", "Monkey", "Lion", "Horse", "Lion", "Cow", "Elephant",
];
const YONI_ENEMY_PAIRS = [
  ["Cat", "Rat"], ["Cow", "Tiger"], ["Dog", "Deer"], ["Serpent", "Mongoose"],
  ["Horse", "Buffalo"], ["Lion", "Elephant"], ["Sheep", "Monkey"],
];
const areYoniEnemies = (a, b) => YONI_ENEMY_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const scoreYoni = (nakA, nakB) => {
  const animalA = YONI_ANIMAL[nakA.index], animalB = YONI_ANIMAL[nakB.index];
  let points;
  if (animalA === animalB) points = 4;
  else if (areYoniEnemies(animalA, animalB)) points = 0;
  else points = 2; // different but not enemies — simplified mid-value (traditional table has same-sex vs opposite-sex nuance omitted here)
  return { points, max: 4, animalA, animalB, note: "Simplified: does not distinguish male/female variants of each Yoni animal, which the full traditional table uses for finer scoring." };
};

// --- 5. Graha Maitri (5 points max) — friendship between Moon-sign lords ---
const RASHI_LORDS = { Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon", Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars", Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter" };
const FRIENDSHIP = {
  Sun: { friend: ["Moon", "Mars", "Jupiter"], neutral: ["Mercury"], enemy: ["Venus", "Saturn"] },
  Moon: { friend: ["Sun", "Mercury"], neutral: ["Mars", "Jupiter", "Venus", "Saturn"], enemy: [] },
  Mars: { friend: ["Sun", "Moon", "Jupiter"], neutral: ["Venus", "Saturn"], enemy: ["Mercury"] },
  Mercury: { friend: ["Sun", "Venus"], neutral: ["Mars", "Jupiter", "Saturn"], enemy: ["Moon"] },
  Jupiter: { friend: ["Sun", "Moon", "Mars"], neutral: ["Saturn"], enemy: ["Mercury", "Venus"] },
  Venus: { friend: ["Mercury", "Saturn"], neutral: ["Mars", "Jupiter"], enemy: ["Sun", "Moon"] },
  Saturn: { friend: ["Mercury", "Venus"], neutral: ["Jupiter"], enemy: ["Sun", "Moon", "Mars"] },
};
const relation = (lordA, lordB) => {
  if (lordA === lordB) return "same";
  if (FRIENDSHIP[lordA].friend.includes(lordB)) return "friend";
  if (FRIENDSHIP[lordA].enemy.includes(lordB)) return "enemy";
  return "neutral";
};
const scoreGrahaMaitri = (rashiA, rashiB) => {
  const lordA = RASHI_LORDS[rashiA], lordB = RASHI_LORDS[rashiB];
  const relAB = relation(lordA, lordB), relBA = relation(lordB, lordA);
  const rank = { same: 5, friend: 5, "friend-neutral": 4, neutral: 3, "neutral-enemy": 1.5, enemy: 0 };
  let points;
  if (relAB === "same") points = 5;
  else if (relAB === "friend" && relBA === "friend") points = 5;
  else if ((relAB === "friend" && relBA === "neutral") || (relAB === "neutral" && relBA === "friend")) points = 4;
  else if (relAB === "neutral" && relBA === "neutral") points = 3;
  else if ((relAB === "enemy" && relBA === "neutral") || (relAB === "neutral" && relBA === "enemy")) points = 1;
  else points = 0; // mutual enemy, or friend/enemy mismatch
  return { points, max: 5, lordA, lordB, relAB, relBA };
};

// --- 6. Gana (6 points max) — temperament category by nakshatra ---
const GANA = [
  "Deva", "Manushya", "Rakshasa", "Manushya", "Deva", "Manushya", "Deva", "Deva", "Rakshasa",
  "Rakshasa", "Manushya", "Manushya", "Deva", "Rakshasa", "Deva", "Rakshasa", "Deva", "Rakshasa",
  "Rakshasa", "Manushya", "Deva", "Deva", "Rakshasa", "Rakshasa", "Deva", "Manushya", "Deva",
];
const scoreGana = (nakA, nakB) => {
  const ganaA = GANA[nakA.index], ganaB = GANA[nakB.index];
  let points;
  if (ganaA === ganaB) points = 6;
  else if ((ganaA === "Deva" && ganaB === "Manushya") || (ganaA === "Manushya" && ganaB === "Deva")) points = 5;
  else if ((ganaA === "Manushya" && ganaB === "Rakshasa") || (ganaA === "Rakshasa" && ganaB === "Manushya")) points = 1;
  else points = 0; // Deva-Rakshasa, the most incompatible pairing
  return { points, max: 6, ganaA, ganaB };
};

// --- 7. Bhakoot (7 points max) — Moon-sign distance ---
const scoreBhakoot = (rashiA, rashiB) => {
  const idxA = RASHIS.indexOf(rashiA), idxB = RASHIS.indexOf(rashiB);
  const distAB = (((idxB - idxA) % 12) + 12) % 12 + 1; // 1-12
  const badDistances = [6, 8]; // 6/8 relationship (Shadashtak) and 2/12 relationship
  const badDistances2 = [2, 12];
  const isBad = badDistances.includes(distAB) || badDistances2.includes(distAB) || badDistances.includes(13 - distAB) || badDistances2.includes(13 - distAB);
  const points = isBad ? 0 : 7;
  return { points, max: 7, distanceInSigns: distAB };
};

// --- 8. Nadi (8 points max) — the single most weighted factor; same Nadi is classically inauspicious ---
const NADI = [
  "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi", "Adi", "Madhya", "Antya",
  "Antya", "Madhya", "Adi", "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi",
  "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi", "Adi", "Madhya", "Antya",
];
const scoreNadi = (nakA, nakB) => {
  const nadiA = NADI[nakA.index], nadiB = NADI[nakB.index];
  const points = nadiA === nadiB ? 0 : 8;
  return { points, max: 8, nadiA, nadiB, sameNadiDosha: nadiA === nadiB };
};

// --- Full Guna Milan report ---
// moonLongitudeA / moonLongitudeB: sidereal Moon longitude (degrees) for each partner.
const calculateGunaMilan = (moonLongitudeA, moonLongitudeB) => {
  const rashiA = getRashi(moonLongitudeA), rashiB = getRashi(moonLongitudeB);
  const nakA = getNakshatra(moonLongitudeA), nakB = getNakshatra(moonLongitudeB);

  const varna = scoreVarna(rashiA, rashiB);
  const vashya = scoreVashya(rashiA, rashiB);
  const tara = scoreTara(nakA, nakB);
  const yoni = scoreYoni(nakA, nakB);
  const grahaMaitri = scoreGrahaMaitri(rashiA, rashiB);
  const gana = scoreGana(nakA, nakB);
  const bhakoot = scoreBhakoot(rashiA, rashiB);
  const nadi = scoreNadi(nakA, nakB);

  const totalPoints = varna.points + vashya.points + tara.points + yoni.points + grahaMaitri.points + gana.points + bhakoot.points + nadi.points;
  const maxPoints = 36;

  const doshas = [];
  if (nadi.sameNadiDosha) doshas.push({ name: "Nadi Dosha", severity: "high", note: "Same Nadi for both partners — classically considered the most significant compatibility concern in Ashtakoot matching. Traditionally checked for cancellation factors (e.g., differing Rashi or Rashi lord) before being treated as disqualifying." });
  if (bhakoot.points === 0) doshas.push({ name: "Bhakoot Dosha", severity: "moderate", note: "Moon signs are in a 6/8 or 2/12 relationship — traditionally associated with friction around finances/health, subject to cancellation factors." });
  if (gana.points === 0) doshas.push({ name: "Gana Dosha (Deva-Rakshasa)", severity: "moderate", note: "Most temperament-incompatible Gana pairing." });

  return {
    partnerA: { rashi: rashiA, nakshatra: nakA.name, pada: nakA.pada },
    partnerB: { rashi: rashiB, nakshatra: nakB.name, pada: nakB.pada },
    factors: { varna, vashya, tara, yoni, grahaMaitri, gana, bhakoot, nadi },
    totalPoints: Math.round(totalPoints * 100) / 100,
    maxPoints,
    percentage: Math.round((totalPoints / maxPoints) * 1000) / 10,
    doshas,
    verdict:
      totalPoints >= 28 ? "Excellent match" :
      totalPoints >= 21 ? "Good match" :
      totalPoints >= 18 ? "Average match — proceed with awareness of the specific weak factors" :
      "Below the traditionally recommended minimum (18) — treat as a caution flag, not an automatic rejection, and review dosha cancellation factors",
  };
};

module.exports = { calculateGunaMilan };
