const express = require("express");
const { protect, optionalProtect } = require("../middlewares/authMiddleware");
const uploadAiImages = require("../middlewares/aiImageUpload");
const { kundliMatch } = require("../controllers/kundliMatchController");
const {
  calculateKundli,
  getMyKundli,
  getCategories,
  chatKundli,
} = require("../controllers/kundliController");

const router = express.Router();

// Public / Guest accessible endpoints (supports optional token for auto-saving)
router.post("/calculate", optionalProtect, calculateKundli);
router.get("/categories", getCategories);
router.post("/chat", optionalProtect, uploadAiImages, chatKundli);

// Authenticated user endpoints
router.get("/my-kundli", protect, getMyKundli);
router.post("/match", protect, kundliMatch);

module.exports = router;
