const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { uploadOptionalImages } = require("../middlewares/uploadMiddleware");
const { ask, getHistory } = require("../controllers/astroQAController");

const router = express.Router();
router.use(protect);
// Multipart form-data with optional image attachments (palmistry photos,
// chart screenshots) — JSON bodies pass through the middleware untouched.
router.post("/ask", uploadOptionalImages, ask);
router.get("/history", getHistory);

module.exports = router;
