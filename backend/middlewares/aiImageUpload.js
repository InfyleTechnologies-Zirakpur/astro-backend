const multer = require("multer");

const uploadAiImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 4,
  },
  fileFilter: (req, file, callback) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    if (!allowed.includes(file.mimetype)) {
      return callback(
        new Error("Only JPEG, PNG, WebP, or HEIC images are allowed"),
      );
    }
    callback(null, true);
  },
}).array("images", 4);

module.exports = uploadAiImages;
