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
const { kundliMatch } = require("../controllers/kundliMatchController");

const router = express.Router();

// The console's Kundli Milan: both partners' birth details in, the 36-point
// Ashtakoot Guna Milan out. Accessible to both regular clients (legacy fallback) and astrologers.
router.post("/kundli-match", protect, kundliMatch);

router.use(protect, astrologerOnly);
router.patch("/availability", updateAvailability);
router.patch("/profile", updateOwnProfile);
router.get("/chats", getAstrologerChats);
router.get("/queue", getAstrologerQueue);
router.get("/earnings", getEarnings);

module.exports = router;
