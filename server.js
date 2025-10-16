const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// --- MongoDB Setup ---
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error("❌ MongoDB error:", err));

// --- Cloudinary Setup ---
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// --- MongoDB Schema ---
const videoSchema = new mongoose.Schema({
  title: String,
  description: String,
  thumbnail: String,
  video: String,
  createdAt: { type: Date, default: Date.now },
});
const Video = mongoose.model("Video", videoSchema);

// --- Multer Setup ---
const storage = multer.memoryStorage();
const upload = multer({ storage });

// --- Routes ---

// Health check
app.get("/", (req, res) => {
  res.send("ZapFix backend is running! ✅");
});

// Upload video
app.post("/upload", upload.fields([{ name: "thumbnail" }, { name: "video" }]), async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !description || !req.files.thumbnail || !req.files.video) {
      return res.json({ success: false, message: "All fields are required" });
    }

    const uploadToCloudinary = (file, type) => {
      return new Promise((resolve, reject) => {
        const stream = type === "image"
          ? cloudinary.uploader.upload_stream({ folder: "zapfix_thumbnails" }, (err, result) => err ? reject(err) : resolve(result))
          : cloudinary.uploader.upload_stream({ resource_type: "video", folder: "zapfix_videos" }, (err, result) => err ? reject(err) : resolve(result));
        stream.end(file.buffer);
      });
    };

    // Upload to Cloudinary
    const thumbUpload = await uploadToCloudinary(req.files.thumbnail[0], "image");
    const videoUpload = await uploadToCloudinary(req.files.video[0], "video");

    // Save in MongoDB
    const newVideo = new Video({
      title,
      description,
      thumbnail: thumbUpload.secure_url,
      video: videoUpload.secure_url,
    });
    await newVideo.save();

    res.json({
      success: true,
      message: "Uploaded successfully!",
      thumbnail: thumbUpload.secure_url,
      video: videoUpload.secure_url,
    });
  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.json({ success: false, message: "Upload failed", error: err.message });
  }
});

// 🟢 Get all videos
app.get("/videos", async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    res.json({ success: true, videos });
  } catch (err) {
    console.error("❌ Fetch error:", err);
    res.json({ success: false, message: "Cannot fetch videos", error: err.message });
  }
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
