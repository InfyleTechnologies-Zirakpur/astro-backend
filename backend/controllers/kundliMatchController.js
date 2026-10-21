// Kundli Milan — the 36-point Ashtakoot Guna Milan for a couple, run from the
// customer's app (the astrologer profile sends the reading to the astrologer).
//
// The app sends both partners' birth details; this endpoint resolves their
// places, computes the charts with the full ephemeris
// (services/vedicAstrologyService.js) and scores the match with the shared
// Ashtakoot implementation (services/gunaMilanService.js).
//
// The response carries the Moon's sidereal longitude for each partner so the
// client can re-score the match with exactly the same rules and describe each
// factor in the astrologer's own language.

const {
  calculateVedicChart,
  getNakshatra,
} = require("../services/vedicAstrologyService");
const { calculateGunaMilan } = require("../services/gunaMilanService");
const { resolveBirthLocationFromPlace } = require("../services/birthLocationService");

const MANGAL_HOUSES = [1, 2, 4, 7, 8, 12];

const pad = (value) => String(value).padStart(2, "0");

const toDateLabel = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const toTimeLabel = (timeOfBirth) => {
  if (!timeOfBirth) return "—";
  const [hours, minutes] = String(timeOfBirth).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "—";
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(displayHour)}:${pad(minutes)} ${suffix}`;
};

// "(027N11 078E00)" — the compact coordinate form astrologers read.
const toCoordinateLabel = (latitude, longitude) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  const part = (value, positive, negative) => {
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutes = Math.round((absolute - degrees) * 60);
    return `${String(degrees).padStart(3, "0")}${value >= 0 ? positive : negative}${pad(minutes)}`;
  };
  return `(${part(latitude, "N", "S")} ${part(longitude, "E", "W")})`;
};

const parseDateOfBirth = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const normalizeTimeOfBirth = (value) => {
  if (!value) return "";
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${pad(hours)}:${pad(minutes)}`;
};

// Resolves one partner's birth data into everything the chart needs.
// Coordinates come from the client when it knows them (the app's offline city
// catalogue); otherwise the place name is geocoded and its time zone looked
// up.
const resolvePerson = async (input) => {
  const dateOfBirth = parseDateOfBirth(input?.dateOfBirth);
  if (!dateOfBirth) {
    return { error: "dateOfBirth is required for both partners" };
  }

  const timeOfBirth = normalizeTimeOfBirth(input?.timeOfBirth);
  let latitude = Number(input?.latitude);
  let longitude = Number(input?.longitude);
  let timeZoneOffsetMinutes = Number.isFinite(Number(input?.timeZoneOffsetMinutes))
    ? Number(input.timeZoneOffsetMinutes)
    : 330;
  let place = String(input?.place || "").trim();

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const resolved = await resolveBirthLocationFromPlace(place, dateOfBirth);
    if (!resolved) {
      return {
        error:
          "We could not locate that place of birth. Send the coordinates, or spell the place differently.",
      };
    }
    latitude = resolved.latitude;
    longitude = resolved.longitude;
    timeZoneOffsetMinutes = resolved.timeZoneOffsetMinutes;
    place = resolved.placeOfBirth || place;
  }

  return {
    person: {
      name: String(input?.name || "").trim(),
      dateOfBirth,
      timeOfBirth,
      place,
      latitude,
      longitude,
      timeZoneOffsetMinutes,
    },
  };
};

