const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { astrologerOnly } = require("../middlewares/roleMiddleware");
const {
  updateAvailability,
  updateOwnProfile,
  getAstrologerChats,
  getAstrologerQueue,
  getEarnings,
} = require("../controllers/astrologerController");

const router = express.Router();
router.use(protect, astrologerOnly);
router.patch("/availability", updateAvailability);
router.patch("/profile", updateOwnProfile);
router.get("/chats", getAstrologerChats);
router.get("/queue", getAstrologerQueue);
router.get("/earnings", getEarnings);

module.exports = router;
