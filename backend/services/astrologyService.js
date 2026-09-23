// Western (tropical) zodiac calculations and sign-to-sign compatibility.
//
// Scope note: this implements sun-sign astrology, which only needs a birth
// date. True Vedic/nakshatra matching (Ashtakoot/Guna Milan) needs an
// ephemeris + exact birth time/place to compute the moon's position and is
// out of scope here. `moonSign` and `nakshatra` on the Horoscope model are
// optional, user-supplied fields for future use and are not required for
// the compatibility score below.

const Astronomy = require("astronomy-engine");

const ZODIAC_SIGNS = [
  { name: "Capricorn", element: "earth", modality: "cardinal", rulingPlanet: "Saturn", start: [12, 22], end: [1, 19] },
  { name: "Aquarius", element: "air", modality: "fixed", rulingPlanet: "Saturn / Uranus", start: [1, 20], end: [2, 18] },
  { name: "Pisces", element: "water", modality: "mutable", rulingPlanet: "Jupiter / Neptune", start: [2, 19], end: [3, 20] },
  { name: "Aries", element: "fire", modality: "cardinal", rulingPlanet: "Mars", start: [3, 21], end: [4, 19] },
  { name: "Taurus", element: "earth", modality: "fixed", rulingPlanet: "Venus", start: [4, 20], end: [5, 20] },
  { name: "Gemini", element: "air", modality: "mutable", rulingPlanet: "Mercury", start: [5, 21], end: [6, 20] },
  { name: "Cancer", element: "water", modality: "cardinal", rulingPlanet: "Moon", start: [6, 21], end: [7, 22] },
  { name: "Leo", element: "fire", modality: "fixed", rulingPlanet: "Sun", start: [7, 23], end: [8, 22] },
  { name: "Virgo", element: "earth", modality: "mutable", rulingPlanet: "Mercury", start: [8, 23], end: [9, 22] },
  { name: "Libra", element: "air", modality: "cardinal", rulingPlanet: "Venus", start: [9, 23], end: [10, 22] },
  { name: "Scorpio", element: "water", modality: "fixed", rulingPlanet: "Mars / Pluto", start: [10, 23], end: [11, 21] },
  { name: "Sagittarius", element: "fire", modality: "mutable", rulingPlanet: "Jupiter", start: [11, 22], end: [12, 21] },
];

const SIGN_LOOKUP = Object.fromEntries(ZODIAC_SIGNS.map((sign) => [sign.name, sign]));
const ZODIAC_SIGN_NAMES = ZODIAC_SIGNS.map((sign) => sign.name);
const SIGN_ORDER = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

const getSignFromLongitude = (longitude) => {
  if (!Number.isFinite(longitude)) return null;
  return SIGN_ORDER[Math.floor((((longitude % 360) + 360) % 360) / 30)];
};

const normalizeTimeOfBirth = (timeOfBirth) => {
  if (timeOfBirth === undefined || timeOfBirth === null || String(timeOfBirth).trim() === "") {
    return null;
  }

  const value = String(timeOfBirth).trim();

  // 24-hour format: HH:mm
  const twentyFourHour = value.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    const hours = Number(twentyFourHour[1]);
    const minutes = Number(twentyFourHour[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  // 12-hour format: h:mm AM/PM (also accepts am/pm and an optional space)
  const twelveHour = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2]);
    const meridiem = twelveHour[3].toUpperCase();

    if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
      if (meridiem === "AM") {
        if (hours === 12) hours = 0;
      } else if (hours !== 12) {
        hours += 12;
      }
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  return null;
};

const getBirthDateTime = (dateOfBirth, timeOfBirth, timeZoneOffsetMinutes = 0) => {
  const date = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(date.getTime())) return null;

  const normalizedTime = normalizeTimeOfBirth(timeOfBirth) || "12:00";
  const [hours, minutes] = normalizedTime.split(":").map(Number);
  const localTime = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hours,
    minutes
  );
  const result = new Date(localTime - (Number(timeZoneOffsetMinutes) || 0) * 60 * 1000);
  return Number.isNaN(result.getTime()) ? null : result;
};

