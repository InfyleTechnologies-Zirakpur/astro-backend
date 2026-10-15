const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const {
  listAstrologers,
  getAstrologerDetail,
  listReviews,
} = require("../controllers/astrologerController");

const router = express.Router();
router.use(protect);
router.get("/", listAstrologers);
router.get("/:id", getAstrologerDetail);
router.get("/:id/reviews", listReviews);

module.exports = router;
