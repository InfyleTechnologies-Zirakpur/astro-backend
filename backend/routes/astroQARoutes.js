const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { uploadOptionalImages } = require("../middlewares/uploadMiddleware");
const { ask, getHistory } = require("../controllers/astroQAController");

const router = express.Router();
router.use(protect);
router.post("/ask", uploadOptionalImages, ask);
router.get("/history", getHistory);

module.exports = router;
