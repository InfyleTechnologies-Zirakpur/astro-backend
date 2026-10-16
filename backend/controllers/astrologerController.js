const mongoose = require("mongoose");
const User = require("../models/user");
const AstrologerProfile = require("../models/astrologerProfile");
const Match = require("../models/match");
const Review = require("../models/review");
const ConsultationQueue = require("../models/consultationQueue");
const WalletTransaction = require("../models/walletTransaction");
const Message = require("../models/message");
const { getIo, isUserInCall } = require("../services/socketHub");
const {
  FREE_MINUTES_DEFAULT,
  MIN_PAID_BLOCK_MIN,
  freeRemainingSecFor,
} = require("../services/consultationBilling");

const FREE_DEFAULT_SEC = FREE_MINUTES_DEFAULT * 60;

const toCard = (profile, extra = {}) => ({
  id: profile.user?._id || profile.user,
  userId: profile.user?._id || profile.user,
  name: profile.displayName,
  photo: profile.photo,
  bio: profile.bio,
  expertise: profile.expertise,
  languages: profile.languages,
  experienceYears: profile.experienceYears,
  rateChatPerMin: profile.rateChatPerMin,
  rateCallPerMin: profile.rateCallPerMin,
  isOnline: profile.isOnline,
  isVerified: profile.isVerified,
  ratingAvg: profile.ratingAvg,
  ratingCount: profile.ratingCount,
  totalConsultations: profile.totalConsultations,
  ...extra,
});

// GET /api/astrologers — client listing with search/filter/sort
const listAstrologers = async (req, res, next) => {
  try {
    const { search, expertise, language, maxRate, minRating, online, sort = "rating" } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const filter = { isVerified: true };
    if (expertise) filter.expertise = { $in: [expertise] };
    if (language) filter.languages = { $in: [language] };
    if (minRating) filter.ratingAvg = { $gte: Number(minRating) };
    if (maxRate) {
      const r = Number(maxRate);
      filter.$or = [{ rateChatPerMin: { $lte: r } }, { rateCallPerMin: { $lte: r } }];
    }
    if (online === "true") filter.isOnline = true;
    if (search) {
      filter.$text = { $search: search };
    }

    // Exclude deactivated users
    const activeUsers = await User.find({ role: "astrologer", isActive: true }).select("_id").lean();
    filter.user = { $in: activeUsers.map((u) => u._id) };

    const sortMap = {
      rating: { ratingAvg: -1, totalConsultations: -1 },
      price_low: { rateChatPerMin: 1 },
      price_high: { rateChatPerMin: -1 },
      experience: { experienceYears: -1 },
      newest: { createdAt: -1 },
    };

    const [profiles, total] = await Promise.all([
      AstrologerProfile.find(filter)
        .sort(sortMap[sort] || sortMap.rating)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AstrologerProfile.countDocuments(filter),
    ]);

    const data = await Promise.all(
      profiles.map(async (p) => {
        const astrologerId = String(p.user);
        const freeRemainingSec =
          req.user && String(req.user._id) !== astrologerId
            ? await freeRemainingSecFor(req.user._id, p.user, p)
            : (p.freeMinutesLimitMin ?? 10) * 60;
        return toCard(p, {
          isBusy: isUserInCall(astrologerId),
          freeRemainingSec,
          hasFreeTrial: freeRemainingSec > 0,
        });
      })
    );

    res.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

// GET /api/astrologers/:id
const getAstrologerDetail = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid astrologer id" });
    }
    const user = await User.findOne({ _id: req.params.id, role: "astrologer", isActive: true }).lean();
    if (!user) return res.status(404).json({ success: false, message: "Astrologer not found" });
    const profile = await AstrologerProfile.findOne({ user: user._id }).lean();
    if (!profile) return res.status(404).json({ success: false, message: "Astrologer profile not found" });

    const freeRemainingSec = req.user
      ? await freeRemainingSecFor(req.user._id, user._id, profile)
      : (profile.freeMinutesLimitMin ?? 10) * 60;

    const recentReviews = await Review.find({ astrologer: user._id })
      .populate("client", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      data: {
        ...toCard({ ...profile, user }, {
          isBusy: isUserInCall(String(user._id)),
          freeRemainingSec,
          hasFreeTrial: freeRemainingSec > 0,
          email: undefined,
        }),
        recentReviews,
      },
    });
  } catch (error) { next(error); }
};

// GET /api/astrologers/:id/reviews
const listReviews = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const [items, total] = await Promise.all([
      Review.find({ astrologer: req.params.id })
        .populate("client", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Review.countDocuments({ astrologer: req.params.id }),
    ]);
    res.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
  } catch (error) { next(error); }
};