const calculateNatalChart = ({ dateOfBirth, timeOfBirth, timeZoneOffsetMinutes, moonSign } = {}) => {
  const date = getBirthDateTime(dateOfBirth, timeOfBirth, timeZoneOffsetMinutes);
  if (!date) return { sunSign: null, moonSign: moonSign || null, precision: "unavailable" };

  const sunLongitude = Astronomy.SunPosition(date).elon;
  const moonLongitude = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Moon, date, true)).elon;
  return {
    sunSign: getSignFromLongitude(sunLongitude),
    moonSign: getSignFromLongitude(moonLongitude) || moonSign || null,
    sunLongitude,
    moonLongitude,
    precision: timeOfBirth ? "birth-time" : "date-only-estimate",
  };
};

// Returns the tropical zodiac sign name for a given Date (or date-like value).
const getZodiacSign = (dateOfBirth) => {
  const date = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(date.getTime())) return null;

  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  const sign = ZODIAC_SIGNS.find(({ start, end }) => {
    const [startMonth, startDay] = start;
    const [endMonth, endDay] = end;
    if (startMonth === endMonth) return month === startMonth && day >= startDay && day <= endDay;
    // Ranges that wrap across the new year (Capricorn: Dec 22 - Jan 19)
    if (startMonth > endMonth) {
      return (month === startMonth && day >= startDay) || (month === endMonth && day <= endDay);
    }
    return (month === startMonth && day >= startDay) || (month === endMonth && day <= endDay) || (month > startMonth && month < endMonth);
  });

  return sign ? sign.name : null;
};

const getSignInfo = (signName) => SIGN_LOOKUP[signName] || null;

// Classic element-pair compatibility, expressed with the same level
// vocabulary the questionnaire-based compatibilityService uses, so both
// can be merged into a single report.
const ELEMENT_COMPATIBILITY = {
  "fire-fire": "Very Compatible",
  "earth-earth": "Very Compatible",
  "air-air": "Very Compatible",
  "water-water": "Very Compatible",
  "fire-air": "Good Alignment",
  "earth-water": "Good Alignment",
  "fire-earth": "Some Differences",
  "fire-water": "Some Differences",
  "air-earth": "Some Differences",
  "air-water": "Some Differences",
};

const elementPairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

const ELEMENT_DESCRIPTIONS = {
  fire: "passionate, spontaneous, and action-driven",
  earth: "grounded, practical, and stability-seeking",
  air: "social, idea-driven, and communicative",
  water: "emotional, intuitive, and deeply feeling",
};

const buildDescription = (signA, infoA, signB, infoB, level) => {
  const same = infoA.element === infoB.element;
  const base = same
    ? `${signA} and ${signB} share the same ${infoA.element} element, both being ${ELEMENT_DESCRIPTIONS[infoA.element]}.`
    : `${signA} (${infoA.element}) and ${signB} (${infoB.element}) bring different energies: ${ELEMENT_DESCRIPTIONS[infoA.element]} meets ${ELEMENT_DESCRIPTIONS[infoB.element]}.`;

  if (level === "Very Compatible") return `${base} This is traditionally seen as a naturally harmonious pairing.`;
  if (level === "Good Alignment") return `${base} These elements traditionally energize and balance one another well.`;
  return `${base} This pairing traditionally benefits from conscious effort to bridge the different temperaments.`;
};

