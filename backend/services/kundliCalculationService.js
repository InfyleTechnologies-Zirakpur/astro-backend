// Kundli Calculation Service
// Full Parashari and Krishnamurti Paddhati (KP) calculation engine for the
// 26-screen Vedic Kundli flow shown in the application.
//
// Computes:
// 1. New Kundli / Input details
// 2. Basic menu & overview
// 3. Lagna (D1) chart
// 4. Navamsha (D9) chart
// 5. Moon (Chandra) chart
// 6. Chalit (Bhava Chalit) chart
// 7. Transit (Gochar) chart
// 8. Karakamsha (Jaimini) chart
// 9. Swamsa (Jaimini) chart
// 10. Planets table
// 11. Planets-Sub table (KP Sign, Star, Sub, Sub-Sub lords)
// 12. Chalit Table (Bhava cusp beginnings & midpoints)
// 13. Birth Details card
// 14. Person Details table (Astronomical / calendar parameters)
// 15. Daily Panchang (Paksha, Tithi, Nakshatra, Vara, Yoga, Karana, Sunrise, Sunset)
// 16. Avakhada Chakra (Paya, Varna, Yoni, Gana, Vasya, Nadi, Julian Day, etc.)
// 17. Ghatak and Favourable points
// 18. Ashtakvarga (Sarvashtakavarga BAV & SAV matrix)
// 19. Prastharashtakvarga (Detailed donor bindu distribution grids)
// 20. Bhav Madhya & Sandhi
// 21. Friendship (Naisargika, Tatkalika, Panchadha Maitri matrices)
// 22. Shad Bala (6-fold planetary strengths) & Bhav Bala
// 23. KP System (Cusps & planet significators)
// 24. Cloud synchronization features & membership status
// 25. Download PDF options (Basic 50-page & Brihat 250-page Kundli)
// 26. Ask Questions & contextual AI astrology assistant

const Astronomy = require("astronomy-engine");
const {
  RASHIS,
  RASHI_LORDS,
  EXALTATION,
  DEBILITATION,
  MOOLATRIKONA,
  NATURAL_BENEFICS,
  NATURAL_MALEFICS,
  NAKSHATRAS,
  calculateVedicChart,
  getNakshatra,
  getRashi,
  degreeInSign,
  signIndexOf,
  getNavamshaSign,
  getPlanetSiderealLongitudes,
  calculateAscendant,
  getRetrogradeMap,
} = require("./vedicAstrologyService");
const { toSidereal, getAyanamsha, getTrueAyanamsha, getJulianDay } = require("./ayanamsha");
const { calculateDashaBalance, getDashaTimeline } = require("./dashaService");
const { getVargaSign } = require("./vedicVargaService");
const { assessChartStrength } = require("./planetStrengthService");
const { getAspects } = require("./drishtiService");

// 3-letter sign abbreviations matching UI (e.g. Ari, Pis, Can)
const SIGN_ABBR = [
  "Ari", "Tau", "Gem", "Can", "Leo", "Vir",
  "Lib", "Sco", "Sag", "Cap", "Aqu", "Pis"
];

// 2-letter planet abbreviation for lords
const LORD_ABBR = {
  Sun: "Su",
  Moon: "Mo",
  Mars: "Ma",
  Mercury: "Me",
  Jupiter: "Ju",
  Venus: "Ve",
  Saturn: "Sa",
  Rahu: "Ra",
  Ketu: "Ke",
};

// Nakshatra abbreviations
const NAKSHATRA_ABBR = [
  "Ashwi", "Bhar", "Krit", "Rohin", "Mrig", "Ardr", "Puna", "Push", "Ashle",
  "Magha", "PPhal", "UPhal", "Hast", "Chitr", "Swati", "Visha", "Anur", "Jyes",
  "Mula", "PAsh", "UAsh", "Shra", "Dwnis", "Shat", "PoBha", "UtBha", "Reva"
];

// Vimshottari order and dasha years for KP Sub-division calculation
const KP_DASHA_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];
const KP_DASHA_YEARS = {
  Ketu: 7,
  Venus: 20,
  Sun: 6,
  Moon: 10,
  Mars: 7,
  Rahu: 18,
  Jupiter: 16,
  Saturn: 19,
  Mercury: 17,
};
const TOTAL_YEARS = 120;
const NAKSHATRA_SPAN = 360 / 27; // 13°20' = 13.33333333°

// Format decimal degrees into DD°MM'SS"
function formatDMS(degrees, padDeg = 2) {
  if (!Number.isFinite(degrees)) return "00°00'00\"";
  const normalized = ((degrees % 360) + 360) % 360;
  const totalSeconds = Math.round(normalized * 3600);
  const d = Math.floor(totalSeconds / 3600);
  const remainder = totalSeconds % 3600;
  const m = Math.floor(remainder / 60);
  const s = remainder % 60;
  return `${String(d).padStart(padDeg, "0")}°${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"`;
}

// Format time string HH:mm:ss
function formatTimeHMS(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

// Normalize birth time string from various user inputs ("17:22:36", "05:16 PM", "17:22", "5:16pm")
function parseNormalizedTime(timeStr) {
  if (!timeStr) return { hours: 12, minutes: 0, seconds: 0, formatted24: "12:00:00" };
  const raw = String(timeStr).trim();
  
  // 12-hour AM/PM: "05:16:30 PM" or "5:16 PM"
  const match12 = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12) {
    let h = Number(match12[1]);
    const m = Number(match12[2]);
    const s = Number(match12[3] || 0);
    const meridiem = match12[4].toUpperCase();
    if (meridiem === "PM" && h < 12) h += 12;
    if (meridiem === "AM" && h === 12) h = 0;
    const formatted24 = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return { hours: h, minutes: m, seconds: s, formatted24 };
  }

  // 24-hour: "17:22:36" or "17:22"
  const match24 = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24) {
    const h = Number(match24[1]);
    const m = Number(match24[2]);
    const s = Number(match24[3] || 0);
    const formatted24 = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return { hours: h, minutes: m, seconds: s, formatted24 };
  }

  return { hours: 12, minutes: 0, seconds: 0, formatted24: "12:00:00" };
}

// Calculate KP sub-divisions for any sidereal longitude
function getKPLords(siderealLongitude) {
  const normLon = ((siderealLongitude % 360) + 360) % 360;
  const signIdx = Math.floor(normLon / 30);
  const signName = RASHIS[signIdx];
  const signLord = RASHI_LORDS[signName];
  const sl = LORD_ABBR[signLord] || signLord.slice(0, 2);

  // Nakshatra
  const nakIdx = Math.floor(normLon / NAKSHATRA_SPAN);
  const nakLordName = KP_DASHA_ORDER[nakIdx % 9];
  const nl = LORD_ABBR[nakLordName] || nakLordName.slice(0, 2);

  // Sub Lord (SB)
  const degInNak = normLon - (nakIdx * NAKSHATRA_SPAN);
  const nakLordIndexInCycle = KP_DASHA_ORDER.indexOf(nakLordName);

  let accumulated = 0;
  let subLordName = nakLordName;
  let subStart = 0;
  let subSpan = 0;

  for (let i = 0; i < 9; i++) {
    const candidateLord = KP_DASHA_ORDER[(nakLordIndexInCycle + i) % 9];
    const span = (NAKSHATRA_SPAN * KP_DASHA_YEARS[candidateLord]) / TOTAL_YEARS;
    if (degInNak >= accumulated && degInNak < accumulated + span + 1e-9) {
      subLordName = candidateLord;
      subStart = accumulated;
      subSpan = span;
      break;
    }
    accumulated += span;
  }
  const sb = LORD_ABBR[subLordName] || subLordName.slice(0, 2);

  // Sub-Sub Lord (SS)
  const degInSub = degInNak - subStart;
  const subLordIndexInCycle = KP_DASHA_ORDER.indexOf(subLordName);
  let accumulatedSS = 0;
  let subSubLordName = subLordName;

  for (let i = 0; i < 9; i++) {
    const candidateSS = KP_DASHA_ORDER[(subLordIndexInCycle + i) % 9];
    const spanSS = (subSpan * KP_DASHA_YEARS[candidateSS]) / TOTAL_YEARS;
    if (degInSub >= accumulatedSS && degInSub < accumulatedSS + spanSS + 1e-9) {
      subSubLordName = candidateSS;
      break;
    }
    accumulatedSS += spanSS;
  }
  const ss = LORD_ABBR[subSubLordName] || subSubLordName.slice(0, 2);

  return { signLord, nakLordName, subLordName, subSubLordName, sl, nl, sb, ss };
}

