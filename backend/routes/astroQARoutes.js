const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { ask, getHistory } = require("../controllers/astroQAController");

const router = express.Router();
router.use(protect);
router.post("/ask", ask);
router.get("/history", getHistory);

module.exports = router;