const getAspectScore = (firstLongitude, secondLongitude) => {
  if (!Number.isFinite(firstLongitude) || !Number.isFinite(secondLongitude)) return null;
  const rawDistance = Math.abs(firstLongitude - secondLongitude) % 360;
  const distance = Math.min(rawDistance, 360 - rawDistance);
  const aspects = [
    { name: "Conjunction", angle: 0, orb: 10, score: 0.9 },
    { name: "Sextile", angle: 60, orb: 6, score: 0.8 },
    { name: "Square", angle: 90, orb: 7, score: 0.45 },
    { name: "Trine", angle: 120, orb: 8, score: 0.9 },
    { name: "Opposition", angle: 180, orb: 8, score: 0.5 },
  ];
  const aspect = aspects.find((item) => Math.abs(distance - item.angle) <= item.orb);
  return aspect
    ? { ...aspect, distance: Math.round(distance * 10) / 10 }
    : { name: "No major aspect", distance: Math.round(distance * 10) / 10, score: 0.65 };
};

// Compares two sun signs and returns a category result in the same shape
// ({ level, description }) used elsewhere in the compatibility report.
const calculateZodiacCompatibility = (signA, signB) => {
  const infoA = getSignInfo(signA);
  const infoB = getSignInfo(signB);

  if (!infoA || !infoB) {
    return { level: "Some Differences", score: 0.35, description: "Zodiac compatibility could not be determined from the information provided." };
  }

  if (signA === signB) {
    return {
      level: "Very Compatible",
      score: 1,
      description: `Both are ${signA}, giving them an intuitive understanding of each other's instincts, though sharing the same weaknesses can occasionally amplify them.`,
    };
  }

  const level = ELEMENT_COMPATIBILITY[elementPairKey(infoA.element, infoB.element)] || "Some Differences";
  const description = buildDescription(signA, infoA, signB, infoB, level);

  return { level, score: level === "Very Compatible" ? 1 : level === "Good Alignment" ? 0.75 : 0.35, description };
};

const calculateAstrologyCompatibility = (chartA, chartB) => {
  const sun = calculateZodiacCompatibility(chartA?.sunSign, chartB?.sunSign);
  const moon = chartA?.moonSign && chartB?.moonSign ? calculateZodiacCompatibility(chartA.moonSign, chartB.moonSign) : null;
  const sunMoonAspect = getAspectScore(chartA?.sunLongitude, chartB?.moonLongitude);
  const moonSunAspect = getAspectScore(chartA?.moonLongitude, chartB?.sunLongitude);
  const components = [
    { score: sun.score, weight: 0.45 },
    { score: moon?.score ?? 0.6, weight: 0.35 },
    { score: ((sunMoonAspect?.score ?? 0.65) + (moonSunAspect?.score ?? 0.65)) / 2, weight: 0.2 },
  ];
  const score = components.reduce((total, item) => total + item.score * item.weight, 0);
  const level = score >= 0.82 ? "Very Compatible" : score >= 0.62 ? "Good Alignment" : "Some Differences";
  const details = [
    `${chartA.sunSign} and ${chartB.sunSign} sun signs show ${sun.level.toLowerCase()}.`,
    moon ? `${chartA.moonSign} and ${chartB.moonSign} moon signs show ${moon.level.toLowerCase()}.` : "Moon-sign comparison is estimated because one or both birth charts lack moon-sign data.",
  ];
  if (sunMoonAspect && moonSunAspect) details.push(`Cross-chart dynamics include ${sunMoonAspect.name.toLowerCase()} and ${moonSunAspect.name.toLowerCase()} contacts.`);
  return {
    level,
    score,
    description: details.join(" "),
    details,
    chartA: { sunSign: chartA.sunSign, moonSign: chartA.moonSign, precision: chartA.precision },
    chartB: { sunSign: chartB.sunSign, moonSign: chartB.moonSign, precision: chartB.precision },
  };
};

module.exports = {
  ZODIAC_SIGN_NAMES,
  getZodiacSign,
  getSignInfo,
  getSignFromLongitude,
  calculateNatalChart,
  normalizeTimeOfBirth,
  calculateZodiacCompatibility,
  calculateAstrologyCompatibility,
};
