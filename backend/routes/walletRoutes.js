const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const {
  getBalance,
  recharge,
  createRechargeOrder,
  verifyRecharge,
  rechargeWebhook,
  listTransactions,
} = require("../controllers/walletController");

const router = express.Router();

// Webhook must be reachable without auth; signature verified in controller.
// Note: server.js captures req.rawBody for this route before JSON parsing.
router.post("/webhook", rechargeWebhook);

router.use(protect);
router.get("/me", getBalance);
router.post("/recharge", recharge); // legacy mock, guarded (dev only)
router.post("/recharge/order", createRechargeOrder);
router.post("/recharge/verify", verifyRecharge);
router.get("/transactions", listTransactions);

module.exports = router;
