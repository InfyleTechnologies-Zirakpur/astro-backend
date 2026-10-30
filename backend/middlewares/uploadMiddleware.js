const multer = require("multer");

const storage = multer.memoryStorage();

const uploadOptionalImages = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
      return callback(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
    }
    callback(null, true);
  },
}).fields([
  { name: "images", maxCount: 5 },
  { name: "image", maxCount: 1 },
]);

module.exports = {
  uploadOptionalImages,
};
