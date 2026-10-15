const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { astrologerOnly } = require("../middlewares/roleMiddleware");
const {
  requestConsultation,
  endConsultation,
  getConsultationStatus,
  submitReview,
  respondToQueue,
  cancelQueueEntry,
} = require("../controllers/consultationController");

const router = express.Router();
router.use(protect);

router.post("/request", requestConsultation);
router.post("/:matchId/end", endConsultation);
router.get("/:matchId/status", getConsultationStatus);
router.post("/:matchId/review", submitReview);
router.post("/queue/:queueId/respond", astrologerOnly, respondToQueue);
router.delete("/queue/:queueId", cancelQueueEntry);

module.exports = router;
