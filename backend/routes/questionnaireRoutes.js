const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { createQuestionnaire, getMyQuestionnaire, updateQuestionnaire } = require("../controllers/questionnaireController");

const router = express.Router();
router.use(protect);
router.post("/", createQuestionnaire);
router.get("/me", getMyQuestionnaire);
router.put("/", updateQuestionnaire);
module.exports = router;