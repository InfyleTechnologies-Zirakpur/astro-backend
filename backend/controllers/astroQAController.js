const mongoose = require("mongoose");
const Horoscope = require("../models/horoscope");
const User = require("../models/user");
const { askAstroQuestion } = require("../services/rag/ragService");
const { buildChartContextForQA } = require("../services/vedicAstrologyService");
const { summarizeVedicAnalysis } = require("../services/vedicAnalysisService");
const { normalizeTimeOfBirth } = require("../services/astrologyService");
const { calculateGunaMilan } = require("../services/gunaMilanService");
const { getDashaTimeline, getDashaHouseActivations } = require("../services/dashaService");
const AstroConversation = require("../models/astroConversation");

// Dasha periods are anchored to the birth instant, so the stored timezone
// offset has to be applied rather than using raw dateOfBirth, which Mongoose
// hands back as UTC midnight.
const birthInstantOf = (horoscope) => {
  if (!horoscope?.dateOfBirth) return null;
  const normalizedTime = normalizeTimeOfBirth(horoscope.timeOfBirth) || "00:00";
  const [hh, mm] = normalizedTime.split(":").map(Number);
  const localMillis = Date.UTC(
    horoscope.dateOfBirth.getUTCFullYear(),
    horoscope.dateOfBirth.getUTCMonth(),
    horoscope.dateOfBirth.getUTCDate(),
    hh, mm
  );
  return new Date(localMillis - (horoscope.timeZoneOffsetMinutes || 0) * 60 * 1000);
};

// Compact running-Vimshottari summary for the LLM prompt. Deliberately small:
// the full timeline is ~120 years of periods, which would crowd out the chart
// and knowledge-base context. This is the slice that answers "what is active
// for me right now" and "is this a good time", which is the whole point of
// having dasha in the model at all.
const dashaSummary = (horoscope, at = new Date()) => {
  const moonLongitude = horoscope?.vedicChart?.planets?.Moon?.longitude;
  const birthDate = birthInstantOf(horoscope);
  if (!Number.isFinite(moonLongitude) || !birthDate) return null;

  const timeline = getDashaTimeline({ moonSiderealLongitude: moonLongitude, birthDate, atDate: at });
  if (!timeline.current) return null;

  const nextMahadasha = timeline.mahadashas.find((period) => period.start > at);

  return {
    asOf: at.toISOString().slice(0, 10),
    balanceAtBirth: timeline.balance,
    mahadasha: timeline.current.mahadasha,
    antardasha: timeline.current.antardasha,
    pratyantardasha: timeline.current.pratyantardasha,
    houseActivations: getDashaHouseActivations({ planets: horoscope.vedicChart.planets, timeline }),
    ...(nextMahadasha
      ? { nextMahadasha: { planet: nextMahadasha.planet, start: nextMahadasha.start, end: nextMahadasha.end } }
      : {}),
  };
};

/**
 * POST /api/astro-qa/ask
 * body: { question: string, partnerId?: string }
 *
 * If partnerId is provided, grounds the answer in the compatibility
 * between the logged-in user and that partner (both must have a
 * Horoscope on file). Otherwise answers as a general knowledge-base
 * question (no personal chart data attached).
 */
const ask = async (req, res, next) => {
  try {
    const { question, partnerId } = req.body;
    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ success: false, message: "question is required" });
    }
    if (question.length > 1000) {
      return res.status(400).json({ success: false, message: "question is too long (max 1000 characters)" });
    }

    let chartContext = null;

    if (partnerId) {
      if (!mongoose.isValidObjectId(partnerId)) {
        return res.status(400).json({ success: false, message: "Invalid partnerId" });
      }

      const [myHoroscope, partner, partnerHoroscope] = await Promise.all([
        Horoscope.findOne({ user: req.user._id }).lean(),
        User.findOne({ _id: partnerId, isActive: true }).select("name gender").lean(),
        Horoscope.findOne({ user: partnerId }).lean(),
      ]);

      if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });
      if (!myHoroscope || !partnerHoroscope) {
        return res.status(400).json({ success: false, message: "Both you and the partner must have a horoscope on file to ask a partner-specific question." });
      }

      let gunaMilan = null;
      const moonLonA = myHoroscope.vedicChart?.planets?.Moon?.longitude;
      const moonLonB = partnerHoroscope.vedicChart?.planets?.Moon?.longitude;
      if (Number.isFinite(moonLonA) && Number.isFinite(moonLonB)) {
        gunaMilan = calculateGunaMilan(moonLonA, moonLonB);
      }

      chartContext = buildChartContextForQA({
        chartA: myHoroscope.vedicChart,
        chartB: partnerHoroscope.vedicChart,
        gunaMilan,
        dashaA: dashaSummary(myHoroscope),
        dashaB: dashaSummary(partnerHoroscope),
        analysisA: summarizeVedicAnalysis(myHoroscope.vedicAnalysis),
        analysisB: summarizeVedicAnalysis(partnerHoroscope.vedicAnalysis),
      });
    } else {
      // General question — still attach the asker's own chart if they have
      // one on file, since most questions ("will I get married", "why do I
      // keep attracting the wrong people") are implicitly about themselves.
      const myHoroscope = await Horoscope.findOne({ user: req.user._id }).lean();
      if (myHoroscope?.vedicChart) {
        chartContext = buildChartContextForQA({
          chartA: myHoroscope.vedicChart,
          dashaA: dashaSummary(myHoroscope),
          analysisA: summarizeVedicAnalysis(myHoroscope.vedicAnalysis),
        });
      }
    }

    const result = await askAstroQuestion(question.trim(), { chartContext });
    await AstroConversation.create({
      user: req.user._id,
      partner: partnerId || null,
      question: question.trim(),
      answer: result.answer,
      sources: result.sources,
    });
    res.json({ success: true, message: "Answer generated", data: result });
  } catch (error) {
    next(error);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const before = req.query.before && !Number.isNaN(Date.parse(req.query.before)) ? new Date(req.query.before) : null;
    const filter = { user: req.user._id };
    if (before) filter.createdAt = { $lt: before };

    const conversations = await AstroConversation.find(filter)
      .populate("partner", "name gender")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, message: "Astro chat history retrieved", data: conversations, pagination: { limit, hasMore: conversations.length === limit } });
  } catch (error) { next(error); }
};

module.exports = { ask, getHistory };
