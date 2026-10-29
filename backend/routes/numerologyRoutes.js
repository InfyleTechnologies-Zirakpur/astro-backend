const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const uploadAiImages = require("../middlewares/aiImageUpload");
const { upsertProfile, getProfile, ask, getHistory, getBilling } = require("../controllers/numerologyController");

const router = express.Router();
router.use(protect);
router.put("/profile", upsertProfile);
router.get("/profile", getProfile);
router.post("/ask", uploadAiImages, ask);
router.get("/history", getHistory);
router.get("/billing", getBilling);

module.exports = router;
