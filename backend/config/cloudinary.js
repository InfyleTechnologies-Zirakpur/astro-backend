const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadProfilePhoto(buffer, userId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `astro/profile-photos/${userId}`,
        resource_type: "image",
        transformation: [
          { width: 800, height: 800, crop: "limit", quality: "auto", fetch_format: "auto" }
        ],
        public_id: `${userId}-${Date.now()}`,
      },
      (error, result) => error ? reject(error) : resolve(result)
    );
    uploadStream.end(buffer);
  });
}

async function uploadChatMedia(buffer, userId, mimetype) {
  const isVideo = mimetype.startsWith("video/");
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `astro/chat-media/${userId}`,
        resource_type: isVideo ? "video" : "image",
        transformation: isVideo
          ? [{ quality: "auto", fetch_format: "auto" }]
          : [{ width: 1200, height: 1200, crop: "limit", quality: "auto", fetch_format: "auto" }],
        public_id: `${userId}-${Date.now()}`,
      },
      (error, result) => error ? reject(error) : resolve(result)
    );
    uploadStream.end(buffer);
  });
}

async function deleteMedia(publicId, resourceType = "image") {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

function extractPublicIdFromUrl(url) {
  if (!url) return null;
  const parts = url.split("/");
  const filename = parts[parts.length - 1];
  const folderParts = parts.slice(parts.indexOf("astro"));
  if (folderParts.length > 0) {
    return folderParts.join("/").replace(/\.[^/.]+$/, "");
  }
  return filename.replace(/\.[^/.]+$/, "");
}

module.exports = { cloudinary, uploadProfilePhoto, uploadChatMedia, deleteMedia, extractPublicIdFromUrl };