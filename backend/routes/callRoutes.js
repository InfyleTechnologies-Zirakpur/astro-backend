const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { createCallToken } = require("../controllers/callController");

const router = express.Router();

router.use(protect);
router.post("/:matchId/token", createCallToken);

module.exports = router;