const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Profile = require("../models/profile");
const Match = require("../models/match");
const Message = require("../models/message");
const Questionnaire = require("../models/questionnaire");
const Horoscope = require("../models/horoscope");
const AstroConversation = require("../models/astroConversation");
const DeviceToken = require("../models/deviceToken");

const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.role !== "admin") {
      return res.status(401).json({ success: false, message: "Invalid admin credentials" });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Your account is inactive" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: "Invalid admin credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({ success: true, message: "Login successful", user: user.toSafeObject(), token });
  } catch (error) { next(error); }
};

const adminMe = async (req, res, next) => {
  try {
    res.json({ success: true, data: req.user.toSafeObject() });
  } catch (error) { next(error); }
};

const getStats = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      newUsersToday,
      newUsersWeek,
      completedProfiles,
      totalMatches,
      acceptedMatches,
      pendingMatches,
      totalMessages,
      mediaMessages,
      totalChats,
      astroConversations,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
      User.countDocuments({ createdAt: { $gte: weekStart } }),
      Profile.countDocuments({ profileCompleted: true }),
      Match.countDocuments(),
      Match.countDocuments({ status: "accepted" }),
      Match.countDocuments({ status: "pending" }),
      Message.countDocuments(),
      Message.countDocuments({ type: "media" }),
      Message.distinct("match").then((ids) => ids.length),
      AstroConversation.countDocuments(),
    ]);

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      const [registrations, messages] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: day, $lt: next } }),
        Message.countDocuments({ createdAt: { $gte: day, $lt: next } }),
      ]);
      last7Days.push({ date: day.toISOString().slice(0, 10), registrations, messages });
    }

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        newUsersToday,
        newUsersWeek,
        completedProfiles,
        totalMatches,
        acceptedMatches,
        pendingMatches,
        totalMessages,
        mediaMessages,
        totalChats,
        astroConversations,
        last7Days,
      },
    });
  } catch (error) { next(error); }
};

const listUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const { search, gender, role, status, sort } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (gender) filter.gender = gender;
    if (role) filter.role = role;
    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      name: { name: 1 },
    };
    const sortByField = sortMap[sort] || sortMap.newest;

    const [users, total] = await Promise.all([
      User.find(filter).sort(sortByField).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: users.map(({ password, ...user }) => user),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

const getUserDetail = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const [profile, questionnaire, horoscope, matches, messagesSent, deviceTokens] = await Promise.all([
      Profile.findOne({ user: req.params.userId }).lean(),
      Questionnaire.findOne({ user: req.params.userId }).lean(),
      Horoscope.findOne({ user: req.params.userId }).lean(),
      Match.find({ $or: [{ userA: req.params.userId }, { userB: req.params.userId }] }).lean(),
      Message.countDocuments({ sender: req.params.userId }),
      DeviceToken.find({ user: req.params.userId }).select("-token").lean(),
    ]);

    delete user.password;
    res.json({
      success: true,
      data: { user, profile, questionnaire, horoscope, matches, messagesSent, deviceTokens },
    });
  } catch (error) { next(error); }
};

const updateUserStatus = async (req, res, next) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive (boolean) is required" });
    }
    const user = await User.findByIdAndUpdate(req.params.userId, { isActive }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: isActive ? "User activated" : "User deactivated", data: user.toSafeObject() });
  } catch (error) { next(error); }
};

const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be 'user' or 'admin'" });
    }
    const user = await User.findByIdAndUpdate(req.params.userId, { role }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "Role updated", data: user.toSafeObject() });
  } catch (error) { next(error); }
};

const deleteUser = async (req, res, next) => {
  try {
    if (String(req.params.userId) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "You cannot delete your own account" });
    }
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    await Promise.all([
      Profile.deleteMany({ user: req.params.userId }),
      Questionnaire.deleteMany({ user: req.params.userId }),
      Horoscope.deleteMany({ user: req.params.userId }),
      AstroConversation.deleteMany({ user: req.params.userId }),
      DeviceToken.deleteMany({ user: req.params.userId }),
      Message.deleteMany({ sender: req.params.userId }),
      Match.deleteMany({ $or: [{ userA: req.params.userId }, { userB: req.params.userId }] }),
    ]);

    res.json({ success: true, message: "User and related data deleted" });
  } catch (error) { next(error); }
};

const listProfiles = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const { city, relationshipGoal, completed, search } = req.query;

    const filter = {};
    if (city) filter.currentCity = { $regex: city, $options: "i" };
    if (relationshipGoal) filter.relationshipGoal = relationshipGoal;
    if (completed === "true") filter.profileCompleted = true;
    if (completed === "false") filter.profileCompleted = false;

    let userIds;
    if (search) {
      const matched = await User.find({ name: { $regex: search, $options: "i" } }).select("_id").lean();
      userIds = matched.map((user) => user._id);
      if (userIds.length > 0) filter.user = { $in: userIds };
      else filter.user = { $in: [] };
    }

    const [profiles, total] = await Promise.all([
      Profile.find(filter).populate("user", "name email gender isActive role").skip((page - 1) * limit).limit(limit).lean(),
      Profile.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: profiles,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

const getProfileDetail = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ user: req.params.userId })
      .populate("user", "name email gender isActive role createdAt")
      .lean();
    if (!profile) return res.status(404).json({ success: false, message: "Profile not found" });
    res.json({ success: true, data: profile });
  } catch (error) { next(error); }
};

