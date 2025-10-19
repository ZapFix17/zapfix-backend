// server.js (CommonJS)
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" })); // allow JSON body if needed

// ---------- Configuration (use .env in production) ----------
const CLOUD_NAME = process.env.CLOUD_NAME || "dvj0h4vkw";
const CLOUD_API_KEY = process.env.CLOUD_API_KEY || "938482952871232";
const CLOUD_API_SECRET = process.env.CLOUD_API_SECRET || "mVuK4bhXbzJB45Rq-BkGotoQft0";
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://Zapfix:Zapfix123@cluster0.lx3ihzh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const PORT = process.env.PORT || 5000;

// ---------- Cloudinary config ----------
cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: CLOUD_API_KEY,
  api_secret: CLOUD_API_SECRET,
});

// ---------- MongoDB connection ----------
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ---------- Mongoose schema ----------
const CommentSchema = new mongoose.Schema({
  name: String,
  text: String,
  createdAt: { type: Date, default: Date.now },
});

const VideoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  thumbnail: { type: String, required: true },
  video: { type: String, required: true },
  likes: { type: Number, default: 0 },
  comments: [CommentSchema],
  createdAt: { type: Date, default: Date.now },
});

const Video = mongoose.model("Video", VideoSchema);

// ---------- Multer + Cloudinary storage ----------
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith("video");
    return {
      folder: isVideo ? "zapfix/videos" : "zapfix/thumbnails",
      resource_type: isVideo ? "video" : "image",
      public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, "")}`,
    };
  },
});

const upload = multer({ storage });

// ---------- Routes ----------

// root
app.get("/", (req, res) => {
  res.send("✅ ZapFix backend running");
});

// upload (multipart/form-data) - expects fields: title, description, thumbnail (file), video (file)
app.post("/upload", upload.fields([{ name: "thumbnail" }, { name: "video" }]), async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: "Title and description required" });
    }
    if (!req.files || !req.files.thumbnail || !req.files.video) {
      return res.status(400).json({ success: false, message: "Thumbnail and video files required" });
    }

    const thumbFile = req.files.thumbnail[0];
    const videoFile = req.files.video[0];

    // thumbFile.path and videoFile.path are Cloudinary URLs when using multer-storage-cloudinary
    const newVideo = new Video({
      title,
      description,
      thumbnail: thumbFile.path,
      video: videoFile.path,
    });

    await newVideo.save();

    return res.json({ success: true, message: "Upload saved", video: newVideo });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, message: "Upload failed", error: err.message });
  }
});

// get all videos (returns array of videos)
app.get("/videos", async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    res.json({ success: true, videos });
  } catch (err) {
    console.error("Fetch videos error:", err);
    res.status(500).json({ success: false, message: "Cannot fetch videos" });
  }
});

// get single video by id
app.get("/videos/:id", async (req, res) => {
  try {
    const v = await Video.findById(req.params.id);
    if (!v) return res.status(404).json({ success: false, message: "Video not found" });
    res.json({ success: true, video: v });
  } catch (err) {
    console.error("Fetch single video error:", err);
    res.status(500).json({ success: false, message: "Error" });
  }
});

// post a comment for a video
app.post("/videos/:id/comments", async (req, res) => {
  try {
    const { name, text } = req.body;
    if (!name || !text) return res.status(400).json({ success: false, message: "Name and text required" });

    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: "Video not found" });

    video.comments.push({ name, text });
    await video.save();

    res.json({ success: true, comments: video.comments });
  } catch (err) {
    console.error("Add comment error:", err);
    res.status(500).json({ success: false, message: "Failed to add comment" });
  }
});

// increment like (returns new like count)
app.post("/videos/:id/like", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: "Video not found" });
    video.likes = (video.likes || 0) + 1;
    await video.save();
    res.json({ success: true, likes: video.likes });
  } catch (err) {
    console.error("Like error:", err);
    res.status(500).json({ success: false, message: "Failed to like" });
  }
});

// ---------- start server ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
