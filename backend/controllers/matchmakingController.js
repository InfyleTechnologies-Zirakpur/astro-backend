const mongoose = require("mongoose");
const User = require("../models/user");
const Profile = require("../models/profile");
const Questionnaire = require("../models/questionnaire");
const Match = require("../models/match");
const Horoscope = require("../models/horoscope");
const { calculateCompatibility } = require("../services/compatibilityService");

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isCompleteQuestionnaire = (questionnaire) => Questionnaire.fields.every((field) => typeof questionnaire?.[field] === "string" && questionnaire[field].trim());

const parsePagination = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const getCompatibilityInputs = async (userId) => Promise.all([
  Profile.findOne({ user: userId }),
  Questionnaire.findOne({ user: userId }),
  Horoscope.findOne({ user: userId }),
]);

const orderedUsers = (first, second) => String(first) < String(second) ? [first, second] : [second, first];

const participantPhotos = async (matches) => {
  const list = matches.map((match) => (typeof match.toObject === "function" ? match.toObject() : match));
  const ids = [];
  for (const match of list) {
    if (match.userA?._id) ids.push(match.userA._id);
    if (match.userB?._id) ids.push(match.userB._id);
  }
  const photosByUser = new Map();
  if (ids.length > 0) {
    const profiles = await Profile.find({ user: { $in: ids } }).select("user photos profilePhoto").lean();
    for (const profile of profiles) {
      const photos = Array.isArray(profile.photos) && profile.photos.length > 0 ? profile.photos : (profile.profilePhoto ? [profile.profilePhoto] : []);
      photosByUser.set(String(profile.user), photos);
    }
  }
  for (const match of list) {
    if (match.userA?._id) match.userA.photos = photosByUser.get(String(match.userA._id)) || [];
    if (match.userB?._id) match.userB.photos = photosByUser.get(String(match.userB._id)) || [];
  }
  return list;
};

const calculateMatch = async (req, res, next) => {
  try {
    const { partnerId } = req.body;
    if (!mongoose.isValidObjectId(partnerId)) return res.status(400).json({ success: false, message: "Invalid partnerId" });
    if (String(req.user._id) === String(partnerId)) return res.status(400).json({ success: false, message: "You cannot match with yourself" });

    const partner = await User.findOne({ _id: partnerId, isActive: true });
    if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });

    // The requester's gender is needed for the Vedic sign-matchmaking rules
    // (Rule 2.2 is gender-specific). The partner's gender is already on the
    // `partner` doc loaded above.
    const [[profileA, questionnaireA, horoscopeA], [profileB, questionnaireB, horoscopeB], requester] = await Promise.all([
      getCompatibilityInputs(req.user._id),
      getCompatibilityInputs(partner._id),
      User.findById(req.user._id).select("gender").lean(),
    ]);
    if (!profileA?.profileCompleted || !profileB?.profileCompleted) return res.status(400).json({ success: false, message: "Both users must complete their profiles before compatibility can be calculated." });
    if (!questionnaireA?.isComplete() || !questionnaireB?.isComplete()) return res.status(400).json({ success: false, message: "Both users must complete their compatibility questionnaire before calculating the match." });
    // Horoscope is optional: if only one (or neither) user has submitted
    // one, the astrology category is simply omitted from the report.

    const [userA, userB] = orderedUsers(req.user._id, partner._id);
    // A/B are canonically ordered by ObjectId, so gender must be looked up by
    // the same ordering — passing `genderA: req.user.gender` would swap
    // partner genders for every pair whose requester sorts second.
    const genderById = new Map([
      [String(req.user._id), requester?.gender],
      [String(partner._id), partner.gender],
    ]);
    const report = calculateCompatibility({
      profileA,
      questionnaireA,
      profileB,
      questionnaireB,
      horoscopeA,
      horoscopeB,
      genderA: genderById.get(String(userA)),
      genderB: genderById.get(String(userB)),
    });
    const existing = await Match.findOne({ userA, userB }).select("requestedBy requestedTo status").lean();
    // Backfill the request sides when older records were created without them,
    // otherwise keep whichever side sent the request first.
    const requestedBy = existing?.requestedBy || req.user._id;
    const requestedTo = existing?.requestedTo || partner._id;
    // Older records also lacked a status field (so $setOnInsert never fired).
    // Always pin status so pending requests stay respondable.
    const status = existing?.status || "pending";
    const match = await Match.findOneAndUpdate(
      { userA, userB },
      { $set: { userA, userB, ...report, requestedBy, requestedTo, status } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, message: "Compatibility calculated", data: match });
  } catch (error) { next(error); }
};

const respondToMatch = async (req, res, next) => {
  try {
    const { decision } = req.body;
    if (!["accepted", "rejected"].includes(decision)) {
      return res.status(400).json({ success: false, message: "decision must be accepted or rejected" });
    }
    if (!mongoose.isValidObjectId(req.params.matchId)) {
      return res.status(400).json({ success: false, message: "Invalid matchId" });
    }

    const match = await Match.findOneAndUpdate(
      { _id: req.params.matchId, requestedTo: req.user._id, status: "pending" },
      { $set: { status: decision, respondedAt: new Date() } },
      { new: true }
    ).populate("userA", "name gender").populate("userB", "name gender");

    if (!match) return res.status(404).json({ success: false, message: "Pending match request not found" });
    const [plain] = await participantPhotos([match]);
    res.json({ success: true, message: `Match request ${decision}`, data: plain });
  } catch (error) { next(error); }
};

