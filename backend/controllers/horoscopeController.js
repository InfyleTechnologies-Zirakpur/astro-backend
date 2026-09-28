const Horoscope = require("../models/horoscope");
const { calculateNatalChart, normalizeTimeOfBirth } = require("../services/astrologyService");
const { resolveBirthLocationFromPlace } = require("../services/birthLocationService");
const { getDashaTimeline, getDashaHouseActivations } = require("../services/dashaService");

// Public API accepts the user-friendly names below:
// birthDate, birthTime (e.g. "4:45 PM"), and birthPlace.
// The database keeps the canonical field names used by the Horoscope model.
const buildHoroscopeData = (body) => {
  const data = {};

  if (body.name !== undefined) data.name = body.name;
  if (body.birthDate !== undefined) data.dateOfBirth = body.birthDate;
  else if (body.dateOfBirth !== undefined) data.dateOfBirth = body.dateOfBirth;

  if (body.birthTime !== undefined) data.timeOfBirth = body.birthTime;
  else if (body.timeOfBirth !== undefined) data.timeOfBirth = body.timeOfBirth;

  if (body.birthPlace !== undefined) data.placeOfBirth = body.birthPlace;
  else if (body.placeOfBirth !== undefined) data.placeOfBirth = body.placeOfBirth;

  if (body.moonSign !== undefined) data.moonSign = body.moonSign;
  if (body.nakshatra !== undefined) data.nakshatra = body.nakshatra;

  if (body.timeZoneId !== undefined) data.timeZoneId = body.timeZoneId;

  return data;
};

const includeCalculatedChart = (horoscope) => {
  const data = horoscope.toObject();
  const chart = calculateNatalChart(horoscope);
  return { ...data, sunSign: chart.sunSign, calculatedMoonSign: chart.moonSign, moonSignPrecision: chart.precision };
};

const hydrateBirthLocation = async (body) => {
  const place = body.birthPlace || body.placeOfBirth || body.place || "";
  const baseData = buildHoroscopeData(body);

  // Explicit user-supplied offset bypasses geo-resolved data entirely.
  // The user owns the value; we just record it as high-trust precision.
  if (body.timeZoneOffsetMinutes !== undefined && Number.isFinite(Number(body.timeZoneOffsetMinutes))) {
    baseData.timeZoneOffsetMinutes = Number(body.timeZoneOffsetMinutes);
    baseData.timeZonePrecision = "user";
    if (body.latitude !== undefined && body.longitude !== undefined) {
      baseData.latitude = Number(body.latitude);
      baseData.longitude = Number(body.longitude);
    }
    return baseData;
  }

  if (!place) return baseData;

  const birthDate = body.birthDate || body.dateOfBirth;
  const resolved = await resolveBirthLocationFromPlace(place, birthDate);
  if (!resolved) {
    const error = new Error("Could not resolve the birth place to coordinates and timezone. Please check the place name or provide a timezone offset manually.");
    error.expose = true;
    error.statusCode = 400;
    throw error;
  }

  return {
    ...baseData,
    placeOfBirth: resolved.placeOfBirth,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    timeZoneOffsetMinutes: resolved.timeZoneOffsetMinutes,
    timeZoneId: resolved.timeZoneId,
    timeZonePrecision: resolved.timeZonePrecision,
  };
};

const createHoroscope = async (req, res, next) => {
  try {
    const data = await hydrateBirthLocation(req.body);
    const horoscope = await Horoscope.create({ user: req.user._id, ...data });
    res.status(201).json({ success: true, message: "Horoscope created", data: horoscope });
  } catch (error) { next(error); }
};

const getMyHoroscope = async (req, res, next) => {
  try {
    const horoscope = await Horoscope.findOne({ user: req.user._id });
    if (!horoscope) return res.status(404).json({ success: false, message: "Horoscope not found" });
    res.json({ success: true, message: "Horoscope retrieved", data: includeCalculatedChart(horoscope) });
  } catch (error) { next(error); }
};

const updateHoroscope = async (req, res, next) => {
  try {
    const data = await hydrateBirthLocation(req.body);
    const horoscope = await Horoscope.findOne({ user: req.user._id });
    if (!horoscope) return res.status(404).json({ success: false, message: "Horoscope not found" });
    Object.assign(horoscope, data);
    await horoscope.save();
    res.json({ success: true, message: "Horoscope updated", data: includeCalculatedChart(horoscope) });
  } catch (error) { next(error); }
};

// GET /api/horoscope/dasha?at=YYYY-MM-DD
// Vimshottari timing for the logged-in user. Defaults to "now".
// Returns the running mahadasha/antar-dasha/pratyantardasha plus the
// house cross-reference, which is what makes dasha actionable: the course
// rule is that a malefic in a difficult house does nothing until ITS dasha
// activates it.
const getMyDasha = async (req, res, next) => {
  try {
    const horoscope = await Horoscope.findOne({ user: req.user._id }).lean();
    if (!horoscope) return res.status(404).json({ success: false, message: "Horoscope not found" });

    const moonLongitude = horoscope.vedicChart?.planets?.Moon?.longitude;
    if (!Number.isFinite(moonLongitude)) {
      return res.status(400).json({
        success: false,
        message: "Vimshottari dasha needs the Moon's sidereal longitude, but no Vedic chart is on file. Save your birth date, time and place first.",
      });
    }

    let at = new Date();
    if (req.query.at) {
      const parsed = new Date(req.query.at);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, message: "at must be a valid date" });
      }
      at = parsed;
    }

    // Dasha periods are anchored to the birth instant, so the stored timezone
    // offset has to be applied rather than using raw dateOfBirth, which
    // Mongoose hands back as UTC midnight.
    const normalizedTime = normalizeTimeOfBirth(horoscope.timeOfBirth) || "00:00";
    const [hh, mm] = normalizedTime.split(":").map(Number);
    const localMillis = Date.UTC(
      horoscope.dateOfBirth.getUTCFullYear(),
      horoscope.dateOfBirth.getUTCMonth(),
      horoscope.dateOfBirth.getUTCDate(),
      hh, mm
    );
    const birthInstant = new Date(localMillis - (horoscope.timeZoneOffsetMinutes || 0) * 60 * 1000);

    const timeline = getDashaTimeline({
      moonSiderealLongitude: moonLongitude,
      birthDate: birthInstant,
      atDate: at,
    });

    if (!timeline.current) {
      return res.status(400).json({
        success: false,
        message: `The requested date (${at.toISOString().slice(0, 10)}) is before this user's birth date.`,
      });
    }

    res.json({
      success: true,
      message: "Vimshottari dasha retrieved",
      data: {
        asOf: at,
        balanceAtBirth: timeline.balance,
        current: timeline.current,
        antardashas: timeline.antardashas,
        pratyantardashas: timeline.pratyantardashas,
        houseActivations: getDashaHouseActivations({ planets: horoscope.vedicChart.planets, timeline }),
        upcomingMahadashas: timeline.mahadashas
          .filter((m) => m.start > at)
          .slice(0, 4)
          .map(({ planet, start, end, years }) => ({ planet, start, end, years })),
      },
    });
  } catch (error) { next(error); }
};

module.exports = { createHoroscope, getMyHoroscope, updateHoroscope, getMyDasha };
