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

// Multer's `.fields()` stores files as { images: [File], image: [File] }, but
// the RAG services consume a flat Array<{buffer, mimetype}>. Collapse the
// object into one array (and tolerate plain `.array()` uploads too).
const flattenUploadedImages = (files) => {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
};

module.exports = {
  uploadOptionalImages,
  flattenUploadedImages,
};
