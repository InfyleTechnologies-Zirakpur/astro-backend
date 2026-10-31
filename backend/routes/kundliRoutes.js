const express = require("express");
const { protect, optionalProtect } = require("../middlewares/authMiddleware");
const { uploadOptionalImages } = require("../middlewares/uploadMiddleware");
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
// Multipart form-data with optional chart images — JSON bodies (where
// birthDetails is an object) pass through the middleware untouched.
router.post("/chat", optionalProtect, uploadOptionalImages, chatKundli);

// Authenticated user endpoints
router.get("/my-kundli", protect, getMyKundli);
router.post("/match", protect, kundliMatch);

module.exports = router;
