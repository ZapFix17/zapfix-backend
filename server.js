import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Connect MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// Multer Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folder = "ZapFix";
    let resource_type = "auto";
    return {
      folder: folder,
      resource_type: resource_type,
    };
  },
});
const upload = multer({ storage: storage });

// Schema
const videoSchema = new mongoose.Schema({
  title: String,
  description: String,
  thumbnail: String,
  videoUrl: String,
});
const Video = mongoose.model("Video", videoSchema);

// Upload route
app.post("/api/upload", upload.fields([{ name: "thumbnail" }, { name: "video" }]), async (req, res) => {
  try {
    const thumbnail = req.files["thumbnail"][0].path;
    const videoUrl = req.files["video"][0].path;

    const newVideo = new Video({
      title: req.body.title,
      description: req.body.description,
      thumbnail,
      videoUrl,
    });

    await newVideo.save();
    res.status(200).json({ message: "✅ Uploaded successfully!" });
  } catch (error) {
    console.error("❌ Upload Error:", error);
    res.status(500).json({ error: "Upload failed!" });
  }
});

// Fetch all videos
app.get("/api/videos", async (req, res) => {
  try {
    const videos = await Video.find().sort({ _id: -1 });
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

app.get("/", (req, res) => res.send("ZapFix backend is running"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