const getMatch = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.matchId)) return res.status(400).json({ success: false, message: "Invalid matchId" });
    const match = await Match.findById(req.params.matchId).populate("userA", "name email gender").populate("userB", "name email gender");
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });
    if (!match.userA || !match.userB) return res.status(404).json({ success: false, message: "Match participants no longer exist" });
    if (![String(match.userA._id), String(match.userB._id)].includes(String(req.user._id))) return res.status(403).json({ success: false, message: "You are not a participant in this match" });
    const [plain] = await participantPhotos([match]);
    res.json({ success: true, message: "Match retrieved", data: plain });
  } catch (error) { next(error); }
};

const getMyMatches = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
      hiddenFor: { $nin: [req.user._id] },
    };
    const [matches, total] = await Promise.all([
      Match.find(filter).populate("userA", "name gender").populate("userB", "name gender").sort({ score: -1, updatedAt: -1 }).skip(skip).limit(limit),
      Match.countDocuments(filter),
    ]);
    const withPhotos = await participantPhotos(matches);
    res.json({ success: true, message: "Matches retrieved", data: withPhotos, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

const getRecommendations = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    // `getCompatibilityInputs` is async, so it returns a Promise that resolves
    // to [profile, questionnaire, horoscope]. It has to be awaited as a nested
    // element of Promise.all — spreading it (`...getCompatibilityInputs(...)`)
    // throws "not a function or its return value is not iterable", which
    // failed EVERY recommendations request with a 500 before this line even
    // reached the setup check below, so a complete profile and questionnaire
    // still showed no matches. Same pattern as calculateMatch above.
    const [[myProfile, myQuestionnaire, myHoroscope], myUser] = await Promise.all([
      getCompatibilityInputs(req.user._id),
      User.findById(req.user._id).select("gender").lean(),
    ]);
    if (!myProfile?.profileCompleted || !myQuestionnaire?.isComplete()) {
      return res.status(400).json({ success: false, message: "Complete your profile and compatibility questionnaire before viewing recommendations." });
    }

    const profileFilter = { profileCompleted: true };
    if (req.query.city) profileFilter.currentCity = new RegExp(`^${escapeRegExp(String(req.query.city).trim())}$`, "i");
    if (req.query.relationshipGoal) profileFilter.relationshipGoal = req.query.relationshipGoal;
    const profiles = await Profile.find(profileFilter).select("user dateOfBirth currentCity occupation education relationshipGoal about photos").lean();
    const candidateIds = profiles.map((profile) => profile.user).filter((id) => String(id) !== String(req.user._id));
    const userFilter = { _id: { $in: candidateIds }, isActive: true };
    if (req.query.gender) userFilter.gender = req.query.gender;
    const [users, questionnaires, horoscopes] = await Promise.all([
      User.find(userFilter).select("name gender").lean(),
      Questionnaire.find({ user: { $in: candidateIds } }).lean(),
      Horoscope.find({ user: { $in: candidateIds } }).lean(),
    ]);
    const userById = new Map(users.map((user) => [String(user._id), user]));
    const questionnaireById = new Map(questionnaires.map((item) => [String(item.user), item]));
    const horoscopeById = new Map(horoscopes.map((item) => [String(item.user), item]));
    const recommendations = profiles
      .filter((profile) => userById.has(String(profile.user)) && isCompleteQuestionnaire(questionnaireById.get(String(profile.user))))
      .map((profile) => {
        const user = userById.get(String(profile.user));
        // Same A/B ordering as calculateMatch, so the Vedic sign rules get the
        // right gender for each side.
        const [candidateA, candidateB] = orderedUsers(req.user._id, profile.user);
        const genderById = new Map([
          [String(req.user._id), myUser?.gender],
          [String(profile.user), user.gender],
        ]);
        const report = calculateCompatibility({
          profileA: candidateA === String(req.user._id) ? myProfile : profile,
          questionnaireA: candidateA === String(req.user._id) ? myQuestionnaire : questionnaireById.get(String(profile.user)),
          horoscopeA: candidateA === String(req.user._id) ? myHoroscope : horoscopeById.get(String(profile.user)),
          profileB: candidateB === String(req.user._id) ? myProfile : profile,
          questionnaireB: candidateB === String(req.user._id) ? myQuestionnaire : questionnaireById.get(String(profile.user)),
          horoscopeB: candidateB === String(req.user._id) ? myHoroscope : horoscopeById.get(String(profile.user)),
          genderA: genderById.get(String(candidateA)),
          genderB: genderById.get(String(candidateB)),
        });
        return { user, profile, compatibility: { score: report.score, label: report.overallLabel, conclusion: report.overallConclusion, strengths: report.strengths } };
      })
      .sort((first, second) => second.compatibility.score - first.compatibility.score);
    const total = recommendations.length;
    res.json({ success: true, message: "Recommendations retrieved", data: recommendations.slice(skip, skip + limit), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

module.exports = { calculateMatch, respondToMatch, getMatch, getMyMatches, getRecommendations };