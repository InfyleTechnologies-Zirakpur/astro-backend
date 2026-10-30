const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { uploadOptionalImages } = require("../middlewares/uploadMiddleware");
const { upsertProfile, getProfile, ask, getHistory, getBilling } = require("../controllers/numerologyController");

const router = express.Router();
router.use(protect);
router.put("/profile", upsertProfile);
router.get("/profile", getProfile);
router.post("/ask", uploadOptionalImages, ask);
router.get("/history", getHistory);
router.get("/billing", getBilling);

module.exports = router;
