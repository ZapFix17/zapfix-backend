// server.js (CommonJS)
// Full ZapFix backend - Cloudinary + MongoDB + uploads + comments + likes

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json()); // parse JSON bodies

// ---------- CONFIG (use env variables in production) ----------
const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://Zapfix:Zapfix123@cluster0.lx3ihzh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const CLOUD_NAME = process.env.CLOUD_NAME || "dvj0h4vkw";
const CLOUD_API_KEY = process.env.CLOUD_API_KEY || "938482952871232";
const CLOUD_API_SECRET = process.env.CLOUD_API_SECRET || "mVuK4bhXbzJB45Rq-BkGotoQft0";

// ---------- CLOUDINARY ----------
cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: CLOUD_API_KEY,
  api_secret: CLOUD_API_SECRET,
});

// ---------- MONGODB ----------
mongoose
  .connect(MONGO_URI) // no deprecated options
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message || err);
    process.exit(1);
  });

// ---------- SCHEMAS ----------
const CommentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const VideoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: "" },
  thumbnail: { type: String, required: true }, // Cloudinary URL
  video: { type: String, required: true }, // Cloudinary URL
  likes: { type: Number, default: 0 },
  comments: { type: [CommentSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

const Video = mongoose.model("Video", VideoSchema);

// ---------- MULTER + CLOUDINARY STORAGE ----------
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith("video");
    const folder = isVideo ? "zapfix/videos" : "zapfix/thumbnails";
    return {
      folder,
      resource_type: isVideo ? "video" : "image",
      public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, "")}`,
    };
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB max (Cloudinary + Render limits may apply)
  },
});

// ---------- ROUTES ----------

// root / health
app.get("/", (req, res) => {
  res.send("✅ ZapFix backend running");
});

// Upload endpoint: expects multipart form with fields:
// title(string), description(string), thumbnail(file), video(file)
app.post(
  "/upload",
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // Validate
      const { title, description } = req.body || {};
      if (!title || !req.files || !req.files.thumbnail || !req.files.video) {
        return res.status(400).json({
          success: false,
          message: "Missing fields: title and both files (thumbnail + video) are required.",
        });
      }

      const thumbFile = req.files.thumbnail[0];
      const videoFile = req.files.video[0];

      // thumbFile.path and videoFile.path are Cloudinary delivered URLs
      const newVideo = new Video({
        title: title.trim(),
        description: (description || "").trim(),
        thumbnail: thumbFile.path,
        video: videoFile.path,
      });

      await newVideo.save();

      return res.json({ success: true, message: "Upload successful", video: newVideo });
    } catch (err) {
      console.error("Upload error:", err);
      // Send helpful error message for debugging
      const errMsg = err && err.message ? err.message : "Upload failed";
      return res.status(500).json({ success: false, message: "Upload failed", error: errMsg });
    }
  }
);

// Get all videos (for feed)
app.get("/videos", async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    return res.json({ success: true, videos });
  } catch (err) {
    console.error("Fetch videos error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch videos" });
  }
});

// Get a single video by id
app.get("/videos/:id", async (req, res) => {
  try {
    const v = await Video.findById(req.params.id);
    if (!v) return res.status(404).json({ success: false, message: "Video not found" });
    return res.json({ success: true, video: v });
  } catch (err) {
    console.error("Fetch video error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch video" });
  }
});

// Post a comment for a video (persisted in MongoDB)
app.post("/videos/:id/comments", async (req, res) => {
  try {
    const { name, text } = req.body || {};
    if (!name || !text) return res.status(400).json({ success: false, message: "Name and text required" });

    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: "Video not found" });

    video.comments.push({ name: name.trim(), text: text.trim() });
    await video.save();

    return res.json({ success: true, comments: video.comments });
  } catch (err) {
    console.error("Add comment error:", err);
    return res.status(500).json({ success: false, message: "Failed to add comment" });
  }
});

// Increment like count
app.post("/videos/:id/like", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: "Video not found" });

    video.likes = (video.likes || 0) + 1;
    await video.save();

    return res.json({ success: true, likes: video.likes });
  } catch (err) {
    console.error("Like error:", err);
    return res.status(500).json({ success: false, message: "Failed to like" });
  }
});

// Simple suggestions endpoint (returns other videos)
app.get("/videos/:id/suggestions", async (req, res) => {
  try {
    const all = await Video.find().sort({ createdAt: -1 });
    // exclude current id
    const suggestions = all.filter((v) => v._id.toString() !== req.params.id).slice(0, 20);
    return res.json({ success: true, suggestions });
  } catch (err) {
    console.error("Suggestions error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch suggestions" });
  }
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