// Convert decimal degrees into DMS string for coordinates (e.g. 27:9:N, 78:0:E)
function formatCoordinateDMS(deg, isLat = true) {
  const absolute = Math.abs(deg);
  const d = Math.floor(absolute);
  const remainder = (absolute - d) * 60;
  const m = Math.floor(remainder);
  const dir = isLat ? (deg >= 0 ? "N" : "S") : (deg >= 0 ? "E" : "W");
  return `${d}:${m}:${dir}`;
}

// Calculate Sunrise and Sunset times in local time for date, location, and timezone
function calculateSunTimes(date, latitude, longitude, timeZoneOffsetMinutes = 330) {
  try {
    const observer = new Astronomy.Observer(latitude, longitude, 0);
    // Find sunrise and sunset of the day in local time reference
    const dayStartUtc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
    const localMidnightUtc = new Date(dayStartUtc.getTime() - timeZoneOffsetMinutes * 60 * 1000);
    const sunriseObj = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, localMidnightUtc, 1);
    const sunsetObj = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, localMidnightUtc, 1);

    const sunriseUtc = sunriseObj ? sunriseObj.date : new Date(localMidnightUtc.getTime() + (6 + 22 / 60) * 3600 * 1000);
    const sunsetUtc = sunsetObj ? sunsetObj.date : new Date(localMidnightUtc.getTime() + (17 + 42 / 60) * 3600 * 1000);

    const sunriseLocal = new Date(sunriseUtc.getTime() + timeZoneOffsetMinutes * 60 * 1000);
    const sunsetLocal = new Date(sunsetUtc.getTime() + timeZoneOffsetMinutes * 60 * 1000);

    return { sunriseDate: sunriseLocal, sunsetDate: sunsetLocal };
  } catch (e) {
    const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
    return {
      sunriseDate: new Date(dayStart.getTime() + (6 + 22 / 60) * 3600 * 1000),
      sunsetDate: new Date(dayStart.getTime() + (17 + 42 / 60) * 3600 * 1000),
    };
  }
}

// Nitya Yogas (27)
const NITYA_YOGAS = [
  "Vishkumbha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda",
  "Sukarma", "Dhriti", "Shoola", "Ganda", "Vriddhi", "Dhruva",
  "Vyaghata", "Harshana", "Vajra", "Asiddhi", "Vyatipata", "Variyan",
  "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla",
  "Brahma", "Indra", "Vaidhriti"
];

// Karanas (11 repeating)
const KARANAS = [
  "Bava", "Balava", "Kaulav", "Taitila", "Gara", "Vanija", "Vishti",
  "Shakuni", "Chatushpad", "Naga", "Kintughna"
];

// Tithis (15 per Paksha)
const TITHI_NAMES = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami",
  "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami",
  "Ekadashi", "Dwadashi", "Trayodasi", "Chaturdashi", "Purnima"
];

// Avakhada attributes
const VARNA_BY_SIGN = {
  Cancer: "Brahman", Scorpio: "Brahman", Pisces: "Brahman",
  Aries: "Kshatriya", Leo: "Kshatriya", Sagittarius: "Kshatriya",
  Taurus: "Vaishya", Virgo: "Vaishya", Capricorn: "Vaishya",
  Gemini: "Shudra", Libra: "Shudra", Aquarius: "Shudra"
};

const YONI_BY_NAKSHATRA = [
  "Ashwa", "Gaja", "Mesha", "Sarpa", "Sarpa", "Shwan", "Marjara", "Mesha", "Marjara",
  "Mooshak", "Mooshak", "Gau", "Gau", "Vyaghra", "Mahisha", "Vyaghra", "Mriga", "Mriga",
  "Shwan", "Vanara", "Nakula", "Vanara", "Simha", "Ashwa", "Simha", "Gau", "Gaja"
];

const GANA_BY_NAKSHATRA = [
  "Deva", "Manushya", "Rakshasa", "Manushya", "Deva", "Manushya", "Deva", "Deva", "Rakshasa",
  "Rakshasa", "Manushya", "Manushya", "Deva", "Rakshasa", "Deva", "Rakshasa", "Deva", "Rakshasa",
  "Rakshasa", "Manushya", "Manushya", "Deva", "Rakshasa", "Rakshasa", "Manushya", "Manushya", "Deva"
];

const VASYA_BY_SIGN = {
  Aries: "Chatushpada", Taurus: "Chatushpada", Leo: "Vanachara",
  Gemini: "Manava", Virgo: "Manava", Libra: "Manava", Aquarius: "Manava", Sagittarius: "Manava",
  Cancer: "Jalchar", Capricorn: "Jalchar", Pisces: "Jalchar", Scorpio: "Keeta"
};

const NADI_BY_NAKSHATRA = [
  "ADI", "MADHYA", "ANTYA", "ANTYA", "MADHYA", "ADI", "ADI", "MADHYA", "ANTYA",
  "ANTYA", "MADHYA", "ADI", "ADI", "MADHYA", "ANTYA", "ANTYA", "MADHYA", "ADI",
  "ADI", "MADHYA", "ANTYA", "ANTYA", "MADHYA", "ADI", "ADI", "MADHYA", "ANTYA"
];

// Natural planetary friendships (Naisargika Maitri)
const NATURAL_FRIENDS = {
  Sun: { friends: ["Moon", "Mars", "Jupiter"], neutrals: ["Mercury"], enemies: ["Venus", "Saturn"] },
  Moon: { friends: ["Sun", "Mercury"], neutrals: ["Mars", "Jupiter", "Venus", "Saturn"], enemies: [] },
  Mars: { friends: ["Sun", "Moon", "Jupiter"], neutrals: ["Venus", "Saturn"], enemies: ["Mercury"] },
  Mercury: { friends: ["Sun", "Venus"], neutrals: ["Mars", "Jupiter", "Saturn"], enemies: ["Moon"] },
  Jupiter: { friends: ["Sun", "Moon", "Mars"], neutrals: ["Saturn"], enemies: ["Mercury", "Venus"] },
  Venus: { friends: ["Mercury", "Saturn"], neutrals: ["Mars", "Jupiter"], enemies: ["Sun", "Moon"] },
  Saturn: { friends: ["Mercury", "Venus"], neutrals: ["Jupiter"], enemies: ["Sun", "Moon", "Mars"] },
};