// PATCH /api/astrologer/availability — astrologer toggles online
const updateAvailability = async (req, res, next) => {
  try {
    const { isOnline } = req.body;
    if (typeof isOnline !== "boolean") {
      return res.status(400).json({ success: false, message: "isOnline (boolean) is required" });
    }
    const profile = await AstrologerProfile.findOneAndUpdate(
      { user: req.user._id },
      { isOnline },
      { new: true }
    );
    if (!profile) return res.status(404).json({ success: false, message: "Astrologer profile not found" });
    const io = getIo();
    if (io) io.emit("astrologer:status", { astrologerId: String(req.user._id), isOnline, isBusy: isUserInCall(String(req.user._id)) });
    res.json({ success: true, message: isOnline ? "You are now online" : "You are now offline", data: profile });
  } catch (error) { next(error); }
};

// PATCH /api/astrologer/profile — astrologer edits own profile
const updateOwnProfile = async (req, res, next) => {
  try {
    const allowed = ["displayName", "photo", "bio", "expertise", "languages", "experienceYears", "rateChatPerMin", "rateCallPerMin"];
    const update = {};
    for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
    if (update.expertise && !Array.isArray(update.expertise)) return res.status(400).json({ success: false, message: "expertise must be an array" });
    if (update.languages && !Array.isArray(update.languages)) return res.status(400).json({ success: false, message: "languages must be an array" });
    const profile = await AstrologerProfile.findOneAndUpdate({ user: req.user._id }, update, { new: true, runValidators: true });
    if (!profile) return res.status(404).json({ success: false, message: "Astrologer profile not found" });
    res.json({ success: true, message: "Profile updated", data: profile });
  } catch (error) { next(error); }
};

// GET /api/astrologer/chats — astrologer's consultation list with last message
const getAstrologerChats = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {
      matchType: "consultation",
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
    };
    if (req.query.status) filter.status = req.query.status;
    const [matches, total] = await Promise.all([
      Match.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate("userA", "name").populate("userB", "name").lean(),
      Match.countDocuments(filter),
    ]);
    const matchIds = matches.map((m) => m._id);
    const lastMessages = await Message.aggregate([
      { $match: { match: { $in: matchIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$match", lastMessage: { $first: "$$ROOT" }, unreadCount: { $sum: { $cond: [{ $and: [{ $eq: ["$recipient", req.user._id] }, { $eq: ["$readAt", null] }] }, 1, 0] } } } },
    ]);
    const lastMap = new Map(lastMessages.map((l) => [String(l._id), l]));
    res.json({
      success: true,
      data: matches.map((m) => ({ ...m, lastMessage: lastMap.get(String(m._id))?.lastMessage || null, unreadCount: lastMap.get(String(m._id))?.unreadCount || 0 })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

// GET /api/astrologer/queue
const getAstrologerQueue = async (req, res, next) => {
  try {
    const items = await ConsultationQueue.find({ astrologer: req.user._id, status: "waiting" })
      .populate("client", "name email").sort({ createdAt: 1 }).lean();
    const queued = items.map((q, i) => ({ ...q, position: i + 1 }));
    res.json({ success: true, data: queued });
  } catch (error) { next(error); }
};

// GET /api/astrologer/earnings
const getEarnings = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from && !Number.isNaN(Date.parse(from))) dateFilter.$gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) dateFilter.$lte = new Date(to);
    const txFilter = { user: req.user._id, reason: "consultation_earning" };
    if (dateFilter.$gte || dateFilter.$lte) txFilter.createdAt = { ...(dateFilter.$gte ? { $gte: dateFilter.$gte } : {}), ...(dateFilter.$lte ? { $lte: dateFilter.$lte } : {}) };

    const [earningTxs, profile] = await Promise.all([
      WalletTransaction.find(txFilter).sort({ createdAt: -1 }).limit(200).lean(),
      AstrologerProfile.findOne({ user: req.user._id }).lean(),
    ]);
    const totalEarnings = earningTxs.reduce((s, t) => s + t.amount, 0);
    const sessions = await Match.countDocuments({ matchType: "consultation", $or: [{ userA: req.user._id }, { userB: req.user._id }], status: "ended" });
    res.json({
      success: true,
      data: {
        totalEarnings,
        lifetimeEarnings: profile?.totalEarnings || 0,
        totalConsultations: profile?.totalConsultations || sessions,
        totalFreeMinutesGiven: profile?.totalFreeMinutesGiven || 0,
        ratingAvg: profile?.ratingAvg || 0,
        ratingCount: profile?.ratingCount || 0,
        recentEarnings: earningTxs,
      },
    });
  } catch (error) { next(error); }
};

module.exports = {
  listAstrologers,
  getAstrologerDetail,
  listReviews,
  updateAvailability,
  updateOwnProfile,
  getAstrologerChats,
  getAstrologerQueue,
  getEarnings,
  freeRemainingSecFor,
  FREE_DEFAULT_SEC,
  MIN_PAID_BLOCK_MIN,
};
