const Profile = require("../models/profile");
const User = require("../models/user");
const { uploadProfilePhoto: uploadProfilePhotoToCloudinary, deleteMedia, extractPublicIdFromUrl } = require("../config/cloudinary");

const MAX_PHOTOS = 6;

const profileFields = ["dateOfBirth", "currentCity", "education", "occupation", "relationshipGoal", "about", "photos"];
const buildProfileData = (body) => Object.fromEntries(profileFields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]));

// Ensures the response always carries the ordered `photos` gallery. Older
// documents only store `profilePhoto`, so we backfill `photos` from it.
const serializeProfile = (profile) => {
  if (!profile) return profile;
  const data = typeof profile.toObject === "function" ? profile.toObject() : { ...profile };
  let photos = Array.isArray(data.photos) ? data.photos.filter((photo) => photo) : [];
  if (photos.length === 0 && data.profilePhoto) photos = [data.profilePhoto];
  return { ...data, photos };
};

const createProfile = async (req, res, next) => {
  try {
    const data = buildProfileData(req.body);
    if (Array.isArray(data.photos) && data.photos.length > MAX_PHOTOS) {
      return res.status(400).json({ success: false, message: `A maximum of ${MAX_PHOTOS} photos is allowed` });
    }
    const profile = await Profile.create({ user: req.user._id, ...data, profileCompleted: true });
    if (Array.isArray(profile.photos) && profile.photos.length > 0) profile.profilePhoto = profile.photos[0];
    res.status(201).json({ success: true, message: "Profile created", data: serializeProfile(profile) });
  } catch (error) { next(error); }
};

const getMyProfile = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id });
    if (!profile) return res.status(404).json({ success: false, message: "Profile not found" });
    res.json({ success: true, message: "Profile retrieved", data: serializeProfile(profile) });
  } catch (error) { next(error); }
};

const updateProfile = async (req, res, next) => {
  try {
    const data = buildProfileData(req.body);
    if (Array.isArray(data.photos) && data.photos.length > MAX_PHOTOS) {
      return res.status(400).json({ success: false, message: `A maximum of ${MAX_PHOTOS} photos is allowed` });
    }
    const profile = await Profile.findOneAndUpdate({ user: req.user._id }, { ...data, profileCompleted: true }, { new: true, runValidators: true });
    if (!profile) return res.status(404).json({ success: false, message: "Profile not found" });
    res.json({ success: true, message: "Profile updated", data: serializeProfile(profile) });
  } catch (error) { next(error); }
};

const existingPhotos = (profile) => {
  if (!profile) return [];
  const photos = Array.isArray(profile.photos) ? profile.photos.filter((photo) => photo) : [];
  if (photos.length > 0) return photos;
  return profile.profilePhoto ? [profile.profilePhoto] : [];
};

const savePhotos = async (userId, photos) => {
  const first = photos[0] || null;
  return Profile.findOneAndUpdate(
    { user: userId },
    { $set: { photos, profilePhoto: first } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

// Add one photo to the user's gallery (max 6 total).
const uploadProfilePhoto = async (req, res, next) => {
  try {
    const file = req.file || (req.files?.photo && req.files.photo[0]) || (req.files?.profilePhoto && req.files.profilePhoto[0]);
    if (!file) return res.status(400).json({ success: false, message: "Profile photo is required" });

    const profile = await Profile.findOne({ user: req.user._id });
    const photos = existingPhotos(profile);
    if (photos.length >= MAX_PHOTOS) {
      return res.status(400).json({ success: false, message: `You can add up to ${MAX_PHOTOS} photos` });
    }

    const result = await uploadProfilePhotoToCloudinary(file.buffer, req.user._id);
    const photoUrl = result.secure_url;
    photos.push(photoUrl);
    const updated = await savePhotos(req.user._id, photos);
    res.json({ success: true, message: "Photo added", data: serializeProfile(updated) });
  } catch (error) { next(error); }
};

const deleteProfilePhoto = async (req, res, next) => {
  try {
    const { photo } = req.body || {};
    if (!photo) return res.status(400).json({ success: false, message: "photo path is required" });

    const profile = await Profile.findOne({ user: req.user._id });
    if (!profile) return res.status(404).json({ success: false, message: "Profile not found" });

    const photos = existingPhotos(profile);
    if (!photos.includes(photo)) return res.status(404).json({ success: false, message: "Photo not found" });

    const publicId = extractPublicIdFromUrl(photo);
    if (publicId) {
      await deleteMedia(publicId, "image").catch(() => {});
    }

    const remaining = photos.filter((item) => item !== photo);
    const updated = await savePhotos(req.user._id, remaining);
    res.json({ success: true, message: "Photo removed", data: serializeProfile(updated) });
  } catch (error) { next(error); }
};

// Make a photo the primary (moves it to the front of the gallery).
const setPrimaryPhoto = async (req, res, next) => {
  try {
    const { photo } = req.body || {};
    if (!photo) return res.status(400).json({ success: false, message: "photo path is required" });

    const profile = await Profile.findOne({ user: req.user._id });
    if (!profile) return res.status(404).json({ success: false, message: "Profile not found" });

    const photos = existingPhotos(profile);
    if (!photos.includes(photo)) return res.status(404).json({ success: false, message: "Photo not found" });

    const reordered = [photo, ...photos.filter((item) => item !== photo)];
    const updated = await savePhotos(req.user._id, reordered);
    res.json({ success: true, message: "Primary photo updated", data: serializeProfile(updated) });
  } catch (error) { next(error); }
};

// View another user's full profile (used by match detail / discover).
const getProfileById = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ user: req.params.userId });
    if (!profile) return res.status(404).json({ success: false, message: "Profile not found" });
    const user = await User.findById(req.params.userId).select("name gender").lean();
    res.json({
      success: true,
      message: "Profile retrieved",
      data: { ...serializeProfile(profile), user },
    });
  } catch (error) { next(error); }
};

module.exports = { createProfile, getMyProfile, updateProfile, uploadProfilePhoto, deleteProfilePhoto, setPrimaryPhoto, getProfileById, serializeProfile, MAX_PHOTOS };