const listMatches = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const { status, minScore, maxScore, search } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (minScore || maxScore) {
      filter.score = {};
      if (minScore) filter.score.$gte = Number(minScore);
      if (maxScore) filter.score.$lte = Number(maxScore);
    }
    if (search) {
      const matched = await User.find({ name: { $regex: search, $options: "i" } }).select("_id").lean();
      const userIds = matched.map((user) => user._id);
      filter.$or = [{ userA: { $in: userIds } }, { userB: { $in: userIds } }];
    }

    const [matches, total] = await Promise.all([
      Match.find(filter)
        .populate("userA", "name email gender")
        .populate("userB", "name email gender")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Match.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: matches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

const getMatchDetail = async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.matchId)
      .populate("userA", "name email gender")
      .populate("userB", "name email gender")
      .lean();
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    const messages = await Message.find({ match: req.params.matchId })
      .populate("sender", "name")
      .populate("recipient", "name")
      .sort({ createdAt: 1 })
      .lean();
    res.json({ success: true, data: { ...match, messages } });
  } catch (error) { next(error); }
};

const updateMatchStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["pending", "accepted", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }
    const match = await Match.findByIdAndUpdate(
      req.params.matchId,
      { status, respondedAt: status === "pending" ? null : new Date() },
      { new: true }
    ).populate("userA", "name email").populate("userB", "name email");
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });
    res.json({ success: true, message: "Match status updated", data: match });
  } catch (error) { next(error); }
};

const listMessages = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const { type, mediaType, search } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (mediaType) filter.mediaType = mediaType;
    if (search) filter.text = { $regex: search, $options: "i" };

    const [messages, total] = await Promise.all([
      Message.find(filter)
        .populate("match", "userA userB")
        .populate("sender", "name email")
        .populate("recipient", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Message.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

const listConversations = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);

    const conversations = await Message.aggregate([
      {
        $group: {
          _id: "$match",
          lastMessageAt: { $max: "$createdAt" },
          messageCount: { $sum: 1 },
          mediaCount: { $sum: { $cond: [{ $eq: ["$type", "media"] }, 1, 0] } },
        },
      },
      { $sort: { lastMessageAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]);

    const matchIds = conversations.map((item) => item._id);
    const matches = await Match.find({ _id: { $in: matchIds } })
      .populate("userA", "name email")
      .populate("userB", "name email")
      .lean();
    const matchMap = new Map(matches.map((match) => [String(match._id), match]));

    const total = await Message.distinct("match").then((ids) => ids.length);

    res.json({
      success: true,
      data: conversations.map((item) => ({
        match: matchMap.get(String(item._id)) || null,
        lastMessageAt: item.lastMessageAt,
        messageCount: item.messageCount,
        mediaCount: item.mediaCount,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

const deleteMessage = async (req, res, next) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: "Message not found" });
    res.json({ success: true, message: "Message deleted" });
  } catch (error) { next(error); }
};

const listQuestionnaires = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const [items, total] = await Promise.all([
      Questionnaire.find().populate("user", "name email gender").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Questionnaire.countDocuments(),
    ]);
    res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

const listHoroscopes = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const [items, total] = await Promise.all([
      Horoscope.find({}, "-vedicChart").populate("user", "name email gender").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Horoscope.countDocuments(),
    ]);
    res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

const getHoroscopeDetail = async (req, res, next) => {
  try {
    const horoscope = await Horoscope.findOne({ user: req.params.userId }).populate("user", "name email").lean();
    if (!horoscope) return res.status(404).json({ success: false, message: "Horoscope not found" });
    res.json({ success: true, data: horoscope });
  } catch (error) { next(error); }
};

const listAstroConversations = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const { search } = req.query;

    const filter = {};
    if (search) filter.question = { $regex: search, $options: "i" };

    const [items, total] = await Promise.all([
      AstroConversation.find(filter)
        .populate("user", "name email")
        .populate("partner", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AstroConversation.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

const listDeviceTokens = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const { platform, active } = req.query;

    const filter = {};
    if (platform) filter.platform = platform;
    if (active === "true") filter.isActive = true;
    if (active === "false") filter.isActive = false;

    const [items, total] = await Promise.all([
      DeviceToken.find(filter).populate("user", "name email").sort({ lastUsedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      DeviceToken.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: items.map((item) => ({ ...item, token: `${item.token.slice(0, 8)}...` })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) { next(error); }
};

const deactivateDeviceToken = async (req, res, next) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive (boolean) is required" });
    }
    const token = await DeviceToken.findByIdAndUpdate(req.params.tokenId, { isActive }, { new: true });
    if (!token) return res.status(404).json({ success: false, message: "Device token not found" });
    res.json({ success: true, message: isActive ? "Token activated" : "Token deactivated", data: token });
  } catch (error) { next(error); }
};

module.exports = {
  adminLogin,
  adminMe,
  getStats,
  listUsers,
  getUserDetail,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  listProfiles,
  getProfileDetail,
  listMatches,
  getMatchDetail,
  updateMatchStatus,
  listMessages,
  listConversations,
  deleteMessage,
  listQuestionnaires,
  listHoroscopes,
  getHoroscopeDetail,
  listAstroConversations,
  listDeviceTokens,
  deactivateDeviceToken,
};