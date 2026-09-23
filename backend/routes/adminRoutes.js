const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { adminProtect } = require("../middlewares/adminMiddleware");
const {
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
} = require("../controllers/adminController");

const router = express.Router();

router.post("/login", adminLogin);

router.use(protect, adminProtect);

router.get("/me", adminMe);
router.get("/stats", getStats);

// Users
router.get("/users", listUsers);
router.get("/users/:userId", getUserDetail);
router.patch("/users/:userId/status", updateUserStatus);
router.patch("/users/:userId/role", updateUserRole);
router.delete("/users/:userId", deleteUser);

// Profiles
router.get("/profiles", listProfiles);
router.get("/profiles/user/:userId", getProfileDetail);

// Matches
router.get("/matches", listMatches);
router.get("/matches/:matchId", getMatchDetail);
router.patch("/matches/:matchId/status", updateMatchStatus);

// Messages / conversations
router.get("/messages", listMessages);
router.get("/conversations", listConversations);
router.delete("/messages/:messageId", deleteMessage);

// Questionnaires
router.get("/questionnaires", listQuestionnaires);

// Horoscopes
router.get("/horoscopes", listHoroscopes);
router.get("/horoscopes/user/:userId", getHoroscopeDetail);

// Astro conversations
router.get("/astro-conversations", listAstroConversations);

// Device tokens
router.get("/device-tokens", listDeviceTokens);
router.patch("/device-tokens/:tokenId", deactivateDeviceToken);

module.exports = router;