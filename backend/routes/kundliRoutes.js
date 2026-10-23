const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { kundliMatch } = require("../controllers/kundliMatchController");

const router = express.Router();
// Every signed-in person may run a match — the Kundli Milan is a reading for
// the customer, not something only the astrologer console can do.
router.use(protect);
router.post("/match", kundliMatch);

module.exports = router;
