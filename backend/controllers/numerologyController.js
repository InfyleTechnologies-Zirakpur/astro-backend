const NumerologyProfile = require("../models/numerologyProfile");
const NumeroConversation = require("../models/numeroConversation");
const { askNumeroQuestion } = require("../services/numerology/numeroRagService");
const { buildNumeroContext, normalizeFullName, parseDateInput } = require("../services/numerology/numerologyService");

// PUT /api/numerology/profile — create or update the caller's name + DOB.
const upsertProfile = async (req, res, next) => {
  try {
    const { fullName, dateOfBirth } = req.body || {};
    const cleanName = normalizeFullName(fullName);
    if (!cleanName || cleanName.length < 2 || cleanName.length > 100) {
      return res.status(400).json({ success: false, message: "fullName is required (2-100 characters)" });
    }
    const dt = parseDateInput(dateOfBirth);
    if (!dt) {
      return res.status(400).json({ success: false, message: "dateOfBirth must be a valid past date (YYYY-MM-DD or DD/MM/YYYY)" });
    }

    const profile = await NumerologyProfile.findOneAndUpdate(
      { user: req.user._id },
      { user: req.user._id, fullName: cleanName, dateOfBirth: dt },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ success: true, message: "Numerology profile saved", data: profile });
  } catch (error) {
    next(error);
  }
};

// GET /api/numerology/profile
const getProfile = async (req, res, next) => {
  try {
    const profile = await NumerologyProfile.findOne({ user: req.user._id }).lean();
    if (!profile) return res.status(404).json({ success: false, message: "No numerology profile found. Save your name and date of birth first." });
    res.json({ success: true, message: "Numerology profile retrieved", data: profile });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/numerology/ask
 * body: { question: string, fullName?: string, dateOfBirth?: string }
 * Uses the stored profile by default; optional fullName/dateOfBirth lets the
 * user try "what if" questions without overwriting the saved profile.
 */
const ask = async (req, res, next) => {
  try {
    const { question, fullName, dateOfBirth } = req.body || {};
    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ success: false, message: "question is required" });
    }
    if (question.length > 1000) {
      return res.status(400).json({ success: false, message: "question is too long (max 1000 characters)" });
    }

    let numeroContext = null;
    if (fullName || dateOfBirth) {
      numeroContext = buildNumeroContext({ fullName: fullName, dateOfBirth: dateOfBirth });
      if (!numeroContext) {
        return res.status(400).json({ success: false, message: "Provide a valid fullName (2-100 chars) and past dateOfBirth for one-off questions, or save a profile first." });
      }
    } else {
      const profile = await NumerologyProfile.findOne({ user: req.user._id }).lean();
      if (!profile) {
        return res.status(400).json({ success: false, message: "Save your numerology profile (name + date of birth) before asking questions." });
      }
      numeroContext = profile.numeroContext;
    }

    const result = await askNumeroQuestion(question.trim(), { numeroContext });
    await NumeroConversation.create({
      user: req.user._id,
      question: question.trim(),
      answer: result.answer,
      sources: result.sources,
      numeroContext,
    });
    res.json({ success: true, message: "Answer generated", data: { ...result, numeroContext } });
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

    const conversations = await NumeroConversation.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, message: "Numerology chat history retrieved", data: conversations, pagination: { limit, hasMore: conversations.length === limit } });
  } catch (error) { next(error); }
};

module.exports = { upsertProfile, getProfile, ask, getHistory };
