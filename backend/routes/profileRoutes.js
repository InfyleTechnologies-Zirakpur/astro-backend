const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { protect } = require("../middlewares/authMiddleware");
const { createProfile, getMyProfile, updateProfile, uploadProfilePhoto, deleteProfilePhoto, setPrimaryPhoto, getProfileById } = require("../controllers/profileController");

const uploadDirectory = path.join(__dirname, "..", "uploads", "profile-photos");
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
	destination: uploadDirectory,
	filename: (req, file, callback) => {
		const extension = file.mimetype === "image/png" ? ".png" : file.mimetype === "image/webp" ? ".webp" : ".jpg";
		callback(null, `${req.user._id}-${Date.now()}${extension}`);
	},
});

const uploadProfilePhotoFile = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (req, file, callback) => {
		if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) return callback(new Error("Only JPEG, PNG, and WebP images are allowed"));
		callback(null, true);
	},
});

const router = express.Router();
router.use(protect);
router.post("/", createProfile);
router.get("/me", getMyProfile);
router.put("/", updateProfile);
// Accepts either the "photo" or the legacy "profilePhoto" file field.
router.post("/photo", uploadProfilePhotoFile.fields([{ name: "photo", maxCount: 1 }, { name: "profilePhoto", maxCount: 1 }]), uploadProfilePhoto);
router.delete("/photo", deleteProfilePhoto);
router.post("/photo/primary", setPrimaryPhoto);
router.get("/user/:userId", getProfileById);
module.exports = router;