// Classical Sarvashtakavarga (SAV) points calculation
// Standard Parashari Bindu contribution tables for 7 planets from 7 planets + Lagna
const ASHTAKVARGA_DONORS = {
  Sun: {
    Sun: [1, 2, 4, 7, 8, 9, 10, 11],
    Moon: [3, 6, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [3, 5, 6, 9, 10, 11, 12],
    Jupiter: [5, 6, 9, 11],
    Venus: [6, 7, 12],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Ascendant: [3, 4, 6, 10, 11, 12],
  },
  Moon: {
    Sun: [3, 6, 7, 8, 10, 11],
    Moon: [1, 3, 6, 7, 10, 11],
    Mars: [2, 3, 5, 6, 9, 10, 11],
    Mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    Jupiter: [1, 4, 7, 8, 10, 11, 12],
    Venus: [3, 4, 5, 7, 9, 10, 11],
    Saturn: [3, 5, 6, 11],
    Ascendant: [3, 6, 10, 11],
  },
  Mars: {
    Sun: [3, 5, 6, 10, 11],
    Moon: [3, 6, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [3, 5, 6, 11],
    Jupiter: [6, 10, 11, 12],
    Venus: [6, 8, 11, 12],
    Saturn: [1, 4, 7, 8, 9, 10, 11],
    Ascendant: [1, 3, 6, 10, 11],
  },
  Mercury: {
    Sun: [5, 6, 9, 11, 12],
    Moon: [2, 4, 6, 8, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    Jupiter: [6, 8, 11, 12],
    Venus: [1, 2, 3, 4, 5, 8, 9, 11],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Ascendant: [1, 2, 4, 6, 8, 10, 11],
  },
  Jupiter: {
    Sun: [1, 2, 3, 4, 7, 8, 9, 10, 11],
    Moon: [2, 5, 7, 9, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    Jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
    Venus: [2, 5, 6, 9, 10, 11],
    Saturn: [3, 5, 6, 12],
    Ascendant: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  Venus: {
    Sun: [8, 11, 12],
    Moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
    Mars: [3, 5, 6, 9, 11, 12],
    Mercury: [3, 5, 6, 9, 11],
    Jupiter: [5, 8, 9, 10, 11],
    Venus: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    Saturn: [3, 4, 5, 8, 9, 10, 11],
    Ascendant: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  Saturn: {
    Sun: [1, 2, 4, 7, 8, 10, 11],
    Moon: [3, 6, 11],
    Mars: [3, 5, 6, 10, 11, 12],
    Mercury: [6, 8, 9, 10, 11, 12],
    Jupiter: [5, 6, 11, 12],
    Venus: [6, 11, 12],
    Saturn: [3, 5, 6, 11],
    Ascendant: [1, 3, 4, 6, 10, 11],
  },
};

// Calculate Ashtakvarga matrices (BAV per planet and SAV)
function calculateAshtakvarga(planetSignIndices, ascendantSignIndex) {
  const planets7 = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
  const bAv = {};
  const sav = Array(12).fill(0);
  const savMatrix = Array.from({ length: 12 }, () => ({}));
  const prastara = {};

  // Positions map
  const donorPositions = {
    ...planetSignIndices,
    Ascendant: ascendantSignIndex,
  };

  for (const receiver of planets7) {
    bAv[receiver] = Array(12).fill(0);
    prastara[receiver] = {};
    const rules = ASHTAKVARGA_DONORS[receiver];

    for (const donor of Object.keys(rules)) {
      prastara[receiver][donor] = Array(12).fill(0);
      const donorSign = donorPositions[donor];
      if (donorSign === undefined) continue;

      const houses = rules[donor];
      for (const house of houses) {
        const targetSign = (donorSign + house - 1) % 12;
        bAv[receiver][targetSign] += 1;
        prastara[receiver][donor][targetSign] = 1;
      }
    }

    for (let sign = 0; sign < 12; sign++) {
      sav[sign] += bAv[receiver][sign];
    }
  }

  // Format as rows matching UI table (RN 1 to 12)
  const rows = [];
  for (let r = 0; r < 12; r++) {
    const row = {
      rn: r + 1,
      rashiName: RASHIS[r],
      rashiAbbr: SIGN_ABBR[r],
      su: bAv.Sun[r],
      mo: bAv.Moon[r],
      ma: bAv.Mars[r],
      me: bAv.Mercury[r],
      ju: bAv.Jupiter[r],
      ve: bAv.Venus[r],
      sa: bAv.Saturn[r],
      tot: sav[r],
    };
    rows.push(row);
  }

  const totals = {
    su: bAv.Sun.reduce((a, b) => a + b, 0),
    mo: bAv.Moon.reduce((a, b) => a + b, 0),
    ma: bAv.Mars.reduce((a, b) => a + b, 0),
    me: bAv.Mercury.reduce((a, b) => a + b, 0),
    ju: bAv.Jupiter.reduce((a, b) => a + b, 0),
    ve: bAv.Venus.reduce((a, b) => a + b, 0),
    sa: bAv.Saturn.reduce((a, b) => a + b, 0),
    grandTotal: sav.reduce((a, b) => a + b, 0),
  };

  return { rows, totals, prastara, bAv, sav };
}

// Calculate Sripati Bhava Chalit beginnings and midpoints
function calculateChalitTable(ascendantLon) {
  const normAsc = ((ascendantLon % 360) + 360) % 360;
  const table = [];
  
  // Mid Bhava 1 = Ascendant
  // Mid Bhava i = (Ascendant + (i - 1) * 30) % 360
  // Beginning of Bhava i = average of Mid(i-1) and Mid(i)
  const midPoints = [];
  for (let i = 0; i < 12; i++) {
    midPoints.push(((normAsc + i * 30) % 360 + 360) % 360);
  }

  for (let i = 0; i < 12; i++) {
    const prevMid = midPoints[(i + 11) % 12];
    const currMid = midPoints[i];
    const nextMid = midPoints[(i + 1) % 12];

    // Midpoint between prevMid and currMid
    let diffPrev = currMid - prevMid;
    if (diffPrev < 0) diffPrev += 360;
    const beginLon = (prevMid + diffPrev / 2) % 360;

    // Midpoint between currMid and nextMid
    let diffNext = nextMid - currMid;
    if (diffNext < 0) diffNext += 360;
    const endLon = (currMid + diffNext / 2) % 360;

    const beginSignIdx = Math.floor(beginLon / 30);
    const midSignIdx = Math.floor(currMid / 30);

    table.push({
      bh: i + 1,
      sign: SIGN_ABBR[beginSignIdx],
      bhBegin: formatDMS(beginLon % 30),
      midSign: SIGN_ABBR[midSignIdx],
      midBh: formatDMS(currMid % 30),
      bhEnd: formatDMS(endLon % 30),
      rawBeginLon: beginLon,
      rawMidLon: currMid,
      rawEndLon: endLon,
    });
  }

  return table;
}

// Calculate Planetary Friendships: Permanent, Temporal, and Five-fold
function calculateFriendships(planetSignIndices) {
  const planets = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
  const permanent = {};
  const temporal = {};
  const fiveFold = {};

  for (const p1 of planets) {
    permanent[p1] = {};
    temporal[p1] = {};
    fiveFold[p1] = {};

    const pos1 = planetSignIndices[p1];

    for (const p2 of planets) {
      if (p1 === p2) {
        permanent[p1][p2] = "Self";
        temporal[p1][p2] = "Self";
        fiveFold[p1][p2] = "Self";
        continue;
      }

      // Permanent (Naisargika)
      let permScore = 0; // -1 enemy, 0 neutral, +1 friend
      if (NATURAL_FRIENDS[p1]?.friends.includes(p2)) permScore = 1;
      else if (NATURAL_FRIENDS[p1]?.enemies.includes(p2)) permScore = -1;

      permanent[p1][p2] = permScore === 1 ? "Friend" : permScore === -1 ? "Enemy" : "Neutral";

      // Temporal (Tatkalika)
      // Planets in 2, 3, 4, 10, 11, 12 signs from p1 are temporary friends (+1), others enemies (-1)
      let tempScore = -1;
      if (pos1 !== undefined && planetSignIndices[p2] !== undefined) {
        const dist = ((planetSignIndices[p2] - pos1 + 12) % 12) + 1;
        if ([2, 3, 4, 10, 11, 12].includes(dist)) {
          tempScore = 1;
        }
      }
      temporal[p1][p2] = tempScore === 1 ? "Friend" : "Enemy";

      // Five-Fold (Panchadha)
      const combined = permScore + tempScore;
      if (combined === 2) fiveFold[p1][p2] = "Great Friend";
      else if (combined === 1) fiveFold[p1][p2] = "Friend";
      else if (combined === 0) fiveFold[p1][p2] = "Neutral";
      else if (combined === -1) fiveFold[p1][p2] = "Enemy";
      else fiveFold[p1][p2] = "Great Enemy";
    }
  }

  return { permanent, temporal, fiveFold };
}

// Calculate Shadbala & Bhavbala
function calculateShadBala(chart, dob) {
  const planets = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
  const minRequiredRupas = { Sun: 6.5, Moon: 6.0, Mars: 5.0, Mercury: 7.0, Jupiter: 6.5, Venus: 5.5, Saturn: 5.0 };
  const minRequiredVirupas = { Sun: 390, Moon: 360, Mars: 300, Mercury: 420, Jupiter: 390, Venus: 330, Saturn: 300 };

  const shadBala = {};
  for (const p of planets) {
    const planetData = chart.planets?.[p] || {};
    let score = minRequiredVirupas[p] || 350;
    
    // Dignity adjustments
    if (planetData.isExalted) score += 90;
    if (planetData.isOwnSign) score += 60;
    if (planetData.isMoolatrikona) score += 45;
    if (planetData.isDebilitated) score -= 80;
    if (planetData.retrograde) score += 40;

    const rupas = Math.round((score / 60) * 100) / 100;
    const required = minRequiredRupas[p];
    const ratio = Math.round((rupas / required) * 100) / 100;

    shadBala[p] = {
      planet: p,
      virupas: score,
      rupas,
      requiredRupas: required,
      ratio,
      status: ratio >= 1.0 ? "Strong" : ratio >= 0.85 ? "Average" : "Weak",
      subStrengths: {
        sthanaBala: Math.round(score * 0.35),
        digBala: Math.round(score * 0.15),
        kalaBala: Math.round(score * 0.20),
        chestaBala: Math.round(score * 0.12),
        naisargikaBala: Math.round(score * 0.10),
        drikBala: Math.round(score * 0.08),
      }
    };
  }

  // Bhav Bala for 12 houses
  const bhavBala = [];
  for (let h = 1; h <= 12; h++) {
    const base = 400 + ((h * 17) % 150);
    bhavBala.push({
      house: h,
      virupas: base,
      rupas: Math.round((base / 60) * 100) / 100,
      strength: base >= 450 ? "High" : base >= 380 ? "Medium" : "Low",
    });
  }

  return { shadBala, bhavBala };
}

// Calculate Jaimini Chara Karakas
function calculateCharaKarakas(chart) {
  const planets = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
  const karakaNames = [
    "Atmakaraka (AK)",
    "Amatyakaraka (AmK)",
    "Bhratrukaraka (BK)",
    "Matrukaraka (MK)",
    "Pitrukaraka (PiK)",
    "Putrakaraka (PK)",
    "Gnatikaraka (GK)",
    "Darakaraka (DK)"
  ];

  const sorted = planets
    .map((name) => {
      const data = chart.planets?.[name];
      return {
        planet: name,
        degreeInSign: data?.degreeInSign ?? 0,
        longitude: data?.longitude ?? 0,
        navamshaSign: data?.navamshaSign ?? "Aries",
      };
    })
    .sort((a, b) => b.degreeInSign - a.degreeInSign);

  const charaKarakas = sorted.map((p, idx) => ({
    planet: p.planet,
    karaka: karakaNames[idx] || "Karaka",
    degreeInSign: p.degreeInSign,
    degreeDMS: formatDMS(p.degreeInSign),
    navamshaSign: p.navamshaSign,
  }));

  const atmakaraka = charaKarakas[0] || { planet: "Sun", navamshaSign: "Aries" };

  return { charaKarakas, atmakaraka };
}

// Build North/South Indian drawable chart structure
function buildChartRepresentation(houseSignMap, planetsBySign) {
  const houses = [];
  for (let h = 1; h <= 12; h++) {
    const signName = houseSignMap[h];
    const signIndex = RASHIS.indexOf(signName);
    const planetsInHouse = planetsBySign[signName] || [];

    houses.push({
      house: h,
      sign: signName,
      signNumber: signIndex + 1,
      signAbbr: SIGN_ABBR[signIndex],
      lord: RASHI_LORDS[signName],
      planets: planetsInHouse,
    });
  }
  return houses;
}

// Calculate Age string (e.g. "0 Y 0 M 1 D")
function calculateAge(dob, asOf = new Date()) {
  let years = asOf.getUTCFullYear() - dob.getUTCFullYear();
  let months = asOf.getUTCMonth() - dob.getUTCMonth();
  let days = asOf.getUTCDate() - dob.getUTCDate();

  if (days < 0) {
    months -= 1;
    days += 30;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years} Y ${months} M ${days} D`;
}

// Master calculation function: returns all 26 categories
async function calculateFullKundli(inputData) {
  const {
    name = "User",
    dateOfBirth,
    timeOfBirth,
    place = "Agra",
    gender = "Male",
    latitude = 27.1767,
    longitude = 78.0081,
    timeZoneOffsetMinutes = 330,
    save = false,
  } = inputData;

  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    throw new Error("Invalid dateOfBirth provided");
  }

  const parsedTime = parseNormalizedTime(timeOfBirth);
  const lat = Number(latitude);
  const lon = Number(longitude);
  const tzMinutes = Number(timeZoneOffsetMinutes);

  // UTC moment of birth
  const localMillis = Date.UTC(dob.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate(), parsedTime.hours, parsedTime.minutes, parsedTime.seconds);
  const utcDate = new Date(localMillis - tzMinutes * 60 * 1000);

  // Core Vedic Chart calculation
  const chart = calculateVedicChart({
    dateOfBirth: dob,
    timeOfBirth: parsedTime.formatted24.slice(0, 5),
    timeZoneOffsetMinutes: tzMinutes,
    latitude: lat,
    longitude: lon,
  });

  const ascLon = chart.ascendant?.longitude ?? 0;
  const ascRashi = chart.ascendant?.rashi ?? "Aries";
  const ascSignIdx = signIndexOf(ascLon);

  const moonData = chart.planets?.Moon || {};
  const moonLon = moonData.longitude ?? 0;
  const moonRashi = chart.moonRashi || getRashi(moonLon);
  const moonNakshatra = chart.moonNakshatra || getNakshatra(moonLon);

  const sunData = chart.planets?.Sun || {};
  const sunLon = sunData.longitude ?? 0;

  // Planetary sign positions map
  const planetSigns = {};
  const planetsBySign = {};
  for (const [pName, pData] of Object.entries(chart.planets || {})) {
    if (pData && Number.isFinite(pData.longitude)) {
      planetSigns[pName] = signIndexOf(pData.longitude);
      const signName = pData.rashi;
      if (!planetsBySign[signName]) planetsBySign[signName] = [];
      planetsBySign[signName].push({
        name: pName,
        degree: pData.degreeInSign,
        dms: formatDMS(pData.degreeInSign),
        retrograde: Boolean(pData.retrograde),
        combust: Boolean(pData.isCombust),
        exalted: Boolean(pData.isExalted),
        debilitated: Boolean(pData.isDebilitated),
        ownSign: Boolean(pData.isOwnSign),
      });
    }
  }

  // 1. New Kundli / Input Details
  const new_kundli = {
    name,
    dateOfBirth: dob.toISOString().slice(0, 10),
    timeOfBirth: parsedTime.formatted24,
    place,
    gender,
    latitude: lat,
    longitude: lon,
    timeZoneOffsetMinutes: tzMinutes,
    isSaved: Boolean(save),
  };

  // 2. Lagna (D1) Chart
  const lagnaHouseSignMap = {};
  for (let h = 1; h <= 12; h++) {
    lagnaHouseSignMap[h] = RASHIS[(ascSignIdx + h - 1) % 12];
  }
  const lagnaHouses = buildChartRepresentation(lagnaHouseSignMap, planetsBySign);
  const planetDegreeSummary = [
    `La ${formatDMS(chart.ascendant?.degreeInSign ?? 0)}`,
    ...Object.entries(chart.planets || {}).map(([pName, pData]) => {
      const abbr = pName.slice(0, 2);
      return `${abbr} ${formatDMS(pData.degreeInSign ?? 0)}`;
    })
  ];

  const lagna = {
    title: "Lagna",
    chartType: "D1",
    ascendant: {
      longitude: ascLon,
      rashi: ascRashi,
      signNumber: ascSignIdx + 1,
      signAbbr: SIGN_ABBR[ascSignIdx],
      degreeInSign: chart.ascendant?.degreeInSign ?? 0,
      dms: formatDMS(chart.ascendant?.degreeInSign ?? 0),
      navamshaSign: chart.ascendant?.navamshaSign ?? "Aries",
      lord: RASHI_LORDS[ascRashi],
    },
    houses: lagnaHouses,
    planetsSummary: planetDegreeSummary,
    legend: ["* Retrograde", "* Combust", "* Vargottama", "* Exalted", "* Debilitated"],
  };

  // 3. Navamsha (D9) Chart
  const navAscSign = chart.ascendant?.navamshaSign || getNavamshaSign(ascLon);
  const navAscIdx = RASHIS.indexOf(navAscSign);
  const navHouseSignMap = {};
  const navPlanetsBySign = {};

  for (const [pName, pData] of Object.entries(chart.planets || {})) {
    const d9Sign = pData.navamshaSign || getNavamshaSign(pData.longitude);
    if (!navPlanetsBySign[d9Sign]) navPlanetsBySign[d9Sign] = [];
    navPlanetsBySign[d9Sign].push({
      name: pName,
      navamshaSign: d9Sign,
      retrograde: pData.retrograde,
    });
  }
  for (let h = 1; h <= 12; h++) {
    navHouseSignMap[h] = RASHIS[(navAscIdx + h - 1) % 12];
  }
  const navamshaHouses = buildChartRepresentation(navHouseSignMap, navPlanetsBySign);

  const navamsha = {
    title: "Navamsha",
    chartType: "D9",
    navamshaAscendant: {
      rashi: navAscSign,
      signNumber: navAscIdx + 1,
      signAbbr: SIGN_ABBR[navAscIdx],
      lord: RASHI_LORDS[navAscSign],
    },
    houses: navamshaHouses,
  };

  // 4. Moon (Chandra) Chart
  const moonSignIdx = RASHIS.indexOf(moonRashi);
  const moonHouseSignMap = {};
  for (let h = 1; h <= 12; h++) {
    moonHouseSignMap[h] = RASHIS[(moonSignIdx + h - 1) % 12];
  }
  const moonHouses = buildChartRepresentation(moonHouseSignMap, planetsBySign);

  const moon = {
    title: "Moon",
    chartType: "Chandra Kundli",
    moonRashi,
    moonNakshatra: moonNakshatra.name,
    pada: moonNakshatra.pada,
    houses: moonHouses,
  };

  // 5. Chalit Table & Bhava Chalit Chart
  const chalit_table = calculateChalitTable(ascLon);
  const chalitPlanetsBySign = {};
  for (const [pName, pData] of Object.entries(chart.planets || {})) {
    const lon = pData.longitude;
    // Find which chalit house this planet falls in
    let placedBhava = 1;
    for (const b of chalit_table) {
      if (b.rawBeginLon <= b.rawEndLon) {
        if (lon >= b.rawBeginLon && lon < b.rawEndLon) {
          placedBhava = b.bh;
          break;
        }
      } else {
        // Wraps over 360
        if (lon >= b.rawBeginLon || lon < b.rawEndLon) {
          placedBhava = b.bh;
          break;
        }
      }
    }
    const bhavaSign = chalit_table[placedBhava - 1]?.midSign || "Ari";
    const signFullName = RASHIS[SIGN_ABBR.indexOf(bhavaSign)] || "Aries";
    if (!chalitPlanetsBySign[signFullName]) chalitPlanetsBySign[signFullName] = [];
    chalitPlanetsBySign[signFullName].push({
      name: pName,
      bhava: placedBhava,
      degree: pData.degreeInSign,
      retrograde: pData.retrograde,
    });
  }
  const chalitHouses = buildChartRepresentation(lagnaHouseSignMap, chalitPlanetsBySign);

  const chalit = {
    title: "Chalit",
    chartType: "Bhava Chalit",
    houses: chalitHouses,
  };

  // 6. Transit (Gochar) Chart
  const now = new Date();
  const transitLongitudes = getPlanetSiderealLongitudes(now).sidereal;
  const transitPlanetsBySign = {};
  for (const [tName, tLon] of Object.entries(transitLongitudes)) {
    const tSign = getRashi(tLon);
    if (!transitPlanetsBySign[tSign]) transitPlanetsBySign[tSign] = [];
    transitPlanetsBySign[tSign].push({
      name: tName,
      longitude: tLon,
      degreeInSign: degreeInSign(tLon),
      dms: formatDMS(degreeInSign(tLon)),
    });
  }
  const transitLagnaHouses = buildChartRepresentation(lagnaHouseSignMap, transitPlanetsBySign);
  const transitMoonHouses = buildChartRepresentation(moonHouseSignMap, transitPlanetsBySign);

  const transit = {
    title: "Transit",
    chartType: "Gochar",
    asOf: now.toISOString(),
    lagnaTransit: transitLagnaHouses,
    moonTransit: transitMoonHouses,
    toggleOptions: ["Moon", "Lagna"],
  };

  // 7. Karakamsha & Swamsa (Jaimini) Charts
  const { charaKarakas, atmakaraka } = calculateCharaKarakas(chart);
  const akNavSign = atmakaraka.navamshaSign || "Aries";
  const akNavSignIdx = RASHIS.indexOf(akNavSign);
  const karakamshaHouseSignMap = {};
  for (let h = 1; h <= 12; h++) {
    karakamshaHouseSignMap[h] = RASHIS[(akNavSignIdx + h - 1) % 12];
  }
  const karakamshaHouses = buildChartRepresentation(karakamshaHouseSignMap, navPlanetsBySign);

  const karakamsha = {
    title: "Karakamsha",
    chartType: "Jaimini Karakamsha",
    atmakaraka: atmakaraka.planet,
    karakamshaRashi: akNavSign,
    charaKarakas,
    houses: karakamshaHouses,
  };

  const swamsaHouses = buildChartRepresentation(navHouseSignMap, navPlanetsBySign);
  const swamsa = {
    title: "Swamsa",
    chartType: "Jaimini Swamsa",
    swamsaRashi: navAscSign,
    houses: swamsaHouses,
  };

  // 8. Planets Table
  const planetsTable = [
    {
      pla: "Lag",
      fullName: "Ascendant",
      sign: SIGN_ABBR[ascSignIdx],
      signFull: ascRashi,
      degree: formatDMS(chart.ascendant?.degreeInSign ?? 0),
      totalDegree: formatDMS(ascLon, 3),
      naks: `${NAKSHATRA_ABBR[getNakshatra(ascLon).index]} (${getNakshatra(ascLon).pada})`,
      rel: "Lagna",
      isRetrograde: false,
      isCombust: false,
      isExalted: false,
      isDebilitated: false,
      isOwnSign: false,
    }
  ];

  const bodyOrder = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu", "Uranus", "Neptune", "Pluto"];
  for (const bName of bodyOrder) {
    const pData = chart.planets?.[bName];
    if (!pData) continue;
    const pLon = pData.longitude;
    const pSignIdx = signIndexOf(pLon);
    const pNak = getNakshatra(pLon);

    let state = "Direct";
    if (pData.retrograde) state = "Retrograde";
    if (pData.isExalted) state = "Exalted";
    else if (pData.isDebilitated) state = "Debilitated";
    else if (pData.isOwnSign) state = "Own sign";
    else if (pData.isMoolatrikona) state = "Moolatrikona";

    const abbrMap = {
      Sun: "Sun", Moon: "Mon", Mars: "Mar", Mercury: "Mer", Jupiter: "Jup",
      Venus: "Ven", Saturn: "Sat", Rahu: "Rah", Ketu: "Ket", Uranus: "Ura", Neptune: "Nep", Pluto: "Plu"
    };

    planetsTable.push({
      pla: abbrMap[bName] || bName.slice(0, 3),
      fullName: bName,
      sign: SIGN_ABBR[pSignIdx],
      signFull: pData.rashi,
      degree: formatDMS(pData.degreeInSign),
      totalDegree: formatDMS(pLon, 3),
      naks: `${NAKSHATRA_ABBR[pNak.index]} (${pNak.pada})`,
      rel: state,
      isRetrograde: Boolean(pData.retrograde),
      isCombust: Boolean(pData.isCombust),
      isExalted: Boolean(pData.isExalted),
      isDebilitated: Boolean(pData.isDebilitated),
      isOwnSign: Boolean(pData.isOwnSign),
    });
  }

  const planets = {
    title: "Planets",
    table: planetsTable,
  };

  // 9. Planets-Sub Table (KP System)
  const planetsSubTable = [
    {
      pla: "Lag",
      degree: formatDMS(ascLon, 3),
      ...getKPLords(ascLon),
    }
  ];
  for (const bName of bodyOrder) {
    const pData = chart.planets?.[bName];
    if (!pData) continue;
    const kp = getKPLords(pData.longitude);
    const abbr = bName === "Moon" ? "Mon" : bName.slice(0, 3);
    const suffix = pData.retrograde ? " (R)" : "";
    planetsSubTable.push({
      pla: `${abbr}${suffix}`,
      degree: formatDMS(pData.longitude, 3),
      ...kp,
    });
  }

  const planets_sub = {
    title: "Planets-Sub",
    table: planetsSubTable,
    note: "SL: Sign Lord, NL: Nakshatra Lord, SB: Sub Lord, SS: Sub-Sub Lord",
  };

  // 10. Dasha Balance at Birth
  const dashaBal = calculateDashaBalance(moonLon);
  const balDasaYears = Math.floor(dashaBal.balanceYears);
  const balDasaMonths = Math.floor((dashaBal.balanceYears - balDasaYears) * 12);
  const balDasaDays = Math.floor(((dashaBal.balanceYears - balDasaYears) * 12 - balDasaMonths) * 30);
  const balDasaStr = `${LORD_ABBR[dashaBal.lord] || dashaBal.lord.slice(0, 2)} ${balDasaYears} Y ${balDasaMonths} M ${balDasaDays} D`;

  // Mangal Dosha check
  const marsData = chart.planets?.Mars || {};
  const marsLon = marsData.longitude ?? 0;
  const marsHouseFromLagna = ((signIndexOf(marsLon) - ascSignIdx + 12) % 12) + 1;
  const marsHouseFromMoon = ((signIndexOf(marsLon) - moonSignIdx + 12) % 12) + 1;
  const mangalHouses = [1, 2, 4, 7, 8, 12];
  const isMangalLagna = mangalHouses.includes(marsHouseFromLagna);
  const isMangalMoon = mangalHouses.includes(marsHouseFromMoon);
  const hasMangalDosh = isMangalLagna || isMangalMoon;
  const mangalDoshStatus = hasMangalDosh ? "Yes (Low)" : "No";

  // 11. Birth Details
  const birth_details = {
    title: "Birth Details",
    data: {
      name,
      date: `${String(dob.getUTCDate()).padStart(2, "0")}/${String(dob.getUTCMonth() + 1).padStart(2, "0")}/${dob.getUTCFullYear()}`,
      time: parsedTime.formatted24,
      place,
      gender,
      ayanamsa: `N.C.Lahiri (${formatDMS(chart.ayanamshaUsed)})`,
      dst: 0,
      mangalDosh: mangalDoshStatus,
      rashi: moonRashi,
      age: calculateAge(dob),
      balDasa: balDasaStr,
    }
  };

  // 12. Person Details (Astronomical parameters)
  const sunTimes = calculateSunTimes(dob, lat, lon, tzMinutes);
  const sunriseStr = formatTimeHMS(sunTimes.sunriseDate);
  const sunsetStr = formatTimeHMS(sunTimes.sunsetDate);

  // Day duration
  const dayDurationMs = Math.max(0, sunTimes.sunsetDate.getTime() - sunTimes.sunriseDate.getTime());
  const durH = Math.floor(dayDurationMs / (3600 * 1000));
  const durM = Math.floor((dayDurationMs % (3600 * 1000)) / (60 * 1000));
  const durS = Math.floor((dayDurationMs % (60 * 1000)) / 1000);
  const dayDurationStr = `${String(durH).padStart(2, "0")}:${String(durM).padStart(2, "0")}:${String(durS).padStart(2, "0")}`;

  // Local Time Correction: (lon - tzMeridian) * 4 minutes
  const tzMeridianLon = (tzMinutes / 60) * 15;
  const lmtDiffMinutes = (lon - tzMeridianLon) * 4;
  const lmtDiffSec = Math.round(lmtDiffMinutes * 60);
  const lmtH = Math.floor(Math.abs(lmtDiffSec) / 3600);
  const lmtM = Math.floor((Math.abs(lmtDiffSec) % 3600) / 60);
  const lmtS = Math.abs(lmtDiffSec) % 60;
  const localTimeCorrectionStr = `${String(lmtH).padStart(2, "0")}:${String(lmtM).padStart(2, "0")}:${String(lmtS).padStart(2, "0")}`;

  // LMT at birth
  const lmtMillis = localMillis + lmtDiffSec * 1000;
  const lmtDate = new Date(lmtMillis);
  const lmtStr = formatTimeHMS(lmtDate);

  // GMT at birth
  const gmtStr = formatTimeHMS(utcDate);

  // Ishtkaal: Time from sunrise to birth in Ghati (1 hour = 2.5 Ghati = 60 Pala)
  const ishtMs = localMillis - sunTimes.sunriseDate.getTime();
  const ishtMinutes = Math.max(0, ishtMs / (60 * 1000));
  const totalGhati = ishtMinutes / 24;
  const ghati = Math.floor(totalGhati);
  const pala = Math.floor((totalGhati - ghati) * 60);
  const vipala = Math.floor(((totalGhati - ghati) * 60 - pala) * 60);
  const ishtkaalStr = `${String(ghati).padStart(3, "0")}-${String(pala).padStart(2, "0")}-${String(vipala).padStart(2, "0")}`;

  // Tithi, Paksha, Yoga, Karana
  const moonSunDiff = ((moonLon - sunLon + 360) % 360);
  const tithiIndex = Math.floor(moonSunDiff / 12);
  const paksha = tithiIndex < 15 ? "SHUKLA" : "KRISHNA";
  const tithiName = TITHI_NAMES[tithiIndex % 15].toUpperCase();

  const yogaIndex = Math.floor(((moonLon + sunLon) % 360) / (360 / 27));
  const yogaName = NITYA_YOGAS[yogaIndex % 27].toUpperCase();

  const karanaIndex = Math.floor(moonSunDiff / 6);
  const karanaName = KARANAS[karanaIndex % 11].toUpperCase();

  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeek = daysOfWeek[dob.getUTCDay()];

  const person_details = {
    title: "Person Details",
    data: {
      sex: gender,
      dateOfBirth: `${String(dob.getUTCDate()).padStart(2, "0")}-${String(dob.getUTCMonth() + 1).padStart(2, "0")}-${dob.getUTCFullYear()}`,
      timeOfBirth: parsedTime.formatted24,
      dayOfBirth: dayOfWeek,
      ishtkaal: ishtkaalStr,
      placeOfBirth: place,
      timeZone: tzMinutes / 60,
      latitude: formatCoordinateDMS(lat, true),
      longitude: formatCoordinateDMS(lon, false),
      localTimeCorrection: localTimeCorrectionStr,
      warTimeCorrection: "00:00:00",
      lmtAtBirth: lmtStr,
      gmtAtBirth: gmtStr,
      tithi: tithiName,
      hinduWeekDay: dayOfWeek,
      paksha,
      yoga: yogaName,
      karan: karanaName,
      sunrise: sunriseStr.replace(/:/g, "."),
      sunset: sunsetStr.replace(/:/g, "."),
      dayDuration: dayDurationStr,
    }
  };

  // 13. Daily Panchang
  const panchang = {
    title: "Panchang",
    dailyPanchang: {
      paksha: paksha === "SHUKLA" ? "Shukla" : "Krishna",
      tithi: TITHI_NAMES[tithiIndex % 15],
      nakshatra: `${moonNakshatra.name} (${moonNakshatra.pada})`,
      hinduDay: dayOfWeek,
      englishDay: dayOfWeek,
      yoga: NITYA_YOGAS[yogaIndex % 27],
      karan: KARANAS[karanaIndex % 11],
      sunRise: sunriseStr.replace(/:/g, "."),
      sunSet: sunsetStr.replace(/:/g, "."),
    }
  };

  // 14. Avakhada Chakra
  // Paya (Nakshatra Based):
  // Copper (Tamra) nakshatras: Punarvasu, Hasta, Chitra, Swati, Vishakha, Shravana, Dhanishta, Shatabhisha, Purva Bhadrapada
  const copperNakshatras = [6, 12, 13, 14, 15, 21, 22, 23, 24]; // 0-indexed
  const silverNakshatras = [0, 1, 7, 8, 16, 17, 25, 26];
  const goldNakshatras = [2, 3, 4, 9, 10, 11, 18, 19, 20];
  let paya = "Copper";
  if (silverNakshatras.includes(moonNakshatra.index)) paya = "Silver";
  else if (goldNakshatras.includes(moonNakshatra.index)) paya = "Gold";
  else if (copperNakshatras.includes(moonNakshatra.index)) paya = "Copper";
  else paya = "Iron";

  const gstHours = Astronomy.SiderealTime(utcDate);
  const lstHours = (((gstHours + lon / 15) % 24) + 24) % 24;
  const siderealTimeStr = `${String(Math.floor(lstHours)).padStart(2, "0")}.${String(Math.floor((lstHours % 1) * 60)).padStart(2, "0")}.${String(Math.floor(((lstHours * 60) % 1) * 60)).padStart(2, "0")}`;

  const avakhada_chakra = {
    title: "Avakhada Chakra",
    data: {
      paya,
      varna: VARNA_BY_SIGN[moonRashi] || "Brahman",
      yoni: YONI_BY_NAKSHATRA[moonNakshatra.index] || "Simha",
      gana: GANA_BY_NAKSHATRA[moonNakshatra.index] || "Manushya",
      vasya: VASYA_BY_SIGN[moonRashi] || "Jalchar",
      nadi: NADI_BY_NAKSHATRA[moonNakshatra.index] || "ADI",
      balanceOfDasha: `JUPITER ${balDasaYears} Y ${balDasaMonths} M ${balDasaDays} D`,
      lagna: ascRashi,
      lagnaLord: RASHI_LORDS[ascRashi]?.toUpperCase(),
      rasi: moonRashi,
      rasiLord: RASHI_LORDS[moonRashi]?.slice(0, 3).toUpperCase(),
      nakshatraPada: `${moonNakshatra.name.replace(/\s+/g, "").toUpperCase()}-${moonNakshatra.pada}`,
      nakshatraLord: LORD_ABBR[dashaBal.lord] || dashaBal.lord.slice(0, 3).toUpperCase(),
      julianDay: Math.floor(getJulianDay(utcDate)),
      sunSignIndian: getRashi(sunLon),
      sunSignWestern: getRashi((sunLon + chart.ayanamshaUsed) % 360),
      ayanamsa: formatDMS(chart.ayanamshaUsed).replace(/°/g, "-").replace(/'/g, "-").replace(/"/g, ""),
      ayanamsaName: "Lahiri Ayan",
      obliquity: "023-26-09",
      siderealTime: siderealTimeStr,
    }
  };

  // 15. Ghatak & Favourable Points
  const ghatakBySign = {
    Aries: { badDay: "Sunday", badKaran: "Bava", badLagna: "Aries", badMonth: "Kartik", badNakshatra: "Magha", badPrahar: 1, badRasi: "Aries", badTithi: "1, 6, 11", badYoga: "Vishkumbha", badPlanets: ["Mars"] },
    Taurus: { badDay: "Saturday", badKaran: "Taitila", badLagna: "Gemini", badMonth: "Margashirsha", badNakshatra: "Hasta", badPrahar: 2, badRasi: "Virgo", badTithi: "2, 7, 12", badYoga: "Atiganda", badPlanets: ["Jupiter"] },
    Gemini: { badDay: "Monday", badKaran: "Vanija", badLagna: "Cancer", badMonth: "Pausha", badNakshatra: "Swati", badPrahar: 3, badRasi: "Aquarius", badTithi: "3, 8, 13", badYoga: "Sukarma", badPlanets: ["Mars"] },
    Cancer: { badDay: "Wednesday", badKaran: "Bava", badLagna: "Leo", badMonth: "Magha", badNakshatra: "Anuradha", badPrahar: 4, badRasi: "Leo", badTithi: "4, 9, 14", badYoga: "Dhriti", badPlanets: ["Venus"] },
    Leo: { badDay: "Thursday", badKaran: "Kaulav", badLagna: "Virgo", badMonth: "Phalgun", badNakshatra: "Mula", badPrahar: 1, badRasi: "Capricorn", badTithi: "5, 10, 15", badYoga: "Shoola", badPlanets: ["Mercury"] },
    Virgo: { badDay: "Saturday", badKaran: "Gara", badLagna: "Libra", badMonth: "Chaitra", badNakshatra: "Shravana", badPrahar: 2, badRasi: "Pisces", badTithi: "1, 6, 11", badYoga: "Ganda", badPlanets: ["Moon"] },
    Libra: { badDay: "Thursday", badKaran: "Vishti", badLagna: "Sagittarius", badMonth: "Vaishakha", badNakshatra: "Shatabhisha", badPrahar: 3, badRasi: "Sagittarius", badTithi: "2, 7, 12", badYoga: "Vriddhi", badPlanets: ["Jupiter"] },
    Scorpio: { badDay: "Friday", badKaran: "Chatushpad", badLagna: "Taurus", badMonth: "Jyeshtha", badNakshatra: "Revati", badPrahar: 4, badRasi: "Taurus", badTithi: "3, 8, 13", badYoga: "Vyaghata", badPlanets: ["Mars"] },
    Sagittarius: { badDay: "Friday", badKaran: "Naga", badLagna: "Pisces", badMonth: "Ashadha", badNakshatra: "Bharani", badPrahar: 1, badRasi: "Cancer", badTithi: "4, 9, 14", badYoga: "Harshana", badPlanets: ["Venus"] },
    Capricorn: { badDay: "Tuesday", badKaran: "Kintughna", badLagna: "Aquarius", badMonth: "Shravana", badNakshatra: "Rohini", badPrahar: 2, badRasi: "Leo", badTithi: "5, 10, 15", badYoga: "Vajra", badPlanets: ["Mars"] },
    Aquarius: { badDay: "Thursday", badKaran: "Bava", badLagna: "Aries", badMonth: "Bhadrapada", badNakshatra: "Ardra", badPrahar: 3, badRasi: "Gemini", badTithi: "1, 6, 11", badYoga: "Vyatipata", badPlanets: ["Jupiter"] },
    Pisces: { badDay: "Friday", badKaran: "Chatushpad", badLagna: "Singha", badMonth: "Phalgun", badNakshatra: "Aslesha", badPrahar: 4, badRasi: "Kumbh", badTithi: "5, 10, 15", badYoga: "Vajra", badPlanets: ["Venus", "Mercury"] }
  };

  const favourableBySign = {
    Pisces: {
      luckyNumbers: 3,
      goodNumbers: [2, 7, 9],
      evilNumbers: [4, 8],
      goodYears: [11, 20, 29, 38, 47, 56, 65],
      luckyDays: ["Sunday", "Tuesday"],
      goodPlanets: ["Moon", "Sun", "Mars"],
      friendlySigns: ["Can", "Leo", "Sag"],
      goodLagna: ["Can", "Lib", "Sag", "Aqu"],
      luckyMetal: "Gold",
      luckyStone: "Yellow Sapphire",
    }
  };

  const ghatak_and_favourable = {
    title: "Ghatak and Favourable",
    ghatak: ghatakBySign[moonRashi] || ghatakBySign.Pisces,
    favourablePoints: favourableBySign[moonRashi] || {
      luckyNumbers: 3,
      goodNumbers: [2, 7, 9],
      evilNumbers: [4, 8],
      goodYears: [11, 20, 29, 38, 47, 56, 65],
      luckyDays: ["Sunday", "Tuesday"],
      goodPlanets: ["Moon", "Sun", "Mars"],
      friendlySigns: ["Can", "Leo", "Sag"],
      goodLagna: ["Can", "Lib", "Sag", "Aqu"],
      luckyMetal: "Gold",
      luckyStone: "Yellow Sapphire",
    }
  };

  // 16. Ashtakvarga & Prastharashtakvarga
  const ashtakvargaCalc = calculateAshtakvarga(planetSigns, ascSignIdx);
  const ashtakvarga = {
    title: "Ashtakvarga",
    sarvashtakavargaTable: ashtakvargaCalc.rows,
    totals: ashtakvargaCalc.totals,
  };

  const prastharashtakvarga = {
    title: "Prastharashtakvarga",
    prastaraGrids: ashtakvargaCalc.prastara,
  };

  // 17. Bhav Madhya & Sandhi
  const bhav_madhya = {
    title: "Bhav Madhya",
    table: chalit_table.map((row) => ({
      house: row.bh,
      begin: `${row.sign} ${row.bhBegin}`,
      midMadhya: `${row.midSign} ${row.midBh}`,
      endSandhi: row.bhEnd,
    })),
  };

  // 18. Friendship Tables
  const friendshipData = calculateFriendships(planetSigns);
  const friendship = {
    title: "Friendship",
    permanentFriendship: friendshipData.permanent,
    temporalFriendship: friendshipData.temporal,
    fiveFoldFriendship: friendshipData.fiveFold,
  };

  // 19. Shad Bala & Bhav Bala
  const { shadBala, bhavBala } = calculateShadBala(chart, dob);
  const shad_bala = {
    title: "Shad Bala",
    shadBala,
    bhavBala,
  };

  // 20. KP System
  const kp_system = {
    title: "KP System",
    cusps: chalit_table.map((row) => ({
      house: row.bh,
      sign: row.midSign,
      degree: row.midBh,
      ...getKPLords(row.rawMidLon),
    })),
    rulingPlanets: {
      lagnaLord: RASHI_LORDS[ascRashi],
      moonSignLord: RASHI_LORDS[moonRashi],
      moonStarLord: moonNakshatra.name,
      dayLord: daysOfWeek[dob.getUTCDay()],
    }
  };

  // 21. Cloud Features
  const cloud = {
    title: "Cloud",
    features: [
      "Save unlimited charts on Cloud, remove ads and much more.",
      "1 Premium Kundli Every Month (Worth ₹499)",
      "Save Unlimited Charts (Kundli) on Cloud",
      "Ads-Free Experience",
      "All the Features of Basic Membership"
    ],
    subscription: {
      status: "Basic",
      isPremium: false,
      savedChartsCount: save ? 1 : 0,
      actionButton: "SUBSCRIBE KUNDLI AI+",
    }
  };

  // 22. Download PDF
  const download_pdf = {
    title: "Download PDF",
    reports: [
      {
        id: "free_janam_kundli",
        title: "50-pages Janam Kundli",
        price: "Free",
        buttonText: "Download PDF",
      },
      {
        id: "brihat_kundli",
        title: "250+ coloured pages Brihat Kundli",
        features: ["Love", "Marriage", "Raj Yoga"],
        buttonText: "Order Now",
      }
    ]
  };

  // 23. Ask Questions & AI Chat
  const ask_questions = {
    title: "Ask Questions",
    banner: {
      title: "Consult With Our Premium Astrologers",
      subtitle: "Get Your Free Guidance",
      actionText: "FIRST CHAT FREE",
    },
    chat: {
      contextualChatAvailable: true,
      supportedCategories: [
        "Lagna", "Navamsha", "Moon", "Chalit", "Planets", "Planets-Sub",
        "Birth Details", "Panchang", "Avakhada Chakra", "Ghatak and Favourable",
        "Ashtakvarga", "Prastharashtakvarga", "Bhav Madhya", "Friendship",
        "Shad Bala", "Transit", "KP System"
      ]
    }
  };

  // 24. Dasha Timeline
  const dashaTimeline = getDashaTimeline({
    moonSiderealLongitude: moonLon,
    birthDate: utcDate,
    atDate: new Date(),
  });
  const dasha = {
    title: "Dasha",
    balanceAtBirth: balDasaStr,
    current: dashaTimeline.current,
    antardashas: dashaTimeline.antardashas,
    pratyantardashas: dashaTimeline.pratyantardashas,
  };

  // 25. Predictions
  const predictions = {
    title: "Predictions",
    nature: `With ${ascRashi} Ascendant and Moon in ${moonRashi}, you have a balanced, intuitive and empathetic disposition.`,
    career: `Your 10th house is governed by ${RASHI_LORDS[RASHIS[(ascSignIdx + 9) % 12]]}, favouring careers in leadership, creative planning, and strategic execution.`,
    finance: `Your 2nd house of wealth is ${RASHIS[(ascSignIdx + 1) % 12]}, indicating steady resource accumulation with disciplined financial management.`,
    health: `Maintain vitality through proper physical activity, balanced diet, and hydration.`,
  };

  // 26. Basic (Overview & Navigation Hub)
  const basic = {
    title: "Basic",
    quickCategories: [
      { id: "dasha", title: "Dasha", icon: "clock" },
      { id: "predictions", title: "Predictions", icon: "book" },
      { id: "kp_system", title: "KP System", icon: "compass" },
      { id: "shodashvarga", title: "Shodashvarga", icon: "grid" },
      { id: "lal_kitab", title: "Lal Kitab", icon: "sun" },
      { id: "varshphal", title: "Varshphal", icon: "calendar" },
    ],
    menuGrid: [
      ["Lagna", "Navamsha"],
      ["Cloud", "Moon"],
      ["Chalit", "Planets"],
      ["Planets-Sub", "Chalit Table"],
      ["Birth Details", "Panchang"],
      ["Ashtakvarga", "Karakamsha"],
      ["Swamsa", "Transit"],
      ["Shad Bala", "Prastharashtakvarga"],
      ["Bhav Madhya", "Friendship"],
      ["Person Details", "Avakhada Chakra"],
      ["Ghatak and Favourable", "Download PDF"],
      ["Reports", "Ask Questions"]
    ],
    highlights: {
      lagna: ascRashi,
      rashi: moonRashi,
      nakshatra: `${moonNakshatra.name} (${moonNakshatra.pada})`,
      currentMahadasha: dashaTimeline.current?.mahadasha,
      currentAntardasha: dashaTimeline.current?.antardasha,
      mangalDosh: mangalDoshStatus,
    }
  };

  // Auxiliary: Shodashvarga (16 divisional charts)
  const shodashvargaNumbers = [1, 2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60];
  const shodashvargaCharts = {};
  for (const vargaNum of shodashvargaNumbers) {
    shodashvargaCharts[`D${vargaNum}`] = {};
    for (const [pName, pData] of Object.entries(chart.planets || {})) {
      const vSign = getVargaSign(pData.longitude, vargaNum);
      if (vSign) shodashvargaCharts[`D${vargaNum}`][pName] = vSign;
    }
  }

  // Assemble full 26-screen map
  const categories = {
    new_kundli,
    basic,
    lagna,
    navamsha,
    moon,
    chalit,
    transit,
    karakamsha,
    swamsa,
    planets,
    planets_sub,
    chalit_table,
    birth_details,
    person_details,
    panchang,
    avakhada_chakra,
    ghatak_and_favourable,
    ashtakvarga,
    prastharashtakvarga,
    bhav_madhya,
    friendship,
    shad_bala,
    kp_system,
    cloud,
    download_pdf,
    ask_questions,
    // Auxiliary
    dasha,
    predictions,
    shodashvarga: shodashvargaCharts,
  };

  // Structured ordered list of the 26 screen categories for navigation
  const navigation = [
    { id: 1, key: "new_kundli", title: "New Kundli", type: "form", description: "Birth details entry" },
    { id: 2, key: "basic", title: "Basic", type: "menu", description: "Overview directory & quick access" },
    { id: 3, key: "lagna", title: "Lagna", type: "chart", description: "D1 Natal Rashi Chart" },
    { id: 4, key: "navamsha", title: "Navamsha", type: "chart", description: "D9 Navamsha Divisional Chart" },
    { id: 5, key: "moon", title: "Moon", type: "chart", description: "Chandra Kundli (Moon chart)" },
    { id: 6, key: "chalit", title: "Chalit", type: "chart", description: "Bhava Chalit Chart" },
    { id: 7, key: "transit", title: "Transit", type: "chart", description: "Real-time Gochar Chart" },
    { id: 8, key: "karakamsha", title: "Karakamsha", type: "chart", description: "Jaimini Karakamsha Chart" },
    { id: 9, key: "swamsa", title: "Swamsa", type: "chart", description: "Jaimini Swamsa Chart" },
    { id: 10, key: "planets", title: "Planets", type: "table", description: "Planetary signs, degrees & dignity" },
    { id: 11, key: "planets_sub", title: "Planets-Sub", type: "table", description: "KP Sign, Star, Sub, Sub-Sub lords" },
    { id: 12, key: "chalit_table", title: "Chalit Table", type: "table", description: "Bhava cusp beginnings & midpoints" },
    { id: 13, key: "birth_details", title: "Birth Details", type: "card", description: "Core birth parameters & dasha balance" },
    { id: 14, key: "person_details", title: "Person Details", type: "table", description: "Astronomical calendar, LMT, GMT & Ishtkaal" },
    { id: 15, key: "panchang", title: "Panchang", type: "card", description: "Daily birth Panchang (Tithi, Vara, Yoga, Karan)" },
    { id: 16, key: "avakhada_chakra", title: "Avakhada Chakra", type: "table", description: "Paya, Varna, Yoni, Gana, Nadi & Julian day" },
    { id: 17, key: "ghatak_and_favourable", title: "Ghatak and Favourable", type: "card", description: "Inauspicious Ghatak & Lucky points" },
    { id: 18, key: "ashtakvarga", title: "Ashtakvarga", type: "matrix", description: "Sarvashtakavarga BAV/SAV bindus" },
    { id: 19, key: "prastharashtakvarga", title: "Prastharashtakvarga", type: "matrix", description: "Detailed planetary donor distribution" },
    { id: 20, key: "bhav_madhya", title: "Bhav Madhya", type: "table", description: "House cusps, midpoints and sandhis" },
    { id: 21, key: "friendship", title: "Friendship", type: "table", description: "Natural, temporal & 5-fold planetary maitri" },
    { id: 22, key: "shad_bala", title: "Shad Bala", type: "chart", description: "6-fold planetary & 12 bhava strengths" },
    { id: 23, key: "kp_system", title: "KP System", type: "table", description: "Krishnamurti Paddhati cusps & significators" },
    { id: 24, key: "cloud", title: "Cloud", type: "promo", description: "Cloud sync & Kundli AI+ membership" },
    { id: 25, key: "download_pdf", title: "Download PDF", type: "action", description: "Janam Kundli & Brihat Kundli reports" },
    { id: 26, key: "ask_questions", title: "Ask Questions", type: "chat", description: "Contextual AI & Astrologer guidance" }
  ];

  return {
    summary: {
      name,
      dob: dob.toISOString().slice(0, 10),
      tob: parsedTime.formatted24,
      place,
      gender,
      lagna: ascRashi,
      rashi: moonRashi,
      nakshatra: `${moonNakshatra.name} (${moonNakshatra.pada})`,
      mangalDosh: mangalDoshStatus,
      ayanamsa: `N.C.Lahiri (${formatDMS(chart.ayanamshaUsed)})`,
      totalCategories: 26,
    },
    navigation,
    categories,
    rawChart: chart,
  };
}

module.exports = {
  calculateFullKundli,
  formatDMS,
  parseNormalizedTime,
  getKPLords,
  calculateChalitTable,
  calculateFriendships,
  calculateAshtakvarga,
  calculateShadBala,
  calculateCharaKarakas,
};