const describePerson = (person, chart) => {
  const planets = chart.planets || {};
  const moon = planets.Moon || {};
  const sun = planets.Sun || {};
  const mars = planets.Mars || {};
  const moonLongitude = Number.isFinite(moon.longitude) ? moon.longitude : null;
  const moonNakshatra = moonLongitude != null ? getNakshatra(moonLongitude) : null;

  const ascendant = chart.ascendant || null;
  const ascendantLongitude = ascendant ? Number(ascendant.longitude) : null;
  const marsLongitude = Number.isFinite(mars.longitude) ? mars.longitude : null;

  // Mangal dosha: Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house counted
  // from the Lagna, or from the Moon sign when there is no Lagna.
  let mangalDosha = false;
  if (marsLongitude != null) {
    const references = [];
    if (ascendantLongitude != null) references.push(ascendantLongitude);
    if (moonLongitude != null) references.push(moonLongitude);
    mangalDosha = references.some((reference) => {
      const house = Math.floor((((marsLongitude - reference) % 360) + 360) % 360 / 30) + 1;
      return MANGAL_HOUSES.includes(house);
    });
  }

  return {
    name: person.name,
    dateLabel: toDateLabel(person.dateOfBirth),
    timeLabel: toTimeLabel(person.timeOfBirth),
    place: person.place,
    coordinates: toCoordinateLabel(person.latitude, person.longitude),
    sunSign: sun.rashi || "",
    moonSign: chart.moonRashi || "",
    nakshatra: moonNakshatra ? moonNakshatra.name : "",
    pada: moonNakshatra ? moonNakshatra.pada : 0,
    lagna: ascendant ? ascendant.rashi : "",
    navamsaLagna: ascendant ? ascendant.navamshaSign || "" : "",
    mangalDosha,
    varna: "",
    gana: "",
    nadi: "",
    moonLongitude,
    hasFullChart: chart.precision === "full",
  };
};

// POST /api/kundli/match (also mounted at /api/astrologer/kundli-match)
const kundliMatch = async (req, res, next) => {
  try {
    const { boy, girl } = req.body || {};

    const [boyResult, girlResult] = await Promise.all([
      resolvePerson(boy),
      resolvePerson(girl),
    ]);
    if (boyResult.error) {
      return res.status(400).json({ success: false, message: boyResult.error });
    }
    if (girlResult.error) {
      return res.status(400).json({ success: false, message: girlResult.error });
    }

    const boyChart = calculateVedicChart({
      dateOfBirth: boyResult.person.dateOfBirth,
      timeOfBirth: boyResult.person.timeOfBirth,
      timeZoneOffsetMinutes: boyResult.person.timeZoneOffsetMinutes,
      latitude: boyResult.person.latitude,
      longitude: boyResult.person.longitude,
    });
    const girlChart = calculateVedicChart({
      dateOfBirth: girlResult.person.dateOfBirth,
      timeOfBirth: girlResult.person.timeOfBirth,
      timeZoneOffsetMinutes: girlResult.person.timeZoneOffsetMinutes,
      latitude: girlResult.person.latitude,
      longitude: girlResult.person.longitude,
    });

    const boyMoon = Number(boyChart.planets?.Moon?.longitude);
    const girlMoon = Number(girlChart.planets?.Moon?.longitude);
    if (!Number.isFinite(boyMoon) || !Number.isFinite(girlMoon)) {
      return res.status(422).json({
        success: false,
        message: "The charts could not be calculated for these birth details.",
      });
    }

    const gunaMilan = calculateGunaMilan(boyMoon, girlMoon);

    res.json({
      success: true,
      message: "Kundli Milan calculated",
      data: {
        source: "server",
        generatedAt: new Date().toISOString(),
        boy: describePerson(boyResult.person, boyChart),
        girl: describePerson(girlResult.person, girlChart),
        gunaMilan: {
          factors: Object.entries(gunaMilan.factors).map(([key, value]) => ({
            key,
            points: value.points,
            max: value.max,
          })),
          doshas: gunaMilan.doshas.map((dosha) => ({
            name: dosha.name,
            severity: dosha.severity,
            note: dosha.note,
          })),
          totalPoints: gunaMilan.totalPoints,
          maxPoints: gunaMilan.maxPoints,
          percentage: gunaMilan.percentage,
          verdict: gunaMilan.verdict,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { kundliMatch };
