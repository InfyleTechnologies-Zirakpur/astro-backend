const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { upsertProfile, getProfile, ask, getHistory } = require("../controllers/numerologyController");

const router = express.Router();
router.use(protect);
router.put("/profile", upsertProfile);
router.get("/profile", getProfile);
router.post("/ask", ask);
router.get("/history", getHistory);

module.exports = router;
