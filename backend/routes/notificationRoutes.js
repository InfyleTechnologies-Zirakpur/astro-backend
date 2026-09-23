const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const {
  registerDeviceToken,
  removeDeviceToken,
  removeAllDeviceTokens,
  getMyDeviceTokens,
  sendTestNotification,
} = require("../controllers/notificationController");

const router = express.Router();

router.use(protect);

router.post("/token", registerDeviceToken);
router.delete("/token", removeDeviceToken);
router.post("/token/remove-all", removeAllDeviceTokens);
router.get("/token", getMyDeviceTokens);
router.post("/test", sendTestNotification);

module.exports = router;