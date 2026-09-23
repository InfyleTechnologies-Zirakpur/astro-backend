const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { protect } = require("../middlewares/authMiddleware");
const {
  getChatHistory,
  getMessages,
  sendMessage,
  sendStickerMessage,
  sendMediaMessage,
  deleteMessageForMe,
  deleteMessageForEveryone,
  markMessagesRead,
} = require("../controllers/chatController");

const uploadDirectory = path.join(__dirname, "..", "uploads", "chat-media");
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (req, file, callback) => {
    const extension =
      file.mimetype === "image/png"
        ? ".png"
        : file.mimetype === "image/webp"
          ? ".webp"
          : file.mimetype === "image/gif"
            ? ".gif"
            : file.mimetype === "video/webm"
              ? ".webm"
              : file.mimetype === "video/quicktime"
                ? ".mov"
                : ".mp4";
    callback(null, `${req.user._id}-${Date.now()}${extension}`);
  },
});

const uploadChatMediaFile = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];
    if (!allowed.includes(file.mimetype)) {
      return callback(new Error("Only images (JPEG, PNG, WebP, GIF) and videos (MP4, WebM, MOV) are allowed"));
    }
    callback(null, true);
  },
});

const router = express.Router();
router.use(protect);
router.get("/history", getChatHistory);
router.get("/:matchId/messages", getMessages);
router.post("/:matchId/messages", sendMessage);
router.post("/:matchId/media", uploadChatMediaFile.single("message"), sendMediaMessage);
router.post("/:matchId/sticker", sendStickerMessage);
router.patch("/messages/:messageId/delete-for-me", deleteMessageForMe);
router.patch("/messages/:messageId/delete-for-everyone", deleteMessageForEveryone);
router.patch("/:matchId/messages/read", markMessagesRead);

module.exports = router;