const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const uploadAiImages = require("../middlewares/aiImageUpload");
const { ask, getHistory } = require("../controllers/astroQAController");

const router = express.Router();
router.use(protect);
router.post("/ask", uploadAiImages, ask);
router.get("/history", getHistory);

module.exports = router;
