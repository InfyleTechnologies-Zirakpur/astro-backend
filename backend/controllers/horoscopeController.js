const Horoscope = require("../models/horoscope");
const { calculateNatalChart } = require("../services/astrologyService");
const { resolveBirthLocationFromPlace } = require("../services/birthLocationService");

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

module.exports = { createHoroscope, getMyHoroscope, updateHoroscope };
