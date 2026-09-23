const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { createHoroscope, getMyHoroscope, updateHoroscope } = require("../controllers/horoscopeController");

const router = express.Router();
router.use(protect);
router.post("/", createHoroscope);
router.get("/me", getMyHoroscope);
router.put("/", updateHoroscope);
module.exports = router;
